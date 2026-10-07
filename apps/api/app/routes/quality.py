"""
Routes Kualitas Data (Fase 2).
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.engine.quality import (
    QualityRule,
    TableQualityReport,
    get_quality_manager,
)
from app.engine.workspace import get_engine
from app.security.auth import Session, require_role

router = APIRouter(prefix="/quality", tags=["Data Quality"])


class CreateRuleRequest(BaseModel):
    table_name: str
    column_name: str | None = None
    rule_type: str  # not_null, unique, range, regex, allowed_values, row_count_min, custom_sql
    params: dict[str, Any] = {}
    severity: str = "error"  # error, warn
    description: str = ""


@router.get("/rules")
def list_rules(
    table_name: str | None = None,
    user: Session = Depends(require_role("viewer")),
):
    mgr = get_quality_manager()
    rules = mgr.load_all_rules()
    if table_name:
        rules = [r for r in rules if r.table_name == table_name]
    return rules


@router.post("/rules", status_code=201)
def create_rule(
    req: CreateRuleRequest,
    user: Session = Depends(require_role("editor")),
):
    mgr = get_quality_manager()
    rule_id = f"rule-{uuid.uuid4().hex[:8]}"
    rule = QualityRule(
        id=rule_id,
        table_name=req.table_name,
        column_name=req.column_name,
        rule_type=req.rule_type,  # type: ignore
        params=req.params,
        severity=req.severity,  # type: ignore
        description=req.description,
    )
    saved = mgr.add_rule(rule)
    return saved


@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: str,
    user: Session = Depends(require_role("editor")),
):
    mgr = get_quality_manager()
    success = mgr.delete_rule(rule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Aturan kualitas tidak ditemukan.")


@router.post("/evaluate/{rule_id}")
def evaluate_single_rule(
    rule_id: str,
    user: Session = Depends(require_role("viewer")),
):
    mgr = get_quality_manager()
    rules = mgr.load_all_rules()
    target = next((r for r in rules if r.id == rule_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Aturan kualitas tidak ditemukan.")
    return mgr.evaluate_rule(target)


@router.post("/evaluate-table/{table_name}")
def evaluate_table_rules(
    table_name: str,
    user: Session = Depends(require_role("viewer")),
):
    mgr = get_quality_manager()
    return mgr.evaluate_table(table_name)


@router.get("/overview")
def get_quality_overview(user: Session = Depends(require_role("viewer"))):
    """Ringkasan skor kualitas untuk seluruh tabel di workspace."""
    engine = get_engine()
    tables = engine.list_tables()
    mgr = get_quality_manager()

    reports: list[TableQualityReport] = []
    total_rules = 0
    total_passed = 0
    total_failed = 0

    for tbl in tables:
        tname = tbl.name
        report = mgr.evaluate_table(tname)
        reports.append(report)
        total_rules += report.total_rules
        total_passed += report.passed_rules
        total_failed += report.failed_rules

    global_score = round((total_passed / total_rules * 100.0), 1) if total_rules > 0 else 100.0

    return {
        "global_health_score": global_score,
        "total_rules": total_rules,
        "total_passed": total_passed,
        "total_failed": total_failed,
        "tables": reports,
    }
