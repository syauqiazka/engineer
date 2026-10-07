"""
Routes untuk Runner Python Sandbox (Fase 2).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.runner.sandbox import get_sandbox_runner
from app.security.auth import Session, require_role

router = APIRouter(prefix="/runner", tags=["Runner"])


class ExecutePythonRequest(BaseModel):
    code: str
    params: dict[str, Any] = Field(default_factory=dict)
    timeout_seconds: int = 30


class ExecutePythonResponse(BaseModel):
    success: bool
    stdout: str
    stderr: str
    duration_ms: float
    output_preview: dict[str, Any] | None = None
    tables_written: list[str] = Field(default_factory=list)
    error_message: str | None = None


@router.post("/python", response_model=ExecutePythonResponse)
def execute_python(
    req: ExecutePythonRequest,
    user: Session = Depends(require_role("editor")),
):
    runner = get_sandbox_runner()
    res = runner.execute(
        code=req.code,
        params=req.params,
        timeout=req.timeout_seconds,
    )
    return ExecutePythonResponse(
        success=res.success,
        stdout=res.stdout,
        stderr=res.stderr,
        duration_ms=res.duration_ms,
        output_preview=res.output_preview,
        tables_written=res.tables_written,
        error_message=res.error_message,
    )
