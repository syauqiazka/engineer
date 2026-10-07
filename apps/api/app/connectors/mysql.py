"""
Konektor MySQL/MariaDB menggunakan PyMySQL (MIT).
Mendukung: catalog, schema, preview, read, write, explain.
"""

from __future__ import annotations

from collections.abc import Iterator

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

MYSQL_CAPABILITIES = Capabilities(
    supports_sql=True,
    supports_write=True,
    supports_pushdown=True,
    is_streaming=False,
    has_schema=True,
    supports_explain=True,
)


class MySQLConnector:
    """
    Konektor MySQL/MariaDB nyata via PyMySQL.
    """

    kind: str = "mysql"
    capabilities: Capabilities = MYSQL_CAPABILITIES

    def __init__(
        self,
        host: str,
        port: int = 3306,
        database: str = "",
        username: str = "root",
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

    def _connect(self):
        import pymysql
        import pymysql.cursors

        conn = pymysql.connect(
            host=self.host,
            port=self.port,
            database=self.database or None,
            user=self.username,
            password=self.password,
            connect_timeout=self.connect_timeout,
            cursorclass=pymysql.cursors.DictCursor,
            charset="utf8mb4",
        )
        if self.read_only:
            with conn.cursor() as cur:
                cur.execute("SET SESSION TRANSACTION READ ONLY")
        return conn

    def test(self) -> TestResult:
        import time

        t0 = time.perf_counter()
        try:
            conn = self._connect()
            with conn.cursor() as cur:
                cur.execute("SELECT VERSION()")
                row = cur.fetchone()
            latency_ms = (time.perf_counter() - t0) * 1000
            conn.close()
            version = str(row["VERSION()"] if row else "MySQL")
            return TestResult(
                success=True,
                message=f"Berhasil terhubung ke MySQL di {self.host}:{self.port}",
                server_version=f"MySQL {version}",
                latency_ms=round(latency_ms, 2),
                read_only=self.read_only,
            )
        except Exception as e:  # noqa: BLE001
            return TestResult(success=False, message=str(e))

    def catalog(self, path: list[str]) -> list[CatalogNode]:
        conn = self._connect()
        try:
            if not path:
                with conn.cursor() as cur:
                    cur.execute("SHOW DATABASES")
                    rows = cur.fetchall()
                skip = {"information_schema", "performance_schema", "mysql", "sys"}
                return [
                    CatalogNode(name=r["Database"], node_type="database")
                    for r in rows
                    if r["Database"] not in skip
                ]

            db = path[0]
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES "
                    "WHERE TABLE_SCHEMA = %s ORDER BY TABLE_NAME",
                    (db,),
                )
                rows = cur.fetchall()
            return [
                CatalogNode(
                    name=r["TABLE_NAME"],
                    node_type="table" if r["TABLE_TYPE"] == "BASE TABLE" else "view",
                    table_ref=TableRef(database=db, table=r["TABLE_NAME"]),
                )
                for r in rows
            ]
        finally:
            conn.close()

    def schema(self, ref: TableRef) -> Schema:
        conn = self._connect()
        try:
            db = ref.database or self.database
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM information_schema.COLUMNS "
                    "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s ORDER BY ORDINAL_POSITION",
                    (db, ref.table),
                )
                rows = cur.fetchall()
            return Schema(
                columns=[
                    ColumnInfo(
                        name=r["COLUMN_NAME"],
                        data_type=r["DATA_TYPE"],
                        nullable=(r["IS_NULLABLE"] == "YES"),
                    )
                    for r in rows
                ]
            )
        finally:
            conn.close()

    def preview(self, ref: TableRef, limit: int = 100) -> Batch:
        import pymysql.cursors

        conn = self._connect()
        try:
            db = ref.database or self.database
            with conn.cursor(pymysql.cursors.Cursor) as cur:
                tbl = f"`{db}`.`{ref.table}`" if db else f"`{ref.table}`"
                cur.execute(f"SELECT * FROM {tbl} LIMIT %s", (limit,))
                cols = [d[0] for d in cur.description]
                rows = cur.fetchall()
            return Batch(columns=cols, rows=[list(r) for r in rows], total_rows=len(rows))
        finally:
            conn.close()

    def read(self, query: str, chunk_rows: int = 1000) -> Iterator[Batch]:
        import pymysql.cursors

        conn = self._connect()
        try:
            with conn.cursor(pymysql.cursors.SSCursor) as cur:
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
            return WriteResult(success=False, rows_written=0, message="Koneksi ini read-only.")

        conn = self._connect()
        db = ref.database or self.database
        tbl = f"`{db}`.`{ref.table}`" if db else f"`{ref.table}`"
        total = 0
        try:
            first_batch = next(batches, None)
            if first_batch is None:
                return WriteResult(success=True, rows_written=0)

            if mode == WriteMode.OVERWRITE:
                with conn.cursor() as cur:
                    cur.execute(f"TRUNCATE TABLE {tbl}")

            cols_escaped = ", ".join(f"`{c}`" for c in first_batch.columns)
            placeholders = ", ".join(["%s"] * len(first_batch.columns))
            insert_sql = f"INSERT INTO {tbl} ({cols_escaped}) VALUES ({placeholders})"

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
            with conn.cursor() as cur:
                cur.execute(f"EXPLAIN FORMAT=JSON {query}")
                row = cur.fetchone()
            if not row:
                return None
            import json

            plan_key = list(row.keys())[0]
            plan = json.loads(row[plan_key])
            rows_est = int(plan.get("query_block", {}).get("select_id", 0))
            return ScanEstimate(estimated_rows=rows_est, estimated_bytes=rows_est * 100)
        except Exception:  # noqa: BLE001
            return None
        finally:
            conn.close()
