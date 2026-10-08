"""
API routes for Airflow export and REST integration.
"""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.orchestration.airflow import (
    AirflowClient,
    export_pipeline_to_airflow_dag,
    export_workflow_to_airflow_dag,
)

router = APIRouter(prefix="/airflow", tags=["Airflow"])


class ExportPipelinePayload(BaseModel):
    pipeline_name: str
    steps: list[dict[str, Any]]
    cron_schedule: str = "0 2 * * *"
    description: str = "DAG hasil ekspor otomatis dari Data Engineer Workbench"


class ExportWorkflowPayload(BaseModel):
    workflow_name: str
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    cron_schedule: str = "0 3 * * *"
    description: str = "Workflow DAG hasil ekspor visual canvas"


class AirflowConnectionPayload(BaseModel):
    base_url: str = "http://localhost:8080"
    username: str = ""
    password: str = ""
    bearer_token: str = ""


class AirflowTriggerPayload(BaseModel):
    base_url: str = "http://localhost:8080"
    dag_id: str
    username: str = ""
    password: str = ""
    bearer_token: str = ""
    conf: dict[str, Any] | None = None


@router.post("/export-pipeline")
def export_pipeline_endpoint(payload: ExportPipelinePayload):
    code = export_pipeline_to_airflow_dag(
        pipeline_name=payload.pipeline_name,
        steps=payload.steps,
        cron_schedule=payload.cron_schedule,
        description=payload.description,
    )
    return {"code": code, "filename": f"dag_{payload.pipeline_name.lower().replace(' ', '_')}.py"}


@router.post("/export-workflow")
def export_workflow_endpoint(payload: ExportWorkflowPayload):
    code = export_workflow_to_airflow_dag(
        workflow_name=payload.workflow_name,
        nodes=payload.nodes,
        edges=payload.edges,
        cron_schedule=payload.cron_schedule,
        description=payload.description,
    )
    return {"code": code, "filename": f"dag_{payload.workflow_name.lower().replace(' ', '_')}.py"}


@router.post("/test")
def test_airflow_connection(payload: AirflowConnectionPayload):
    client = AirflowClient(
        base_url=payload.base_url,
        username=payload.username,
        password=payload.password,
        bearer_token=payload.bearer_token,
    )
    return client.test_connection()


@router.post("/trigger")
def trigger_airflow_dag(payload: AirflowTriggerPayload):
    client = AirflowClient(
        base_url=payload.base_url,
        username=payload.username,
        password=payload.password,
        bearer_token=payload.bearer_token,
    )
    res = client.trigger_dag_run(payload.dag_id, conf=payload.conf)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res
