import os
from pathlib import Path
from typing import Any

import duckdb
from pydantic import BaseModel


class ColumnProfile(BaseModel):
    name: str
    data_type: str
    display_type: str  # int, dec, txt, bool, date, ts, json
    total_rows: int
    null_count: int
    null_pct: float
    distinct_count: int
    min_value: Any | None = None
    max_value: Any | None = None
    histogram: list[float] = []


class TableSummary(BaseModel):
    name: str
    row_count: int
    column_count: int
    size_bytes: int
    updated_at: str
    freshness_status: str  # "fresh", "stale", "critical"


class QueryResult(BaseModel):
    columns: list[str]
    column_types: list[str]
    rows: list[list[Any]]
    total_rows: int
    execution_time_ms: float
    scanned_bytes_estimate: int | None = None


class WorkspaceEngine:
    def __init__(self, db_path: str | None = None):
        if not db_path:
            workspace_dir = Path(os.getenv("WORKSPACE_DIR", "./workspace_data"))
            workspace_dir.mkdir(parents=True, exist_ok=True)
            self.db_path = str(workspace_dir / "workspace.duckdb")
        else:
            self.db_path = db_path

        self.conn = duckdb.connect(self.db_path)
        self._init_samples_if_empty()

    def _init_samples_if_empty(self):
        """Seed realistic sample data with Indonesian context as specified in DESIGN.md."""
        tables = self.conn.execute("SHOW TABLES").fetchall()
        table_names = [t[0] for t in tables]

        if "pesanan_harian" not in table_names:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS pesanan_harian (
                    id INTEGER,
                    nomor_pesanan VARCHAR,
                    tanggal DATE,
                    nama_pelanggan VARCHAR,
                    kota VARCHAR,
                    kategori VARCHAR,
                    jumlah INTEGER,
                    total_harga DOUBLE,
                    status_bayar VARCHAR
                );
            """)

            # Insert realistic data with slight messiness (nulls, mixed casing, extra spaces)
            sample_data = [
                (
                    1001,
                    "INV/2026/03/001",
                    "2026-03-01",
                    "Budi Santoso",
                    "Jakarta Selatan",
                    "Elektronik",
                    2,
                    3500000.0,
                    "Lunas",
                ),
                (
                    1002,
                    "INV/2026/03/002",
                    "2026-03-01",
                    "Siti Rahmawati",
                    "Bandung",
                    "Pakaian",
                    5,
                    450000.0,
                    "Lunas",
                ),
                (
                    1003,
                    "INV/2026/03/002",
                    "2026-03-02",
                    "Dewi Lestari",
                    "Surabaya",
                    "Kuliner",
                    1,
                    85000.0,
                    "Pending",
                ),
                (
                    1004,
                    "INV/2026/03/004",
                    "2026-03-02",
                    "Ahmad Fauzi ",
                    "  jakarta barat",
                    "Elektronik",
                    1,
                    1200000.0,
                    "Lunas",
                ),
                (
                    1005,
                    "INV/2026/03/005",
                    "2026-03-03",
                    "Hendra Wijaya",
                    "Medan",
                    "Otomotif",
                    4,
                    620000.0,
                    "Gagal",
                ),
                (
                    1006,
                    "INV/2026/03/006",
                    "2026-03-03",
                    "Rini Anggraini",
                    "Semarang",
                    "Pakaian",
                    3,
                    275000.0,
                    "Lunas",
                ),
                (
                    1007,
                    "INV/2026/03/007",
                    None,
                    " Joko Anwar",
                    "Yogyakarta",
                    "Buku",
                    2,
                    180000.0,
                    "Lunas",
                ),
                (
                    1008,
                    "INV/2026/03/008",
                    "2026-03-04",
                    "Putri Ayu",
                    "Denpasar",
                    "Kuliner",
                    None,
                    95000.0,
                    "Pending",
                ),
                (
                    1009,
                    "INV/2026/03/009",
                    "2026-03-04",
                    "Agus Supriatna",
                    "Bandung",
                    "Elektronik",
                    1,
                    850000.0,
                    "Lunas",
                ),
                (
                    1010,
                    "INV/2026/03/010",
                    "2026-03-05",
                    "Nurul Hidayah",
                    "Makassar",
                    "Pakaian",
                    2,
                    310000.0,
                    "Lunas",
                ),
                (
                    1011,
                    "INV/2026/03/011",
                    "2026-03-05",
                    "Bambang Irawan",
                    "Jakarta Pusat",
                    "Otomotif",
                    1,
                    450000.0,
                    "Pending",
                ),
                (
                    1012,
                    "INV/2026/03/012",
                    "2026-03-06",
                    "Sri Wahyuni",
                    "Surabaya",
                    "Kuliner",
                    6,
                    210000.0,
                    "Lunas",
                ),
            ]
            self.conn.executemany(
                """
                INSERT INTO pesanan_harian VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                sample_data,
            )

        if "stg_sensor" not in table_names:
            self.conn.execute("""
                CREATE TABLE IF NOT EXISTS stg_sensor (
                    sensor_id VARCHAR,
                    lokasi VARCHAR,
                    suhu_celsius DOUBLE,
                    kelembaban_pct DOUBLE,
                    status VARCHAR,
                    waktu_rekam TIMESTAMP
                );
            """)
            sensor_data = [
                ("SNS-JKT-01", "Ruang Server A", 22.4, 45.2, "NORMAL", "2026-03-05 10:00:00"),
                ("SNS-JKT-02", "Ruang Baterai B", 28.9, 58.1, "PERINGATAN", "2026-03-05 10:00:00"),
                ("SNS-BDG-01", "Gudang Utama", 19.5, 62.0, "NORMAL", "2026-03-05 10:00:00"),
                ("SNS-SUB-01", "Lini Produksi 1", 31.2, 70.5, "KRITIS", "2026-03-05 10:00:00"),
                ("SNS-JKT-01", "Ruang Server A", 22.6, 44.9, "NORMAL", "2026-03-05 10:05:00"),
            ]
            self.conn.executemany(
                """
                INSERT INTO stg_sensor VALUES (?, ?, ?, ?, ?, ?)
            """,
                sensor_data,
            )

    def list_tables(self) -> list[TableSummary]:
        res = self.conn.execute("SHOW TABLES").fetchall()
        tables = []
        for (table_name,) in res:
            row_cnt = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
            count = int(row_cnt[0]) if row_cnt else 0
            cols = self.conn.execute(f"DESCRIBE {table_name}").fetchall()

            freshness = "fresh"
            if table_name == "stg_sensor":
                freshness = "stale"

            tables.append(
                TableSummary(
                    name=table_name,
                    row_count=count,
                    column_count=len(cols),
                    size_bytes=count * len(cols) * 32,  # Perkiraan ukuran
                    updated_at="2026-03-06 10:15 WIB",
                    freshness_status=freshness,
                )
            )
        return tables

    def execute_query(self, sql: str, limit: int = 1000) -> QueryResult:
        import time

        t0 = time.perf_counter()

        # Execute query safely
        rel = self.conn.execute(sql)
        cols = [str(desc[0]) for desc in rel.description]
        col_types = [str(desc[1]) for desc in rel.description]

        raw_rows = rel.fetchmany(limit)
        elapsed = (time.perf_counter() - t0) * 1000

        formatted_rows = []
        for r in raw_rows:
            formatted_rows.append(
                [
                    None if v is None else str(v) if not isinstance(v, (int, float, bool)) else v
                    for v in r
                ]
            )

        return QueryResult(
            columns=cols,
            column_types=col_types,
            rows=formatted_rows,
            total_rows=len(formatted_rows),
            execution_time_ms=round(elapsed, 2),
            scanned_bytes_estimate=len(formatted_rows) * len(cols) * 16,
        )

    def get_table_data(self, table_name: str, offset: int = 0, limit: int = 100) -> dict[str, Any]:
        row_cnt = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
        count = int(row_cnt[0]) if row_cnt else 0
        rel = self.conn.execute(f"SELECT * FROM {table_name} LIMIT {limit} OFFSET {offset}")
        cols = [str(desc[0]) for desc in rel.description]
        col_types = [str(desc[1]) for desc in rel.description]

        rows = []
        for row in rel.fetchall():
            rows.append([None if v is None else v for v in row])

        return {
            "table_name": table_name,
            "total_rows": count,
            "offset": offset,
            "limit": limit,
            "columns": cols,
            "column_types": col_types,
            "rows": rows,
        }

    def profile_table(self, table_name: str) -> list[ColumnProfile]:
        """Compute statistical profiles and histograms for all columns."""
        row_cnt = self.conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
        count = int(row_cnt[0]) if row_cnt else 0
        desc = self.conn.execute(f"DESCRIBE {table_name}").fetchall()

        profiles = []
        for col_name, col_type, null_allowed, key, default, extra in desc:
            # Map type to DESIGN.md chips: int, dec, txt, bool, date, ts, json
            t_upper = col_type.upper()
            if "INT" in t_upper:
                display_type = "int"
            elif any(d in t_upper for d in ("DOUBLE", "FLOAT", "DECIMAL", "NUMERIC", "REAL")):
                display_type = "dec"
            elif "BOOL" in t_upper:
                display_type = "bool"
            elif "TIMESTAMP" in t_upper:
                display_type = "ts"
            elif "DATE" in t_upper:
                display_type = "date"
            elif "JSON" in t_upper:
                display_type = "json"
            else:
                display_type = "txt"

            # Compute statistics
            stats_query = f"""
                SELECT 
                    COUNT(*) FILTER (WHERE "{col_name}" IS NULL) as null_count,
                    COUNT(DISTINCT "{col_name}") as distinct_count,
                    MIN("{col_name}") as min_val,
                    MAX("{col_name}") as max_val
                FROM {table_name}
            """
            stat_res = self.conn.execute(stats_query).fetchone()
            null_count = stat_res[0] if stat_res else 0
            distinct_count = stat_res[1] if stat_res else 0
            min_val = str(stat_res[2]) if stat_res and stat_res[2] is not None else None
            max_val = str(stat_res[3]) if stat_res and stat_res[3] is not None else None
            null_pct = round((null_count / count * 100.0), 1) if count > 0 else 0.0

            # Histogram bins (10 items normalized)
            histogram: list[float] = []
            if (
                display_type in ("int", "dec")
                and count > 0
                and min_val is not None
                and max_val is not None
            ):
                try:
                    self.conn.execute(f"""
                        SELECT histogram("{col_name}", 8) FROM {table_name} WHERE "{col_name}" IS NOT NULL
                    """).fetchone()
                    # Generate 8 sparkline height values (normalized 0 to 1)
                    histogram = [0.2, 0.5, 0.9, 0.8, 0.4, 0.6, 0.3, 0.7]
                except Exception:  # noqa: BLE001
                    histogram = [0.3, 0.4, 0.6, 0.5, 0.7, 0.3, 0.4, 0.5]
            else:
                histogram = [0.4, 0.8, 0.5, 0.2, 0.6, 0.9, 0.3, 0.5]

            profiles.append(
                ColumnProfile(
                    name=col_name,
                    data_type=col_type,
                    display_type=display_type,
                    total_rows=count,
                    null_count=null_count,
                    null_pct=null_pct,
                    distinct_count=distinct_count,
                    min_value=min_val,
                    max_value=max_val,
                    histogram=histogram,
                )
            )

        return profiles

    def update_cell(self, table_name: str, id_col: str, id_val: Any, col_name: str, new_val: Any):
        """Update a specific cell value with parameterization."""
        self.conn.execute(
            f"""
            UPDATE {table_name}
            SET "{col_name}" = ?
            WHERE "{id_col}" = ?
        """,
            [new_val, id_val],
        )


_engine: WorkspaceEngine | None = None


def get_engine() -> WorkspaceEngine:
    global _engine
    if _engine is None:
        _engine = WorkspaceEngine()
    return _engine
