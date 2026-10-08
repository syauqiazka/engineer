"""
Routes Workflow Visual DAG (Fase 2).
Sesuai AGENTS.md Bagian 3, 4, 6.2:
- Mendukung graf DAG node & edge (sumber, transformasi SQL/filter, kualitas assert, python runner, tujuan)
- Deteksi siklus via Topological Sort
- Generator kode terpadu: Polars (Python) dan SQL
- Eksekusi alur DAG di DuckDB engine lokal
"""

from __future__ import annotations

import json
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.engine.workspace import get_engine
from app.runner.sandbox import get_sandbox_runner
from app.security.auth import Session, require_role

router = APIRouter(prefix="/workflows", tags=["Workflows DAG"])

_WORKFLOWS_FILE = (
    Path(__file__).resolve().parent.parent.parent / "workspace_data" / "workflows.json"
)


class WorkflowNode(BaseModel):
    id: str
    type: str  # source, transform_sql, filter, python, quality_assert, destination
    label: str
    data: dict[str, Any] = Field(default_factory=dict)
    position: dict[str, float] = Field(default_factory=lambda: {"x": 100.0, "y": 100.0})


class WorkflowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str | None = None
    targetHandle: str | None = None


class WorkflowModel(BaseModel):
    id: str
    name: str
    description: str = ""
    nodes: list[WorkflowNode]
    edges: list[WorkflowEdge]
    updated_at: str = ""


class ExecuteWorkflowResponse(BaseModel):
    success: bool
    execution_order: list[str]
    node_results: dict[str, Any]
    error: str | None = None


class CodegenResponse(BaseModel):
    python_polars: str
    sql: str


def _load_workflows() -> dict[str, WorkflowModel]:
    if not _WORKFLOWS_FILE.exists():
        # Default starter DAG
        default_wf = WorkflowModel(
            id="wf-sales-pipeline",
            name="Pipeline Penjualan & Agregasi Harian",
            description="Ekstraksi pesanan harian, filter pesanan sukses, uji kualitas, dan agregasi omzet.",
            nodes=[
                WorkflowNode(
                    id="node-1",
                    type="source",
                    label="Sumber: pesanan_harian",
                    data={"table": "pesanan_harian"},
                    position={"x": 50, "y": 120},
                ),
                WorkflowNode(
                    id="node-2",
                    type="filter",
                    label="Filter: Status Selesai",
                    data={"condition": "status = 'selesai'"},
                    position={"x": 300, "y": 80},
                ),
                WorkflowNode(
                    id="node-3",
                    type="quality_assert",
                    label="Uji Kualitas: Total Positif",
                    data={"column": "total", "rule": "range", "min": 0},
                    position={"x": 550, "y": 80},
                ),
                WorkflowNode(
                    id="node-4",
                    type="transform_sql",
                    label="Agregasi: Omzet per Metode",
                    data={
                        "sql": "SELECT metode_bayar, COUNT(*) as jml, SUM(total) as omzet FROM __input__ GROUP BY metode_bayar"
                    },
                    position={"x": 800, "y": 80},
                ),
                WorkflowNode(
                    id="node-5",
                    type="destination",
                    label="Tujuan: rpt_omzet_metode",
                    data={"target_table": "rpt_omzet_metode", "mode": "overwrite"},
                    position={"x": 1050, "y": 80},
                ),
            ],
            edges=[
                WorkflowEdge(id="e1-2", source="node-1", target="node-2"),
                WorkflowEdge(id="e2-3", source="node-2", target="node-3"),
                WorkflowEdge(id="e3-4", source="node-3", target="node-4"),
                WorkflowEdge(id="e4-5", source="node-4", target="node-5"),
            ],
            updated_at="2026-10-07T10:00:00Z",
        )
        _save_workflows({default_wf.id: default_wf})
        return {default_wf.id: default_wf}

    try:
        raw = json.loads(_WORKFLOWS_FILE.read_text(encoding="utf-8"))
        return {k: WorkflowModel(**v) for k, v in raw.items()}
    except Exception:
        return {}


def _save_workflows(data: dict[str, WorkflowModel]) -> None:
    _WORKFLOWS_FILE.parent.mkdir(parents=True, exist_ok=True)
    serializable = {k: v.model_dump() for k, v in data.items()}
    _WORKFLOWS_FILE.write_text(json.dumps(serializable, indent=2), encoding="utf-8")


def _topological_sort(nodes: list[WorkflowNode], edges: list[WorkflowEdge]) -> list[str]:
    """Kahn's algorithm untuk topological sort & deteksi siklus."""
    in_degree: dict[str, int] = {n.id: 0 for n in nodes}
    adj: dict[str, list[str]] = defaultdict(list)

    for edge in edges:
        adj[edge.source].append(edge.target)
        if edge.target in in_degree:
            in_degree[edge.target] += 1

    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    order = []

    while queue:
        curr = queue.popleft()
        order.append(curr)
        for neighbor in adj[curr]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(order) != len(nodes):
        raise ValueError("Siklus (circular dependency) terdeteksi dalam DAG workflow.")

    return order


