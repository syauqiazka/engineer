"""
Local Data Warehouse engine built on DuckDB + Parquet + Atomic Manifests.
Implements single-node warehouse requirements:
- Atomic append, overwrite, merge
- Hive-style partitioning
- Compaction (merge small parquet files)
- Vacuum (cleanup obsolete versions)
- In-process DuckDB query pushdown
"""

from __future__ import annotations

import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

from app.connectors.base import Batch, WriteMode, WriteResult
from app.warehouse.manifest import ParquetFileInfo, TableManifest, TableManifestManager


class LocalWarehouseManager:
    """
    Gudang Data Lokal (Self-made Local Data Warehouse).
    Single-node warehouse storage engine using DuckDB + Parquet partitioned tables.
    """

    def __init__(self, root_dir: str | Path | None = None):
        if not root_dir:
            workspace_dir = Path(os.getenv("WORKSPACE_DIR", "./workspace_data"))
            self.root_dir = workspace_dir / "warehouse"
        else:
            self.root_dir = Path(root_dir)

        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.staging_dir = self.root_dir / "_staging"
        self.staging_dir.mkdir(parents=True, exist_ok=True)
        self.duck = duckdb.connect(":memory:")

        # Initialize sample warehouse table if empty
        self._init_samples_if_empty()

    def _init_samples_if_empty(self) -> None:
        """Seed sample local warehouse table with Indonesian logistics context."""
        sample_name = "dw_pengiriman_logistik"
        table_dir = self.root_dir / sample_name
        if not table_dir.exists():
            columns = [
                {"name": "id_pengiriman", "data_type": "VARCHAR", "nullable": False},
                {"name": "kurir", "data_type": "VARCHAR", "nullable": True},
                {"name": "kota_asal", "data_type": "VARCHAR", "nullable": True},
                {"name": "kota_tujuan", "data_type": "VARCHAR", "nullable": True},
                {"name": "berat_kg", "data_type": "DOUBLE", "nullable": True},
                {"name": "ongkir", "data_type": "DOUBLE", "nullable": True},
                {"name": "status", "data_type": "VARCHAR", "nullable": True},
                {"name": "tanggal", "data_type": "VARCHAR", "nullable": False},
            ]
            rows = [
                [
                    "EXP-001",
                    "JNE Reguler",
                    "Jakarta Barat",
                    "Surabaya",
                    2.5,
                    45000.0,
                    "Terkirim",
                    "2026-03-01",
                ],
                [
                    "EXP-002",
                    "SiCepat Best",
                    "Bandung",
                    "Semarang",
                    1.2,
                    28000.0,
                    "Terkirim",
                    "2026-03-01",
                ],
                [
                    "EXP-003",
                    "J&T Express",
                    "Jakarta Selatan",
                    "Medan",
                    5.0,
                    115000.0,
                    "Dalam Perjalanan",
                    "2026-03-02",
                ],
                [
                    "EXP-004",
                    "Anteraja Reguler",
                    "Yogyakarta",
                    "Denpasar",
                    3.1,
                    72000.0,
                    "Terkirim",
                    "2026-03-02",
                ],
                [
                    "EXP-005",
                    "Ninja Xpress",
                    "Surabaya",
                    "Makassar",
                    4.0,
                    96000.0,
                    "Terkirim",
                    "2026-03-03",
                ],
                [
                    "EXP-006",
                    "JNE Cargo",
                    "Bekasi",
                    "Palembang",
                    15.0,
                    185000.0,
                    "Proses Sortir",
                    "2026-03-03",
                ],
            ]
            batch = Batch(columns=[str(c["name"]) for c in columns], rows=rows)
            self.write_table(
                table_name=sample_name,
                batch=batch,
                mode=WriteMode.OVERWRITE,
                partition_columns=["tanggal"],
                message="Initial seed data logistik",
            )

    def _get_table_dir(self, table_name: str) -> Path:
        return self.root_dir / table_name

    def list_tables(self) -> list[dict[str, Any]]:
        """List all tables registered in local warehouse."""
        tables: list[dict[str, Any]] = []
        for p in self.root_dir.iterdir():
            if p.is_dir() and not p.name.startswith("_"):
                mm = TableManifestManager(p)
                current = mm.get_current_manifest()
                if current:
                    tables.append(
                        {
                            "name": current.table_name,
                            "version": current.version,
                            "total_rows": current.total_rows,
                            "total_bytes": current.total_bytes,
                            "file_count": len(current.files),
                            "partition_columns": current.partition_columns,
                            "updated_at": current.created_at,
                            "last_operation": current.operation,
                        }
                    )
        return tables

    def get_table_details(self, table_name: str) -> dict[str, Any] | None:
        """Get table manifest, schema, file details, and version history."""
        table_dir = self._get_table_dir(table_name)
        if not table_dir.exists():
            return None
        mm = TableManifestManager(table_dir)
        current = mm.get_current_manifest()
        if not current:
            return None
        history = mm.get_version_history()
        return {
            "manifest": current.to_dict(),
            "history": history,
            "table_dir": str(table_dir),
            "notice": "Berjalan di satu mesin (DuckDB + Parquet). Untuk skala terdistribusi lebih besar, gunakan Spark atau ClickHouse.",
        }

    def write_table(
        self,
        table_name: str,
        batch: Batch,
        mode: WriteMode = WriteMode.APPEND,
        merge_keys: list[str] | None = None,
        partition_columns: list[str] | None = None,
        message: str = "",
    ) -> WriteResult:
        """
        Atomic write of a batch to warehouse using staging + atomic manifest commit.
        Supports APPEND, OVERWRITE, and MERGE (upsert by merge_keys).
        """
        table_dir = self._get_table_dir(table_name)
        table_dir.mkdir(parents=True, exist_ok=True)
        mm = TableManifestManager(table_dir)
        current = mm.get_current_manifest()

        next_version = (current.version + 1) if current else 1
        effective_partition_cols = partition_columns or (
            current.partition_columns if current else []
        )

        # Construct PyArrow Table from incoming Batch
        arrays = []
        schema_fields = []
        for col_idx, col_name in enumerate(batch.columns):
            col_values = [row[col_idx] for row in batch.rows]
            pa_arr = pa.array(col_values)
            arrays.append(pa_arr)
            schema_fields.append(pa.field(col_name, pa_arr.type))

        incoming_pa_table = pa.Table.from_arrays(arrays, schema=pa.schema(schema_fields))

        # Handle Write Modes
        if mode == WriteMode.MERGE and current and merge_keys:
            # Load current active data into DuckDB and execute full merge
            current_files = [
                Path(table_dir / f.path).as_posix()
                for f in current.files
                if (table_dir / f.path).exists()
            ]
            if current_files:
                paths_sql = "[" + ", ".join(f"'{p}'" for p in current_files) + "]"
                hive_opt = ", hive_partitioning=1" if effective_partition_cols else ""
                self.duck.register("incoming_merge", incoming_pa_table)
                self.duck.execute(
                    f"CREATE OR REPLACE VIEW current_view AS SELECT * FROM read_parquet({paths_sql}{hive_opt})"
                )

                # Exclude matched keys and union
                key_match_cond = " AND ".join([f"c.{k} = i.{k}" for k in merge_keys])
                merged_arrow = self.duck.execute(f"""
                    SELECT * FROM current_view c
                    WHERE NOT EXISTS (
                        SELECT 1 FROM incoming_merge i WHERE {key_match_cond}
                    )
                    UNION ALL
                    SELECT * FROM incoming_merge
                """).arrow()
                incoming_pa_table = (
                    merged_arrow.read_all() if hasattr(merged_arrow, "read_all") else merged_arrow
                )
                self.duck.unregister("incoming_merge")

        # Write to staging directory first
        stage_id = str(uuid.uuid4())[:8]
        stage_table_dir = self.staging_dir / f"{table_name}_{stage_id}"
        stage_table_dir.mkdir(parents=True, exist_ok=True)

        new_files: list[ParquetFileInfo] = []

        if effective_partition_cols and any(
            p in incoming_pa_table.column_names for p in effective_partition_cols
        ):
            # Hive partitioning
            pq.write_to_dataset(
                incoming_pa_table,
                root_path=str(stage_table_dir),
                partition_cols=effective_partition_cols,
                use_dictionary=True,
                compression="snappy",
            )
            # Find generated parquet files in stage
            for p in stage_table_dir.rglob("*.parquet"):
                rel_path = p.relative_to(stage_table_dir)
                dest_file = table_dir / rel_path
                dest_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, dest_file)
                file_size = dest_file.stat().st_size
                # Read row count from metadata
                meta = pq.read_metadata(str(dest_file))
                new_files.append(
                    ParquetFileInfo(
                        path=str(rel_path).replace("\\", "/"),
                        row_count=meta.num_rows,
                        size_bytes=file_size,
                    )
                )
        else:
            # Single file write
            part_filename = f"part-{int(time.time())}-{stage_id}.parquet"
            stage_file = stage_table_dir / part_filename
            pq.write_table(incoming_pa_table, str(stage_file), compression="snappy")
            dest_file = table_dir / part_filename
            shutil.copy2(stage_file, dest_file)
            file_size = dest_file.stat().st_size
            meta = pq.read_metadata(str(dest_file))
            new_files.append(
                ParquetFileInfo(
                    path=part_filename,
                    row_count=meta.num_rows,
                    size_bytes=file_size,
                )
            )

        # Cleanup staging
        shutil.rmtree(stage_table_dir, ignore_errors=True)

        # Build schema metadata
        schema_dicts = [
            {"name": f.name, "data_type": str(f.type), "nullable": f.nullable}
            for f in incoming_pa_table.schema
        ]

        if mode == WriteMode.APPEND and current:
            committed_files = list(current.files) + new_files
            total_rows = current.total_rows + incoming_pa_table.num_rows
            total_bytes = current.total_bytes + sum(f.size_bytes for f in new_files)
        else:
            # OVERWRITE or MERGE: files list becomes the newly written files
            committed_files = new_files
            total_rows = sum(f.row_count for f in new_files)
            total_bytes = sum(f.size_bytes for f in new_files)

        new_manifest = TableManifest(
            table_name=table_name,
            version=next_version,
            schema=schema_dicts,
            partition_columns=effective_partition_cols,
            files=committed_files,
            total_rows=total_rows,
            total_bytes=total_bytes,
            created_at=time.time(),
            operation=mode.value,
            message=message
            or f"Write {mode.value} v{next_version} ({incoming_pa_table.num_rows} rows)",
        )

        # Atomic commit
        mm.commit_manifest(new_manifest)

        return WriteResult(
            success=True,
            rows_written=incoming_pa_table.num_rows,
            message=f"Berhasil menulis {incoming_pa_table.num_rows} baris ke '{table_name}' versi {next_version} (mode {mode.value}).",
        )

    def compaction(self, table_name: str, target_file_size_mb: int = 64) -> dict[str, Any]:
        """
        Consolidates small parquet files into optimal single/fewer parquet files.
        Generates a new manifest version pointing to compacted files.
        """
        table_dir = self._get_table_dir(table_name)
        if not table_dir.exists():
            raise FileNotFoundError(f"Tabel '{table_name}' tidak ditemukan.")

        mm = TableManifestManager(table_dir)
        current = mm.get_current_manifest()
        if not current:
            raise ValueError(f"Tabel '{table_name}' belum memiliki manifest aktif.")

        if len(current.files) <= 1:
            return {
                "success": True,
                "message": f"Tabel '{table_name}' sudah optimal ({len(current.files)} berkas). Tidak perlu compaction.",
                "compacted_files_count": len(current.files),
            }

        # Read all active files through DuckDB
        active_paths = [
            Path(table_dir / f.path).as_posix()
            for f in current.files
            if (table_dir / f.path).exists()
        ]
        if not active_paths:
            raise FileNotFoundError("Tidak ada berkas Parquet aktif yang ditemukan di disk.")

        paths_sql = "[" + ", ".join(f"'{p}'" for p in active_paths) + "]"
        hive_opt = ", hive_partitioning=1" if current.partition_columns else ""
        consolidated_arrow = self.duck.execute(
            f"SELECT * FROM read_parquet({paths_sql}{hive_opt})"
        ).arrow()
        if hasattr(consolidated_arrow, "read_all"):
            consolidated_arrow = consolidated_arrow.read_all()

        # Write consolidated file
        compaction_id = str(uuid.uuid4())[:8]
        compacted_filename = f"compacted-{int(time.time())}-{compaction_id}.parquet"
        dest_file = table_dir / compacted_filename
        pq.write_table(consolidated_arrow, str(dest_file), compression="snappy")

        meta = pq.read_metadata(str(dest_file))
        new_file_info = ParquetFileInfo(
            path=compacted_filename,
            row_count=meta.num_rows,
            size_bytes=dest_file.stat().st_size,
        )

        next_version = current.version + 1
        new_manifest = TableManifest(
            table_name=table_name,
            version=next_version,
            schema=current.schema,
            partition_columns=current.partition_columns,
            files=[new_file_info],
            total_rows=new_file_info.row_count,
            total_bytes=new_file_info.size_bytes,
            created_at=time.time(),
            operation="compaction",
            message=f"Compaction menggabungkan {len(current.files)} berkas menjadi 1 berkas optimal.",
        )

        mm.commit_manifest(new_manifest)

        return {
            "success": True,
            "version": next_version,
            "previous_files_count": len(current.files),
            "new_files_count": 1,
            "total_rows": new_file_info.row_count,
            "saved_bytes": max(0, current.total_bytes - new_file_info.size_bytes),
            "message": f"Compaction selesai: {len(current.files)} berkas digabung menjadi 1 berkas ({new_file_info.row_count} baris).",
        }

    def vacuum(self, table_name: str, retention_versions: int = 3) -> dict[str, Any]:
        """
        Removes orphan and historical Parquet files that are older than retention policy.
        Preserves active files of versions >= (current_version - retention_versions).
        """
        table_dir = self._get_table_dir(table_name)
        if not table_dir.exists():
            raise FileNotFoundError(f"Tabel '{table_name}' tidak ditemukan.")

        mm = TableManifestManager(table_dir)
        current = mm.get_current_manifest()
        if not current:
            raise ValueError(f"Tabel '{table_name}' tidak memiliki manifest.")

        min_retained_version = max(1, current.version - retention_versions)

        # Collect all active file paths from retained versions
        retained_paths: set[str] = set()
        for v_file in mm.manifests_dir.glob("v*.json"):
            try:
                v_num = int(v_file.stem.lstrip("v"))
                if v_num >= min_retained_version:
                    data = TableManifest.from_dict(json.loads(v_file.read_text(encoding="utf-8")))
                    for f in data.files:
                        retained_paths.add((table_dir / f.path).resolve().as_posix())
            except Exception:
                continue

        # Always retain files in current manifest
        for f in current.files:
            retained_paths.add((table_dir / f.path).resolve().as_posix())

        # Scan disk for all parquet files
        deleted_count = 0
        freed_bytes = 0
        for p in table_dir.rglob("*.parquet"):
            if p.resolve().as_posix() not in retained_paths:
                file_size = p.stat().st_size
                p.unlink()
                deleted_count += 1
                freed_bytes += file_size

        return {
            "success": True,
            "deleted_files_count": deleted_count,
            "freed_bytes": freed_bytes,
            "min_retained_version": min_retained_version,
            "current_version": current.version,
            "message": f"Vacuum berhasil menghapus {deleted_count} berkas kedaluwarsa ({freed_bytes / (1024 * 1024):.2f} MB dibebaskan).",
        }

    def query_table(
        self, table_name: str, sql_filter: str | None = None, limit: int = 100
    ) -> dict[str, Any]:
        """Query table directly from Parquet files with DuckDB pushdown."""
        table_dir = self._get_table_dir(table_name)
        mm = TableManifestManager(table_dir)
        current = mm.get_current_manifest()
        if not current or not current.files:
            return {"columns": [], "rows": [], "total_rows": 0, "execution_time_ms": 0.0}

        active_paths = [
            Path(table_dir / f.path).as_posix()
            for f in current.files
            if (table_dir / f.path).exists()
        ]
        if not active_paths:
            return {"columns": [], "rows": [], "total_rows": 0, "execution_time_ms": 0.0}

        start_time = time.time()
        paths_sql = "[" + ", ".join(f"'{p}'" for p in active_paths) + "]"
        hive_opt = ", hive_partitioning=1" if current.partition_columns else ""
        where_clause = f"WHERE {sql_filter}" if sql_filter else ""
        query = f"SELECT * FROM read_parquet({paths_sql}{hive_opt}) {where_clause} LIMIT {limit}"

        res = self.duck.execute(query)
        columns = [desc[0] for desc in res.description]
        rows = [list(r) for r in res.fetchall()]
        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "columns": columns,
            "rows": rows,
            "total_rows": current.total_rows,
            "execution_time_ms": elapsed_ms,
            "version": current.version,
        }


_WAREHOUSE_MANAGER: LocalWarehouseManager | None = None


def get_warehouse_manager() -> LocalWarehouseManager:
    global _WAREHOUSE_MANAGER
    if _WAREHOUSE_MANAGER is None:
        _WAREHOUSE_MANAGER = LocalWarehouseManager()
    return _WAREHOUSE_MANAGER
