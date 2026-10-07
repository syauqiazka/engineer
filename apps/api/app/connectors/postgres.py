"""
Konektor PostgreSQL menggunakan psycopg v3 (MIT) + SQLAlchemy (MIT).
Mendukung: catalog, schema, preview, read (streaming), write, explain.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from app.connectors.base import (
    Batch,
    Capabilities,
    CatalogNode,
    ColumnInfo,
    Schema,
    ScanEstimate,
    TableRef,
    TestResult,
    WriteMode,
    WriteResult,
)

PG_CAPABILITIES = Capabilities(
    supports_sql=True,
    supports_write=True,
    supports_pushdown=True,
    is_streaming=False,
    has_schema=True,
    supports_explain=True,
)


class PostgresConnector:
    """
    Konektor PostgreSQL nyata via psycopg v3.
    Kredensial tidak pernah dikirim balik ke frontend (route hanya menyimpan id koneksi).
    """

    kind: str = "postgres"
    capabilities: Capabilities = PG_CAPABILITIES

    def __init__(
        self,
        host: str,
        port: int = 5432,
        database: str = "postgres",
        username: str = "postgres",
        password: str = "",
        read_only: bool = True,
        connect_timeout: int = 10,
    ):
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password
        self.read_only = read_only
        self.connect_timeout = connect_timeout

    def _conninfo(self) -> str:
        return (
            f"host={self.host} port={self.port} dbname={self.database} "
            f"user={self.username} password={self.password} "
            f"connect_timeout={self.connect_timeout}"
        )

    def _connect(self):
        import psycopg  # noqa: PLC0415

        conn = psycopg.connect(self._conninfo())
        if self.read_only:
            conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        return conn

    # ------------------------------------------------------------------
    # Connector Protocol
    # ------------------------------------------------------------------

    def test(self) -> TestResult:
        import time  # noqa: PLC0415

        t0 = time.perf_counter()
        try:
            conn = self._connect()
            row = conn.execute("SELECT version()").fetchone()
            latency_ms = (time.perf_counter() - t0) * 1000
            conn.close()
            version = str(row[0]) if row else "PostgreSQL"
            return TestResult(
                success=True,
                message=f"Berhasil terhubung ke PostgreSQL di {self.host}:{self.port}",
                server_version=version.split(",")[0],
                latency_ms=round(latency_ms, 2),
                read_only=self.read_only,
            )
        except Exception as e:  # noqa: BLE001
            return TestResult(success=False, message=str(e))

    def catalog(self, path: list[str]) -> list[CatalogNode]:
        """Kembalikan hierarki database > schema > tabel."""
        conn = self._connect()
        try:
            if not path:
                # Level database
                rows = conn.execute(
                    "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
                ).fetchall()
                return [CatalogNode(name=r[0], node_type="database") for r in rows]

            if len(path) == 1:
                # Level schema
                rows = conn.execute(
                    "SELECT schema_name FROM information_schema.schemata "
                    "WHERE catalog_name = %s AND schema_name NOT IN ('pg_catalog','information_schema','pg_toast') "
                    "ORDER BY schema_name",
                    (path[0],),
                ).fetchall()
                return [CatalogNode(name=r[0], node_type="schema") for r in rows]

            if len(path) >= 2:
                # Level tabel
                db, schema = path[0], path[1]
                rows = conn.execute(
                    "SELECT table_name, table_type FROM information_schema.tables "
                    "WHERE table_catalog = %s AND table_schema = %s ORDER BY table_name",
                    (db, schema),
                ).fetchall()
                return [
                    CatalogNode(
                        name=r[0],
                        node_type="table" if r[1] == "BASE TABLE" else "view",
                        table_ref=TableRef(database=db, schema=schema, table=r[0]),
                    )
                    for r in rows
                ]
        finally:
            conn.close()
        return []

    def schema(self, ref: TableRef) -> Schema:
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT column_name, data_type, is_nullable FROM information_schema.columns "
                "WHERE table_catalog = %s AND table_schema = %s AND table_name = %s "
                "ORDER BY ordinal_position",
                (ref.database or self.database, ref.schema or "public", ref.table),
            ).fetchall()
            return Schema(
                columns=[
                    ColumnInfo(name=r[0], data_type=r[1], nullable=(r[2] == "YES")) for r in rows
                ]
            )
        finally:
            conn.close()

    def preview(self, ref: TableRef, limit: int = 100) -> Batch:
        conn = self._connect()
        try:
            schema = ref.schema or "public"
            cur = conn.execute(f'SELECT * FROM "{schema}"."{ref.table}" LIMIT %s', (limit,))
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
            return Batch(columns=cols, rows=[list(r) for r in rows], total_rows=len(rows))
        finally:
            conn.close()

    def read(self, query: str, chunk_rows: int = 1000) -> Iterator[Batch]:
        import psycopg  # noqa: PLC0415

        conn = self._connect()
        try:
            with conn.cursor(name="read_cursor") as cur:
                cur.execute(query)
                cols = [d[0] for d in cur.description]
                while True:
                    rows = cur.fetchmany(chunk_rows)
                    if not rows:
                        break
                    yield Batch(columns=cols, rows=[list(r) for r in rows])
        finally:
            conn.close()

    def write(self, ref: TableRef, batches: Iterator[Batch], mode: WriteMode) -> WriteResult:
        if self.read_only:
            return WriteResult(
                success=False, rows_written=0, message="Koneksi ini bersifat read-only."
            )
        import psycopg  # noqa: PLC0415

        conn = self._connect()
        schema = ref.schema or "public"
        total = 0
        try:
            first_batch = next(batches, None)
            if first_batch is None:
                return WriteResult(success=True, rows_written=0)

            if mode == WriteMode.OVERWRITE:
                conn.execute(f'TRUNCATE TABLE "{schema}"."{ref.table}"')

            cols = ", ".join(f'"{c}"' for c in first_batch.columns)
            placeholders = ", ".join(["%s"] * len(first_batch.columns))
            insert_sql = (
                f'INSERT INTO "{schema}"."{ref.table}" ({cols}) VALUES ({placeholders})'
            )

            with conn.cursor() as cur:
                cur.executemany(insert_sql, [tuple(r) for r in first_batch.rows])
                total += len(first_batch.rows)
                for batch in batches:
                    cur.executemany(insert_sql, [tuple(r) for r in batch.rows])
                    total += len(batch.rows)

            conn.commit()
            return WriteResult(success=True, rows_written=total)
        except Exception as e:  # noqa: BLE001
            conn.rollback()
            return WriteResult(success=False, rows_written=0, message=str(e))
        finally:
            conn.close()

    def estimate_scan(self, query: str) -> ScanEstimate | None:
        conn = self._connect()
        try:
            explain_sql = f"EXPLAIN (FORMAT JSON) {query}"
            row = conn.execute(explain_sql).fetchone()
            if not row:
                return None
            import json  # noqa: PLC0415

            plan = json.loads(row[0])[0]["Plan"]
            rows = int(plan.get("Plan Rows", 0))
            width = int(plan.get("Plan Width", 0))
            return ScanEstimate(estimated_rows=rows, estimated_bytes=rows * width)
        except Exception:  # noqa: BLE001
            return None
        finally:
            conn.close()
