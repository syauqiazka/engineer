"""
Route koneksi: CRUD koneksi + test koneksi nyata.
Fase 1: penyimpanan in-memory (map id → ConnectionConfig).
Fase 2: pindah ke secret store + DB persisten.
"""

from __future__ import annotations

import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.connectors.base import TestResult
from app.connectors.registry import ConnectionConfig, KIND_CAPABILITIES, build_connector

router = APIRouter(prefix="/connections", tags=["Connections"])

# -----------------------------------------------------------------------
# In-memory store (Fase 1 — diganti secret store di Fase 2)
# -----------------------------------------------------------------------
_connections: dict[str, ConnectionConfig] = {
    "conn-duckdb-local": ConnectionConfig(
        id="conn-duckdb-local",
        name="dw_lokal_duckdb",
        kind="duckdb",
        environment="dev",
        host="localhost (workspace)",
        database="workspace.duckdb",
        read_only=False,
    )
}
_passwords: dict[str, str] = {}  # id → password plaintext (Fase 1)


# -----------------------------------------------------------------------
# Pydantic models
# -----------------------------------------------------------------------


class ConnectionDetail(BaseModel):
    id: str
    name: str
    kind: str
    environment: str
    host: str
    port: int | None = None
    database: str
    username: str = ""
    read_only: bool
    status: str = "unknown"  # unknown / online / offline
    capabilities: dict[str, Any] = Field(default_factory=dict)


class CreateConnectionRequest(BaseModel):
    name: str
    kind: str  # "postgres", "mysql", "duckdb"
    environment: str = "dev"
    host: str = ""
    port: int | None = None
    database: str = ""
    username: str = ""
    password: str = ""  # Hanya dipakai saat create/update; tidak pernah dikembalikan
    read_only: bool = True


class UpdateConnectionRequest(BaseModel):
    name: str | None = None
    environment: str | None = None
    host: str | None = None
    port: int | None = None
    database: str | None = None
    username: str | None = None
    password: str | None = None
    read_only: bool | None = None


class TestConnectionRequest(BaseModel):
    kind: str
    host: str = ""
    port: int | None = None
    database: str = ""
    username: str = ""
    password: str = ""
    read_only: bool = True


class ConnectionTestResult(BaseModel):
    success: bool
    message: str
    server_version: str | None = None
    latency_ms: float | None = None
    read_only: bool = True


# -----------------------------------------------------------------------
# Helper
# -----------------------------------------------------------------------


def _to_detail(cfg: ConnectionConfig) -> ConnectionDetail:
    caps = KIND_CAPABILITIES.get(cfg.kind, {})
    caps_dict = {}
    if caps:
        caps_dict = {
            "supports_sql": caps.supports_sql,
            "supports_write": caps.supports_write,
            "supports_pushdown": caps.supports_pushdown,
            "is_streaming": caps.is_streaming,
        }
    return ConnectionDetail(
        id=cfg.id,
        name=cfg.name,
        kind=cfg.kind,
        environment=cfg.environment,
        host=cfg.host,
        port=cfg.port,
        database=cfg.database,
        username=cfg.username,
        read_only=cfg.read_only,
        capabilities=caps_dict,
    )


# -----------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------


@router.get("", response_model=list[ConnectionDetail])
def list_connections():
    return [_to_detail(cfg) for cfg in _connections.values()]


@router.get("/{conn_id}", response_model=ConnectionDetail)
def get_connection(conn_id: str):
    cfg = _connections.get(conn_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")
    return _to_detail(cfg)


@router.post("", response_model=ConnectionDetail, status_code=201)
def create_connection(req: CreateConnectionRequest):
    conn_id = f"conn-{uuid.uuid4().hex[:8]}"
    cfg = ConnectionConfig(
        id=conn_id,
        name=req.name,
        kind=req.kind.lower(),
        environment=req.environment,
        host=req.host,
        port=req.port,
        database=req.database,
        username=req.username,
        read_only=req.read_only,
    )
    _connections[conn_id] = cfg
    if req.password:
        _passwords[conn_id] = req.password
    return _to_detail(cfg)


@router.patch("/{conn_id}", response_model=ConnectionDetail)
def update_connection(conn_id: str, req: UpdateConnectionRequest):
    cfg = _connections.get(conn_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")

    updated = ConnectionConfig(
        id=cfg.id,
        name=req.name if req.name is not None else cfg.name,
        kind=cfg.kind,
        environment=req.environment if req.environment is not None else cfg.environment,
        host=req.host if req.host is not None else cfg.host,
        port=req.port if req.port is not None else cfg.port,
        database=req.database if req.database is not None else cfg.database,
        username=req.username if req.username is not None else cfg.username,
        read_only=req.read_only if req.read_only is not None else cfg.read_only,
    )
    _connections[conn_id] = updated
    if req.password is not None:
        _passwords[conn_id] = req.password
    return _to_detail(updated)


@router.delete("/{conn_id}", status_code=204)
def delete_connection(conn_id: str):
    if conn_id not in _connections:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")
    del _connections[conn_id]
    _passwords.pop(conn_id, None)


@router.post("/test", response_model=ConnectionTestResult)
def test_connection_adhoc(req: TestConnectionRequest):
    """Test koneksi nyata tanpa menyimpan."""
    t0 = time.perf_counter()

    if req.kind == "duckdb":
        return ConnectionTestResult(
            success=True,
            message="DuckDB workspace aktif dan siap.",
            server_version="DuckDB in-process",
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            read_only=False,
        )

    # Build temporary connector
    tmp_cfg = ConnectionConfig(
        id="_tmp",
        name="_tmp",
        kind=req.kind,
        environment="dev",
        host=req.host,
        port=req.port,
        database=req.database,
        username=req.username,
        read_only=req.read_only,
    )
    try:
        connector = build_connector(tmp_cfg, password=req.password)
        result: TestResult = connector.test()
        return ConnectionTestResult(
            success=result.success,
            message=result.message,
            server_version=result.server_version,
            latency_ms=result.latency_ms,
            read_only=result.read_only,
        )
    except Exception as e:  # noqa: BLE001
        return ConnectionTestResult(success=False, message=str(e))


@router.post("/{conn_id}/test", response_model=ConnectionTestResult)
def test_saved_connection(conn_id: str):
    """Test koneksi yang sudah disimpan."""
    cfg = _connections.get(conn_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")
    password = _passwords.get(conn_id, "")
    try:
        connector = build_connector(cfg, password=password)
        result: TestResult = connector.test()
        return ConnectionTestResult(
            success=result.success,
            message=result.message,
            server_version=result.server_version,
            latency_ms=result.latency_ms,
            read_only=result.read_only,
        )
    except Exception as e:  # noqa: BLE001
        return ConnectionTestResult(success=False, message=str(e))


@router.get("/{conn_id}/catalog")
def get_connection_catalog(conn_id: str, path: str = ""):
    """Jelajahi katalog sumber data (database > schema > tabel)."""
    cfg = _connections.get(conn_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")
    password = _passwords.get(conn_id, "")
    path_list = [p for p in path.split("/") if p] if path else []
    try:
        connector = build_connector(cfg, password=password)
        nodes = connector.catalog(path_list)
        return [
            {
                "name": n.name,
                "node_type": n.node_type,
                "table_ref": (
                    {
                        "database": n.table_ref.database,
                        "schema": n.table_ref.schema,
                        "table": n.table_ref.table,
                    }
                    if n.table_ref
                    else None
                ),
            }
            for n in nodes
        ]
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e))
