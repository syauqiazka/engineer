"""
API routes for Schedule management.
CRUD for schedules, toggle active/pause, trigger run, backfill execution, and next run calculation.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.orchestration.runs import get_run_manager
from app.orchestration.scheduler import (
    Schedule,
    calculate_next_runs,
    explain_cron,
    get_scheduler_manager,
)

router = APIRouter(prefix="/schedules", tags=["Schedules"])


class CreateSchedulePayload(BaseModel):
    name: str
    target_type: str = "pipeline"  # "pipeline" | "workflow" | "warehouse_job"
    target_id: str
    target_name: str
    cron_expression: str = "0 2 * * *"
    timezone: str = "Asia/Jakarta"
    is_active: bool = True
    write_mode: str = "overwrite"  # "append", "overwrite", "merge"
    target_table: str = ""
    retry_max: int = 3
    backoff_sec: int = 60
    timeout_sec: int = 3600
    alert_on_failure: bool = True


class BackfillPayload(BaseModel):
    start_date: str = Field(description="Format YYYY-MM-DD")
    end_date: str = Field(description="Format YYYY-MM-DD")


@router.get("")
def list_schedules():
    mgr = get_scheduler_manager()
    schedules = mgr.list_schedules()
    return {"schedules": [s.to_dict() for s in schedules], "total": len(schedules)}


@router.get("/explain")
def explain_cron_query(cron: str, tz: str = "Asia/Jakarta"):
    return {
        "cron": cron,
        "human_description": explain_cron(cron, tz),
        "next_runs": calculate_next_runs(cron, count=3, tz_str=tz),
    }


@router.post("")
def create_schedule(payload: CreateSchedulePayload):
    mgr = get_scheduler_manager()
    import time
    import uuid

    sched_id = f"sched-{int(time.time())}-{str(uuid.uuid4())[:4]}"
    sched = Schedule(
        id=sched_id,
        name=payload.name,
        target_type=payload.target_type,
        target_id=payload.target_id,
        target_name=payload.target_name,
        cron_expression=payload.cron_expression,
        timezone=payload.timezone,
        is_active=payload.is_active,
        write_mode=payload.write_mode,
        target_table=payload.target_table,
        timeout_seconds=payload.timeout_sec,
    )
    sched.retry_policy.max_retries = payload.retry_max
    sched.retry_policy.backoff_seconds = payload.backoff_sec
    sched.alert_config.on_failure = payload.alert_on_failure

    created = mgr.add_schedule(sched)
    return created.to_dict()


@router.get("/{schedule_id}")
def get_schedule_detail(schedule_id: str):
    mgr = get_scheduler_manager()
    sched = mgr.get_schedule(schedule_id)
    if not sched:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan.")
    return sched.to_dict()


@router.post("/{schedule_id}/toggle")
def toggle_schedule(schedule_id: str):
    mgr = get_scheduler_manager()
    res = mgr.toggle_active(schedule_id)
    if not res:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan.")
    return res.to_dict()


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str):
    mgr = get_scheduler_manager()
    ok = mgr.delete_schedule(schedule_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan.")
    return {"success": True, "message": "Jadwal berhasil dihapus."}


@router.post("/{schedule_id}/trigger")
def trigger_schedule_now(schedule_id: str):
    sched_mgr = get_scheduler_manager()
    run_mgr = get_run_manager()

    sched = sched_mgr.get_schedule(schedule_id)
    if not sched:
        raise HTTPException(status_code=404, detail="Jadwal tidak ditemukan.")

    run = run_mgr.create_run(
        target_name=sched.target_name,
        target_type=sched.target_type,
        target_id=sched.target_id,
        schedule_id=sched.id,
        trigger="manual",
        write_mode=sched.write_mode,
    )
    return {"success": True, "run": run.to_dict()}


@router.post("/{schedule_id}/backfill")
def backfill_schedule(schedule_id: str, payload: BackfillPayload):
    run_mgr = get_run_manager()
    try:
        runs = run_mgr.generate_backfill(
            schedule_id=schedule_id,
            start_date_str=payload.start_date,
            end_date_str=payload.end_date,
        )
        return {
            "success": True,
            "count": len(runs),
            "message": f"Berhasil menjadwalkan {len(runs)} run backfill untuk rentang {payload.start_date} s/d {payload.end_date}.",
            "runs": [r.to_dict() for r in runs],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
