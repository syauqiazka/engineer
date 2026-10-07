"""
StorageConnector: Konektor untuk folder lokal dan penyimpanan objek mandiri kompatibel S3 (MinIO, Garage, dll).
Sesuai AGENTS.md Bagian 2.2 & 3 (Fase 2):
- Menggunakan `fsspec` (berlisensi BSD 3-Clause)
- Mendukung protokol local filesystem (`file://`) dan S3 kompatibel self-hosted (`s3://`)
- Katalog file berbasis bucket/prefix
- Membaca dan menulis file tabular (Parquet, CSV, JSON)
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

import fsspec

from app.connectors.base import (
    Batch,
    Capabilities,
    CatalogNode,
    ColumnInfo,
    ScanEstimate,
    Schema,
    TableRef,
    TestResult,
    WriteMode,
    WriteResult,
)

_CAPS = Capabilities(
    supports_sql=False,
    supports_write=True,
    supports_pushdown=False,
    is_streaming=False,
    has_schema=True,
    supports_explain=False,
)


class StorageConnector:
    kind = "storage"
    capabilities = _CAPS

    def __init__(
        self,
        endpoint_url: str = "",
        bucket_or_path: str = "data",
        access_key: str = "",
        secret_key: str = "",
        storage_type: str = "local",
        read_only: bool = True,
    ) -> None:
        self.endpoint_url = endpoint_url
        self.bucket_or_path = bucket_or_path
        self.access_key = access_key
        self.secret_key = secret_key
        self.storage_type = storage_type.lower()
        self.read_only = read_only

    def _get_fs(self) -> tuple[fsspec.AbstractFileSystem, str]:
        if self.storage_type in ("s3", "minio"):
            storage_options: dict[str, Any] = {}
            if self.endpoint_url:
                storage_options["client_kwargs"] = {"endpoint_url": self.endpoint_url}
            if self.access_key:
                storage_options["key"] = self.access_key
            if self.secret_key:
                storage_options["secret"] = self.secret_key

            fs = fsspec.filesystem("s3", **storage_options)
            return fs, self.bucket_or_path.strip("/")
        else:
            fs = fsspec.filesystem("file")
            return fs, self.bucket_or_path

    def test(self) -> TestResult:
        t0 = time.perf_counter()
        try:
            fs, path = self._get_fs()
            exists = fs.exists(path)
            latency = round((time.perf_counter() - t0) * 1000, 2)
            if not exists and self.storage_type == "local":
                fs.makedirs(path, exist_ok=True)
            return TestResult(
                success=True,
                message=f"Penyimpanan '{self.storage_type}' terhubung: {path}",
                server_version=f"fsspec ({self.storage_type})",
                latency_ms=latency,
                read_only=self.read_only,
            )
        except Exception as e:
            return TestResult(
                success=False,
                message=f"Gagal mengakses penyimpanan: {e}",
            )

    def catalog(self, path: list[str]) -> list[CatalogNode]:
        fs, base = self._get_fs()
        target_path = f"{base}/{'/'.join(path)}" if path else base

        nodes: list[CatalogNode] = []
        try:
            if not fs.exists(target_path):
                return []

            items = fs.ls(target_path, detail=True)
            for item in items:
                name = item["name"].split("/")[-1]
                is_dir = item.get("type") == "directory"
                if is_dir:
                    nodes.append(CatalogNode(name=name, node_type="directory"))
                elif any(name.endswith(ext) for ext in (".parquet", ".csv", ".json")):
                    rel_name = name
                    nodes.append(
                        CatalogNode(
                            name=rel_name,
                            node_type="table",
                            table_ref=TableRef(
                                database=self.storage_type,
                                schema=target_path,
                                table=rel_name,
                            ),
                        )
                    )
        except Exception:
            return []
        return nodes

    def schema(self, ref: TableRef) -> Schema:
        import duckdb

        fs, base = self._get_fs()
        full_path = f"{ref.schema}/{ref.table}" if ref.schema else f"{base}/{ref.table}"

        con = duckdb.connect(":memory:")
        try:
            if full_path.endswith(".parquet"):
                desc = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{full_path}')").fetchall()
            elif full_path.endswith(".csv"):
                desc = con.execute(
                    f"DESCRIBE SELECT * FROM read_csv_auto('{full_path}')"
                ).fetchall()
            elif full_path.endswith(".json"):
                desc = con.execute(
                    f"DESCRIBE SELECT * FROM read_json_auto('{full_path}')"
                ).fetchall()
            else:
                desc = con.execute(f"DESCRIBE SELECT * FROM '{full_path}'").fetchall()

            columns = [
                ColumnInfo(name=row[0], data_type=row[1], nullable=row[2] == "YES") for row in desc
            ]
            return Schema(columns=columns)
        except Exception:
            return Schema(columns=[ColumnInfo(name="raw", data_type="VARCHAR", nullable=True)])
        finally:
            con.close()

    def preview(self, ref: TableRef, limit: int = 100) -> Batch:
        import duckdb

        fs, base = self._get_fs()
        full_path = f"{ref.schema}/{ref.table}" if ref.schema else f"{base}/{ref.table}"

        con = duckdb.connect(":memory:")
        try:
            if full_path.endswith(".parquet"):
                df = con.execute(
                    f"SELECT * FROM read_parquet('{full_path}') LIMIT {limit}"
                ).fetchdf()
            elif full_path.endswith(".csv"):
                df = con.execute(
                    f"SELECT * FROM read_csv_auto('{full_path}') LIMIT {limit}"
                ).fetchdf()
            elif full_path.endswith(".json"):
                df = con.execute(
                    f"SELECT * FROM read_json_auto('{full_path}') LIMIT {limit}"
                ).fetchdf()
            else:
                df = con.execute(f"SELECT * FROM '{full_path}' LIMIT {limit}").fetchdf()

            cols = list(df.columns)
            rows = df.values.tolist()
            return Batch(columns=cols, rows=rows, total_rows=len(rows))
        finally:
            con.close()

    def read(self, query: str, chunk_rows: int = 1000) -> Iterator[Batch]:
        import duckdb

        full_path = query.strip().replace('"', "")
        con = duckdb.connect(":memory:")
        try:
            cur = con.cursor()
            if full_path.endswith(".parquet"):
                cur.execute(f"SELECT * FROM read_parquet('{full_path}')")
            elif full_path.endswith(".csv"):
                cur.execute(f"SELECT * FROM read_csv_auto('{full_path}')")
            else:
                cur.execute(f"SELECT * FROM read_json_auto('{full_path}')")

            cols = [desc[0] for desc in cur.description]
            while True:
                rows = cur.fetchmany(chunk_rows)
                if not rows:
                    break
                yield Batch(columns=cols, rows=[list(r) for r in rows])
        finally:
            con.close()

    def write(
        self,
        ref: TableRef,
        batches: Iterator[Batch],
        mode: WriteMode = WriteMode.APPEND,
    ) -> WriteResult:
        if self.read_only:
            return WriteResult(success=False, rows_written=0, message="Penyimpanan read-only.")

        import pandas as pd

        fs, base = self._get_fs()
        full_path = f"{ref.schema}/{ref.table}" if ref.schema else f"{base}/{ref.table}"

        all_rows = []
        cols = []
        for batch in batches:
            if not cols:
                cols = batch.columns
            all_rows.extend(batch.rows)

        df = pd.DataFrame(all_rows, columns=cols)
        with fs.open(full_path, "wb") as f:
            if full_path.endswith(".parquet"):
                df.to_parquet(f, index=False)
            elif full_path.endswith(".json"):
                df.to_json(f, orient="records", indent=2)
            else:
                df.to_csv(f, index=False)

        return WriteResult(
            success=True,
            rows_written=len(all_rows),
            message=f"{len(all_rows)} baris disimpan ke {full_path}.",
        )

    def estimate_scan(self, query: str) -> ScanEstimate | None:
        return None
