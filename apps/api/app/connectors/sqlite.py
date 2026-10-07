"""
SQLiteConnector: konektor untuk file database SQLite.
Menggunakan sqlite3 bawaan Python — tanpa dependensi tambahan.
"""

from __future__ import annotations

import sqlite3
import time
from collections.abc import Iterator
from pathlib import Path

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
    supports_sql=True,
    supports_write=True,
    supports_pushdown=True,
    is_streaming=False,
    has_schema=True,
    supports_explain=False,
)

_TYPE_MAP: dict[str, str] = {
    "INTEGER": "INTEGER",
    "INT": "INTEGER",
    "TINYINT": "INTEGER",
    "SMALLINT": "INTEGER",
    "BIGINT": "BIGINT",
    "REAL": "DOUBLE",
    "FLOAT": "DOUBLE",
    "NUMERIC": "DOUBLE",
    "DECIMAL": "DOUBLE",
    "TEXT": "VARCHAR",
    "CHAR": "VARCHAR",
    "VARCHAR": "VARCHAR",
    "BLOB": "BLOB",
    "BOOLEAN": "BOOLEAN",
    "DATE": "DATE",
    "DATETIME": "TIMESTAMP",
    "TIMESTAMP": "TIMESTAMP",
}


def _normalize_type(raw: str) -> str:
    upper = raw.upper().split("(")[0].strip()
    return _TYPE_MAP.get(upper, "VARCHAR")


class SQLiteConnector:
    kind = "sqlite"
    capabilities = _CAPS

    def __init__(self, db_path: str, read_only: bool = False) -> None:
        self._path = Path(db_path).resolve()
        self._read_only = read_only

    def _connect(self) -> sqlite3.Connection:
        uri = f"file:{self._path}?mode={'ro' if self._read_only else 'rwc'}"
        return sqlite3.connect(uri, uri=True, check_same_thread=False)

    def test(self) -> TestResult:
        t0 = time.perf_counter()
        try:
            if not self._path.exists():
                return TestResult(
                    success=False,
                    message=f"File tidak ditemukan: {self._path}",
                )
            con = self._connect()
            version = con.execute("SELECT sqlite_version()").fetchone()[0]
            con.close()
            return TestResult(
                success=True,
                message=f"SQLite tersambung: {self._path.name}",
                server_version=f"SQLite {version}",
                latency_ms=round((time.perf_counter() - t0) * 1000, 2),
                read_only=self._read_only,
            )
        except Exception as e:  # noqa: BLE001
            return TestResult(success=False, message=str(e))

    def catalog(self, path: list[str]) -> list[CatalogNode]:
        """SQLite: satu level — langsung daftar tabel dan view."""
        con = self._connect()
        rows = con.execute(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"
        ).fetchall()
        con.close()
        return [
            CatalogNode(
                name=r[0],
                node_type="table" if r[1] == "table" else "view",
                table_ref=TableRef(database=str(self._path), schema=None, table=r[0]),
            )
            for r in rows
        ]

    def schema(self, ref: TableRef) -> Schema:
        con = self._connect()
        rows = con.execute(f"PRAGMA table_info('{ref.table}')").fetchall()
        con.close()
        columns = [
            ColumnInfo(
                name=r[1],
                data_type=_normalize_type(r[2] or "TEXT"),
                nullable=not r[3],
            )
            for r in rows
        ]
        return Schema(columns=columns)

    def preview(self, ref: TableRef, limit: int = 100) -> Batch:
        con = self._connect()
        cur = con.execute(f'SELECT * FROM "{ref.table}" LIMIT {limit}')
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        con.close()
        return Batch(
            columns=cols,
            rows=[list(r) for r in rows],
            total_rows=len(rows),
        )

    def read(self, query: str, chunk_rows: int = 1000) -> Iterator[Batch]:
        con = self._connect()
        cur = con.execute(query)
        cols = [d[0] for d in cur.description]
        while True:
            rows = cur.fetchmany(chunk_rows)
            if not rows:
                break
            yield Batch(columns=cols, rows=[list(r) for r in rows])
        con.close()

    def write(
        self,
        ref: TableRef,
        batches: Iterator[Batch],
        mode: WriteMode = WriteMode.APPEND,
    ) -> WriteResult:
        if self._read_only:
            return WriteResult(success=False, rows_written=0, message="Koneksi read-only.")

        con = self._connect()
        total = 0

        for i, batch in enumerate(batches):
            if i == 0:
                if mode == WriteMode.OVERWRITE:
                    con.execute(f'DROP TABLE IF EXISTS "{ref.table}"')
                    cols_ddl = ", ".join(f'"{c}" TEXT' for c in batch.columns)
                    con.execute(f'CREATE TABLE IF NOT EXISTS "{ref.table}" ({cols_ddl})')

            placeholders = ", ".join("?" * len(batch.columns))
            col_names = ", ".join(f'"{c}"' for c in batch.columns)
            con.executemany(
                f'INSERT INTO "{ref.table}" ({col_names}) VALUES ({placeholders})',
                [tuple(r) for r in batch.rows],
            )
            total += len(batch.rows)

        con.commit()
        con.close()
        return WriteResult(success=True, rows_written=total, message=f"{total} baris ditulis.")

    def estimate_scan(self, query: str) -> ScanEstimate | None:
        return None
