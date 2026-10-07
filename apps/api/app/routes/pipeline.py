from fastapi import APIRouter
from pydantic import BaseModel

from app.pipeline.registry import PipelineStepDef, generate_pipeline_code

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
            ],
        )
    ]


@router.post("/codegen", response_model=CodeGenResponse)
def generate_code_for_pipeline(req: CodeGenRequest):
    step_defs = [
        PipelineStepDef(id=s.id, kind=s.kind, name=s.name, params=s.params, enabled=s.enabled)
        for s in req.steps
    ]
    codes = generate_pipeline_code(req.source_table, step_defs)
    return CodeGenResponse(sql=codes["sql"], polars=codes["polars"], pandas=codes["pandas"])