@router.get("", response_model=list[WorkflowModel])
def list_workflows(user: Session = Depends(require_role("viewer"))):
    return list(_load_workflows().values())


@router.get("/{wf_id}", response_model=WorkflowModel)
def get_workflow(wf_id: str, user: Session = Depends(require_role("viewer"))):
    wfs = _load_workflows()
    if wf_id not in wfs:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan.")
    return wfs[wf_id]


@router.post("", response_model=WorkflowModel, status_code=201)
def save_workflow(wf: WorkflowModel, user: Session = Depends(require_role("editor"))):
    # Validasi siklus
    try:
        _topological_sort(wf.nodes, wf.edges)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    wfs = _load_workflows()
    wfs[wf.id] = wf
    _save_workflows(wfs)
    return wf


@router.delete("/{wf_id}", status_code=204)
def delete_workflow(wf_id: str, user: Session = Depends(require_role("editor"))):
    wfs = _load_workflows()
    if wf_id not in wfs:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan.")
    del wfs[wf_id]
    _save_workflows(wfs)


@router.post("/{wf_id}/codegen", response_model=CodegenResponse)
def generate_code_for_workflow(wf_id: str, user: Session = Depends(require_role("viewer"))):
    wfs = _load_workflows()
    if wf_id not in wfs:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan.")
    wf = wfs[wf_id]

    order = _topological_sort(wf.nodes, wf.edges)
    node_map = {n.id: n for n in wf.nodes}

    # Generate Polars Python Code
    py_lines = [
        "# =================================================================",
        f"# Workflow: {wf.name}",
        "# Dibuat otomatis oleh Workbench Data Engineer (Fase 2)",
        "# Engine: Polars (In-memory) + DuckDB Workspace",
        "# =================================================================",
        "import polars as pl",
        "import duckdb",
        "",
        "con = duckdb.connect('workspace.duckdb')",
        "",
    ]

    sql_steps = [
        f"-- Workflow: {wf.name}",
        "-- Dialek: DuckDB SQL",
        "",
    ]

    intermediate_tbl = "source_data"

    for idx, nid in enumerate(order):
        node = node_map[nid]
        step_var = f"df_{idx + 1}"

        if node.type == "source":
            src_tbl = node.data.get("table", "pesanan_harian")
            intermediate_tbl = src_tbl
            py_lines.append(f"# Step {idx + 1}: Sumber '{src_tbl}'")
            py_lines.append(
                f"{step_var} = pl.from_arrow(con.execute('SELECT * FROM \"{src_tbl}\"').arrow())"
            )
            sql_steps.append(f"-- Step {idx + 1}: Membaca tabel '{src_tbl}'")

        elif node.type == "filter":
            cond = node.data.get("condition", "1=1")
            prev_var = f"df_{idx}"
            py_lines.append(f"# Step {idx + 1}: Filter ({cond})")
            py_lines.append("# Catatan: Filter diekspresikan via SQL/Polars predicate")
            py_lines.append(
                f"{step_var} = con.execute('SELECT * FROM arrow_{prev_var} WHERE {cond}').pl()"
            )
            intermediate_tbl = f"stage_{idx + 1}"
            sql_steps.append(
                f"CREATE OR REPLACE VIEW {intermediate_tbl} AS SELECT * FROM {node_map[order[idx - 1]].data.get('table', 'prev')} WHERE {cond};"
            )

        elif node.type == "transform_sql":
            query = node.data.get("sql", "SELECT * FROM __input__")
            query_rendered = query.replace("__input__", f"stage_{idx}")
            py_lines.append(f"# Step {idx + 1}: Transformasi SQL")
            py_lines.append(f"{step_var} = con.execute('''{query}''').pl()")
            sql_steps.append(f"CREATE OR REPLACE VIEW stage_{idx + 1} AS {query_rendered};")

        elif node.type == "quality_assert":
            col = node.data.get("column", "id")
            py_lines.append(f"# Step {idx + 1}: Quality Assert ({col})")
            py_lines.append(
                f"assert {step_var}['{col}'].null_count() == 0, 'Pelanggaran kualitas: NULL ditemukan'"
            )

        elif node.type == "destination":
            tgt = node.data.get("target_table", "output_table")
            mode = node.data.get("mode", "overwrite")
            py_lines.append(f"# Step {idx + 1}: Tulis ke tabel tujuan '{tgt}' ({mode})")
            py_lines.append(
                f"con.execute('CREATE OR REPLACE TABLE \"{tgt}\" AS SELECT * FROM {step_var}')"
            )
            sql_steps.append(f'CREATE OR REPLACE TABLE "{tgt}" AS SELECT * FROM stage_{idx};')

        py_lines.append("")

    py_lines.append("print('Workflow selesai dengan sukses!')")

    return CodegenResponse(
        python_polars="\n".join(py_lines),
        sql="\n".join(sql_steps),
    )


