from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.engine.workspace import get_engine
from app.pipeline.registry import (
    STEP_GENERATORS,
    STEP_METADATA,
    PipelineStepDef,
    generate_pipeline_code,
)

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


class StepModel(BaseModel):
    id: str
    kind: str
    name: str
    params: dict
    enabled: bool = True
    input_rows: int = 12
    output_rows: int = 11


class PipelineTemplate(BaseModel):
    id: str
    title: str
    description: str
    source_table: str
    steps: list[StepModel]


class CodeGenRequest(BaseModel):
    source_table: str
    steps: list[StepModel]


class CodeGenResponse(BaseModel):
    sql: str
    polars: str
    pandas: str


class ExecutePipelineRequest(BaseModel):
    source_table: str
    steps: list[StepModel]
    preview_limit: int = 100


class ExecutePipelineResponse(BaseModel):
    columns: list[str]
    column_types: list[str]
    rows: list[list[Any]]
    total_rows: int
    execution_time_ms: float
    sql_executed: str


@router.get("/steps")
def get_available_steps():
    """Daftar semua tipe step yang tersedia beserta metadata untuk UI."""
    return [
        {
            "kind": kind,
            **STEP_METADATA.get(kind, {"label": kind, "icon": "Box", "color": "gray"}),
        }
        for kind in STEP_GENERATORS
    ]


@router.get("/templates", response_model=list[PipelineTemplate])
def get_pipeline_templates():
    return [
        PipelineTemplate(
            id="tpl-clean-pesanan",
            title="Bersihkan Data Pesanan",
            description="Hapus baris tanggal null, buang duplikasi nomor pesanan, dan filter transaksi lunas.",
            source_table="pesanan_harian",
            steps=[
                StepModel(
                    id="s1",
                    kind="drop_null",
                    name="Buang Baris Tanggal Kosong",
                    params={"column": "tanggal"},
                    enabled=True,
                    input_rows=12,
                    output_rows=11,
                ),
                StepModel(
                    id="s2",
                    kind="deduplicate",
                    name="Deduplikasi Nomor Pesanan",
                    params={"columns": ["nomor_pesanan"]},
                    enabled=True,
                    input_rows=11,
                    output_rows=10,
                ),
                StepModel(
                    id="s3",
                    kind="filter",
                    name="Filter Status Bayar Lunas",
                    params={
                        "column": "status_bayar",
                        "value": "Lunas",
                        "condition": "status_bayar = 'Lunas'",
                    },
                    enabled=True,
                    input_rows=10,
                    output_rows=7,
                ),
                StepModel(
                    id="s4",
                    kind="aggregate",
                    name="Total per Kategori",
                    params={
                        "group_by": ["kategori"],
                        "aggregations": [
                            {"column": "total_harga", "function": "SUM", "alias": "total_revenue"},
                            {"column": "id", "function": "COUNT", "alias": "jumlah_pesanan"},
                        ],
                    },
                    enabled=False,
                    input_rows=7,
                    output_rows=4,
                ),
            ],
        ),
        PipelineTemplate(
            id="tpl-sensor-clean",
            title="Bersihkan Data Sensor",
            description="Filter sensor KRITIS, tambah kolom label, urutkan berdasarkan waktu.",
            source_table="stg_sensor",
            steps=[
                StepModel(
                    id="s1",
                    kind="filter",
                    name="Filter Sensor Aktif",
                    params={
                        "column": "status",
                        "operator": "!=",
                        "value": "NORMAL",
                        "condition": "status != 'NORMAL'",
                    },
                    enabled=True,
                    input_rows=5,
                    output_rows=2,
                ),
                StepModel(
                    id="s2",
                    kind="derive",
                    name="Tambah Label Urgensi",
                    params={
                        "column_name": "level_urgensi",
                        "expression": "CASE WHEN status = 'KRITIS' THEN 3 WHEN status = 'PERINGATAN' THEN 2 ELSE 1 END",
                    },
                    enabled=True,
                    input_rows=2,
                    output_rows=2,
                ),
                StepModel(
                    id="s3",
                    kind="sort",
                    name="Urutkan Waktu Terbaru",
                    params={"columns": [{"column": "waktu_rekam", "ascending": False}]},
                    enabled=True,
                    input_rows=2,
                    output_rows=2,
                ),
            ],
        ),
    ]


@router.post("/codegen", response_model=CodeGenResponse)
def generate_code_for_pipeline(req: CodeGenRequest):
    step_defs = [
        PipelineStepDef(id=s.id, kind=s.kind, name=s.name, params=s.params, enabled=s.enabled)
        for s in req.steps
    ]
    codes = generate_pipeline_code(req.source_table, step_defs)
    return CodeGenResponse(sql=codes["sql"], polars=codes["polars"], pandas=codes["pandas"])


@router.post("/execute", response_model=ExecutePipelineResponse)
def execute_pipeline(req: ExecutePipelineRequest):
    """
    Jalankan pipeline di DuckDB workspace dan kembalikan preview hasilnya.
    Semua transformasi dijalankan sebagai TEMP VIEW berantai.
    """
    import time

    engine = get_engine()
    step_defs = [
        PipelineStepDef(id=s.id, kind=s.kind, name=s.name, params=s.params, enabled=s.enabled)
        for s in req.steps
    ]

    # Validasi tabel sumber ada
    tables_res = engine.conn.execute("SHOW TABLES").fetchall()
    table_names = [t[0] for t in tables_res]
    if req.source_table not in table_names:
        raise HTTPException(status_code=404, detail=f"Tabel '{req.source_table}' tidak ditemukan.")

    codes = generate_pipeline_code(req.source_table, step_defs)
    sql_views = codes["sql"]

    t0 = time.perf_counter()
    try:
        # Jalankan semua CREATE TEMP VIEW
        statements = [s.strip() for s in sql_views.split(";") if s.strip()]
        last_view = req.source_table
        for stmt in statements:
            if stmt.upper().startswith("CREATE"):
                engine.conn.execute(stmt)
                # Ambil nama view terakhir
                parts = stmt.upper().split()
                if "VIEW" in parts:
                    idx = parts.index("VIEW")
                    if idx + 1 < len(parts):
                        last_view = stmt.split()[idx + 1]
            elif stmt.upper().startswith("SELECT") and "FROM" in stmt.upper():
                last_view = stmt  # final SELECT langsung

        # Ambil hasil preview
        final_sql = (
            last_view
            if last_view.upper().startswith("SELECT")
            else f"SELECT * FROM {last_view} LIMIT {req.preview_limit}"
        )
        rel = engine.conn.execute(final_sql)
        cols = [str(d[0]) for d in rel.description]
        col_types = [str(d[1]) for d in rel.description]
        rows = rel.fetchmany(req.preview_limit)
        elapsed = (time.perf_counter() - t0) * 1000

        formatted_rows = [
            [
                None if v is None else str(v) if not isinstance(v, (int, float, bool)) else v
                for v in r
            ]
            for r in rows
        ]

        return ExecutePipelineResponse(
            columns=cols,
            column_types=col_types,
            rows=formatted_rows,
            total_rows=len(formatted_rows),
            execution_time_ms=round(elapsed, 2),
            sql_executed=sql_views,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Eksekusi pipeline gagal: {e!s}")
