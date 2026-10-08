"""
API routes for Run history and execution management.
Endpoints for list runs, run detail, live logs, cancellation, and retry.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.orchestration.runs import get_run_manager

router = APIRouter(prefix="/runs", tags=["Runs"])


class AppendLogPayload(BaseModel):
    level: str = "INFO"
    message: str


@router.get("")
def list_runs(status: str | None = None, target: str | None = None, limit: int = 50):
    mgr = get_run_manager()
    runs = mgr.list_runs(status=status, target_name=target, limit=limit)
    return {"runs": [r.to_dict() for r in runs], "total": len(runs)}


@router.get("/{run_id}")
def get_run_detail(run_id: str):
    mgr = get_run_manager()
    run = mgr.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run tidak ditemukan.")
    return run.to_dict()


@router.post("/{run_id}/cancel")
def cancel_run(run_id: str):
    mgr = get_run_manager()
    run = mgr.cancel_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run tidak ditemukan.")
    return {"success": True, "run": run.to_dict()}


@router.post("/{run_id}/retry")
def retry_run(run_id: str):
    mgr = get_run_manager()
    new_run = mgr.retry_run(run_id)
    if not new_run:
        raise HTTPException(status_code=404, detail="Run tidak ditemukan untuk diulang.")
    return {"success": True, "new_run": new_run.to_dict()}


@router.post("/{run_id}/logs")
def append_log(run_id: str, payload: AppendLogPayload):
    mgr = get_run_manager()
    mgr.append_log(run_id, payload.level, payload.message)
    return {"success": True}