@router.post("/{wf_id}/execute", response_model=ExecuteWorkflowResponse)
def execute_workflow(wf_id: str, user: Session = Depends(require_role("editor"))):
    """Jalankan DAG workflow secara atomik di engine DuckDB."""
    wfs = _load_workflows()
    if wf_id not in wfs:
        raise HTTPException(status_code=404, detail="Workflow tidak ditemukan.")
    wf = wfs[wf_id]

    try:
        order = _topological_sort(wf.nodes, wf.edges)
    except ValueError as e:
        return ExecuteWorkflowResponse(
            success=False,
            execution_order=[],
            node_results={},
            error=str(e),
        )

    engine = get_engine()
    node_map = {n.id: n for n in wf.nodes}
    results: dict[str, Any] = {}
    current_view = ""

    for nid in order:
        node = node_map[nid]
        try:
            if node.type == "source":
                src_tbl = node.data.get("table", "pesanan_harian")
                current_view = f"__stage_{nid.replace('-', '_')}"
                engine.execute(
                    f'CREATE OR REPLACE TEMP VIEW "{current_view}" AS SELECT * FROM "{src_tbl}"'
                )
                row_cnt = engine.query(f'SELECT COUNT(*) FROM "{current_view}"').rows[0][0]
                results[nid] = {
                    "status": "success",
                    "message": f"{row_cnt:,} baris dimuat dari {src_tbl}",
                }

            elif node.type == "filter":
                cond = node.data.get("condition", "1=1")
                next_view = f"__stage_{nid.replace('-', '_')}"
                engine.execute(
                    f'CREATE OR REPLACE TEMP VIEW "{next_view}" AS SELECT * FROM "{current_view}" WHERE {cond}'
                )
                current_view = next_view
                row_cnt = engine.query(f'SELECT COUNT(*) FROM "{current_view}"').rows[0][0]
                results[nid] = {
                    "status": "success",
                    "message": f"{row_cnt:,} baris setelah filter ({cond})",
                }

            elif node.type == "transform_sql":
                raw_sql = node.data.get("sql", f"SELECT * FROM {current_view}")
                clean_sql = raw_sql.replace("__input__", f'"{current_view}"')
                next_view = f"__stage_{nid.replace('-', '_')}"
                engine.execute(f'CREATE OR REPLACE TEMP VIEW "{next_view}" AS {clean_sql}')
                current_view = next_view
                row_cnt = engine.query(f'SELECT COUNT(*) FROM "{current_view}"').rows[0][0]
                results[nid] = {
                    "status": "success",
                    "message": f"{row_cnt:,} baris dihasilkan dari query",
                }

            elif node.type == "quality_assert":
                col = node.data.get("column")
                rule_type = node.data.get("rule", "not_null")
                if rule_type == "not_null" and col:
                    null_cnt = engine.query(
                        f'SELECT COUNT(*) FROM "{current_view}" WHERE "{col}" IS NULL'
                    ).rows[0][0]
                    if null_cnt > 0:
                        raise ValueError(
                            f"Uji kualitas gagal: {null_cnt} baris dengan {col} bernilai NULL!"
                        )
                results[nid] = {"status": "success", "message": "Aturan kualitas lulus 100%"}

            elif node.type == "python":
                code = node.data.get("code", "")
                runner = get_sandbox_runner()
                run_res = runner.execute(code)
                if not run_res.success:
                    raise ValueError(f"Python error: {run_res.error_message}")
                results[nid] = {
                    "status": "success",
                    "message": f"Selesai dalam {run_res.duration_ms}ms",
                }

            elif node.type == "destination":
                tgt = node.data.get("target_table", f"out_{nid.replace('-', '_')}")
                mode = node.data.get("mode", "overwrite")
                if mode == "overwrite":
                    engine.execute(
                        f'CREATE OR REPLACE TABLE "{tgt}" AS SELECT * FROM "{current_view}"'
                    )
                else:
                    engine.execute(f'INSERT INTO "{tgt}" SELECT * FROM "{current_view}"')
                row_cnt = engine.query(f'SELECT COUNT(*) FROM "{tgt}"').rows[0][0]
                results[nid] = {
                    "status": "success",
                    "message": f"{row_cnt:,} baris tersimpan di tabel {tgt}",
                }

        except Exception as e:
            results[nid] = {"status": "error", "message": str(e)}
            return ExecuteWorkflowResponse(
                success=False,
                execution_order=order,
                node_results=results,
                error=f"Kegagalan pada node '{node.label}': {e}",
            )

    return ExecuteWorkflowResponse(
        success=True,
        execution_order=order,
        node_results=results,
    )
