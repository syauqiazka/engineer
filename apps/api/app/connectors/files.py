"""
Konektor file: CSV/TSV, Excel (xlsx/xls), JSON, NDJSON, Parquet.
Semua format didaftarkan sebagai tabel DuckDB di workspace engine.
Lisensi dependensi: openpyxl (MIT), python-calamine (MIT), pyarrow (Apache-2.0).
"""

from __future__ import annotations

import mimetypes
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import duckdb

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

# Tipe MIME dan ekstensi yang didukung
SUPPORTED_EXTENSIONS = {".csv", ".tsv", ".txt", ".xlsx", ".xls", ".json", ".ndjson", ".parquet"}

FILE_CAPABILITIES = Capabilities(
    supports_sql=False,
    supports_write=False,
    supports_pushdown=False,
    is_streaming=False,
    has_schema=True,
    supports_explain=False,
)


class FileConnector:
    """
    Konektor untuk membaca file lokal ke dalam DuckDB workspace.
    Mengimplementasikan Connector Protocol (connectors/base.py).
    """

    kind: str = "files"
    capabilities: Capabilities = FILE_CAPABILITIES

    def __init__(self, file_path: str | Path):
        self.file_path = Path(file_path)
        if not self.file_path.exists():
            raise FileNotFoundError(f"File tidak ditemukan: {file_path}")
        self._ext = self.file_path.suffix.lower()
        if self._ext not in SUPPORTED_EXTENSIONS:
            raise ValueError(
                f"Format tidak didukung: {self._ext}. "
                f"Format yang didukung: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
            )

    # ------------------------------------------------------------------
    # Connector Protocol
    # ------------------------------------------------------------------

    def test(self) -> TestResult:
        try:
            con = duckdb.connect(":memory:")
            rel = self._read_to_duckdb(con)
            count = rel.count("*").fetchone()[0]
            return TestResult(
                success=True,
                message=f"File dapat dibaca: {count} baris ditemukan.",
                latency_ms=0.5,
                read_only=True,
            )
        except Exception as e:  # noqa: BLE001
            return TestResult(success=False, message=str(e))

    def catalog(self, path: list[str]) -> list[CatalogNode]:
        return [
            CatalogNode(
                name=self.file_path.stem,
                node_type="file",
                table_ref=TableRef(table=self.file_path.stem),
            )
        ]

    def schema(self, ref: TableRef) -> Schema:
        con = duckdb.connect(":memory:")
        rel = self._read_to_duckdb(con)
        return Schema(
            columns=[
                ColumnInfo(name=col, data_type=dtype, nullable=True)
                for col, dtype in zip(rel.columns, rel.dtypes, strict=False)
            ]
        )

    def preview(self, ref: TableRef, limit: int = 100) -> Batch:
        con = duckdb.connect(":memory:")
        rel = self._read_to_duckdb(con)
        rows = rel.limit(limit).fetchall()
        return Batch(columns=list(rel.columns), rows=[list(r) for r in rows], total_rows=len(rows))

    def read(self, query: str, chunk_rows: int = 1000) -> Iterator[Batch]:
        con = duckdb.connect(":memory:")
        rel = self._read_to_duckdb(con)
        offset = 0
        total = rel.count("*").fetchone()[0]
        while offset < total:
            chunk = rel.limit(chunk_rows, offset).fetchall()
            if not chunk:
                break
            yield Batch(
                columns=list(rel.columns),
                rows=[list(r) for r in chunk],
                total_rows=total,
            )
            offset += chunk_rows

    def write(
        self,
        ref: TableRef,
        batches: Iterator[Batch],
        mode: WriteMode,
    ) -> WriteResult:
        return WriteResult(
            success=False, rows_written=0, message="Konektor file bersifat read-only."
        )

    def estimate_scan(self, query: str) -> ScanEstimate | None:
        try:
            con = duckdb.connect(":memory:")
            rel = self._read_to_duckdb(con)
            count = rel.count("*").fetchone()[0]
            return ScanEstimate(estimated_rows=count, estimated_bytes=self.file_path.stat().st_size)
        except Exception:  # noqa: BLE001
            return None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _read_to_duckdb(self, con: duckdb.DuckDBPyConnection) -> Any:
        """Baca file ke DuckDB relation sesuai format."""
        path_str = str(self.file_path).replace("\\", "/")

        if self._ext in (".csv", ".tsv", ".txt"):
            sep = "\t" if self._ext == ".tsv" else ","
            return con.execute(
                f"SELECT * FROM read_csv_auto('{path_str}', sep='{sep}', header=true)"
            )

        elif self._ext in (".xlsx", ".xls"):
            # DuckDB bisa baca Excel via spatial extension atau fallback ke pandas/openpyxl
            return self._read_excel_via_pandas(con, path_str)

        elif self._ext == ".json":
            return con.execute(f"SELECT * FROM read_json_auto('{path_str}')")

        elif self._ext == ".ndjson":
            return con.execute(f"SELECT * FROM read_ndjson_auto('{path_str}')")

        elif self._ext == ".parquet":
            return con.execute(f"SELECT * FROM read_parquet('{path_str}')")

        else:
            raise ValueError(f"Format tidak dikenali: {self._ext}")

    def _read_excel_via_pandas(self, con: duckdb.DuckDBPyConnection, path_str: str) -> Any:
        """Baca Excel via pandas/openpyxl lalu register ke DuckDB."""
        try:
            import pandas as pd

            df = pd.read_excel(path_str, engine="openpyxl")
            con.register("_excel_tmp", df)
            return con.execute("SELECT * FROM _excel_tmp")
        except ImportError:
            raise ImportError("Instal pandas dan openpyxl untuk membaca file Excel.")

    # ------------------------------------------------------------------
    # Utilitas publik: register ke workspace DuckDB
    # ------------------------------------------------------------------

    def register_to_workspace(
        self, workspace_conn: duckdb.DuckDBPyConnection, table_name: str | None = None
    ) -> str:
        """
        Baca file dan daftarkan sebagai tabel permanen di workspace DuckDB.
        Kembalikan nama tabel yang dibuat.
        """
        name = table_name or self.file_path.stem
        # Sanitasi nama tabel
        safe_name = "".join(c if c.isalnum() or c == "_" else "_" for c in name)
        if safe_name[0].isdigit():
            safe_name = f"t_{safe_name}"

        path_str = str(self.file_path).replace("\\", "/")

        if self._ext in (".csv", ".tsv", ".txt"):
            sep = "\t" if self._ext == ".tsv" else ","
            workspace_conn.execute(
                f'CREATE OR REPLACE TABLE "{safe_name}" AS '
                f"SELECT * FROM read_csv_auto('{path_str}', sep='{sep}', header=true)"
            )

        elif self._ext in (".xlsx", ".xls"):
            import pandas as pd

            df = pd.read_excel(path_str, engine="openpyxl")
            workspace_conn.register("_excel_import_tmp", df)
            workspace_conn.execute(
                f'CREATE OR REPLACE TABLE "{safe_name}" AS SELECT * FROM _excel_import_tmp'
            )
            workspace_conn.unregister("_excel_import_tmp")

        elif self._ext == ".json":
            workspace_conn.execute(
                f'CREATE OR REPLACE TABLE "{safe_name}" AS '
                f"SELECT * FROM read_json_auto('{path_str}')"
            )

        elif self._ext == ".ndjson":
            workspace_conn.execute(
                f'CREATE OR REPLACE TABLE "{safe_name}" AS '
                f"SELECT * FROM read_ndjson_auto('{path_str}')"
            )

        elif self._ext == ".parquet":
            workspace_conn.execute(
                f'CREATE OR REPLACE TABLE "{safe_name}" AS '
                f"SELECT * FROM read_parquet('{path_str}')"
            )

        return safe_name


def detect_format(filename: str, content_type: str | None = None) -> str:
    """Deteksi format file dari nama dan MIME type."""
    ext = Path(filename).suffix.lower()
    if ext in SUPPORTED_EXTENSIONS:
        return ext
    if content_type:
        mime_ext = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ""
        if mime_ext in SUPPORTED_EXTENSIONS:
            return mime_ext
    return ext


def read_file_bytes_to_workspace(
    file_bytes: bytes,
    filename: str,
    workspace_conn: duckdb.DuckDBPyConnection,
    table_name: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    """
    Tulis bytes ke file sementara, impor ke workspace, hapus file temp.
    Dipakai oleh endpoint upload.
    """
    import tempfile

    ext = detect_format(filename, content_type)
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(f"Format tidak didukung: {filename}")

    # Tulis ke file sementara di direktori workspace
    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = Path(tmp.name)

    try:
        connector = FileConnector(tmp_path)
        actual_name = connector.register_to_workspace(
            workspace_conn,
            table_name=table_name or Path(filename).stem,
        )
        # Hitung statistik
        count_row = workspace_conn.execute(f'SELECT COUNT(*) FROM "{actual_name}"').fetchone()
        col_info = workspace_conn.execute(f'DESCRIBE "{actual_name}"').fetchall()
        return {
            "table_name": actual_name,
            "row_count": int(count_row[0]) if count_row else 0,
            "column_count": len(col_info),
        }
    finally:
        tmp_path.unlink(missing_ok=True)
