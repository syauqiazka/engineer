"""
Route koneksi: CRUD koneksi + test koneksi nyata.
Fase 2:
- Terintegrasi dengan SecretStore terenkripsi AES-GCM (tanpa plaintext password di memory/response)
- Mendukung konektor PostgreSQL, MySQL/MariaDB, SQLite, MongoDB, Storage (S3-compat/Lokal), DuckDB
- Pemeriksaan peran pengguna (viewer, editor, admin) & pencatatan audit log
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.connectors.base import TestResult
from app.connectors.registry import KIND_CAPABILITIES, ConnectionConfig, build_connector
from app.security.auth import Session, get_auth_manager, require_role
from app.security.secrets import get_secret_store

router = APIRouter(prefix="/connections", tags=["Connections"])

# File penyimpanan metadata koneksi persisten
_CONNECTIONS_FILE = (
    Path(__file__).resolve().parent.parent.parent / "workspace_data" / "connections.json"
)


def _load_persisted_connections() -> dict[str, ConnectionConfig]:
    if not _CONNECTIONS_FILE.exists():
        # Default dev connection
        initial = {
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
        _save_persisted_connections(initial)
        return initial

    try:
        raw = json.loads(_CONNECTIONS_FILE.read_text(encoding="utf-8"))
        conns: dict[str, ConnectionConfig] = {}
        for cid, c in raw.items():
            conns[cid] = ConnectionConfig(
                id=c["id"],
                name=c["name"],
                kind=c["kind"],
                environment=c.get("environment", "dev"),
                host=c.get("host", ""),
                port=c.get("port"),
                database=c.get("database", ""),
                username=c.get("username", ""),
                read_only=c.get("read_only", True),
            )
        return conns
    except Exception:
        return {}


def _save_persisted_connections(conns: dict[str, ConnectionConfig]) -> None:
    _CONNECTIONS_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        cid: {
            "id": c.id,
            "name": c.name,
            "kind": c.kind,
            "environment": c.environment,
            "host": c.host,
            "port": c.port,
            "database": c.database,
            "username": c.username,
            "read_only": c.read_only,
        }
        for cid, c in conns.items()
    }
    _CONNECTIONS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


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
    status: str = "online"
    has_encrypted_password: bool = False
    capabilities: dict[str, Any] = Field(default_factory=dict)


class CreateConnectionRequest(BaseModel):
    name: str
    kind: str  # "postgres", "mysql", "duckdb", "sqlite", "mongodb", "storage"
    environment: str = "dev"
    host: str = ""
    port: int | None = None
    database: str = ""
    username: str = ""
    password: str = ""  # Dienkripsi via SecretStore, tidak pernah disimpan plaintext
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


def _to_detail(cfg: ConnectionConfig) -> ConnectionDetail:
    caps = KIND_CAPABILITIES.get(cfg.kind)
    caps_dict = {}
    if caps:
        caps_dict = {
            "supports_sql": caps.supports_sql,
            "supports_write": caps.supports_write,
            "supports_pushdown": caps.supports_pushdown,
            "is_streaming": caps.is_streaming,
            "has_schema": caps.has_schema,
        }

    secrets = get_secret_store()
    has_pw = bool(secrets.get_secret(f"conn_pw_{cfg.id}"))

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
        has_encrypted_password=has_pw,
        capabilities=caps_dict,
    )


# -----------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------


@router.get("", response_model=list[ConnectionDetail])
def list_connections(user: Session = Depends(require_role("viewer"))):
    conns = _load_persisted_connections()
    return [_to_detail(cfg) for cfg in conns.values()]


@router.get("/{conn_id}", response_model=ConnectionDetail)
def get_connection(conn_id: str, user: Session = Depends(require_role("viewer"))):
    conns = _load_persisted_connections()
    cfg = conns.get(conn_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")
    return _to_detail(cfg)


@router.post("", response_model=ConnectionDetail, status_code=201)
def create_connection(
    req: CreateConnectionRequest,
    user: Session = Depends(require_role("editor")),
):
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

    conns = _load_persisted_connections()
    conns[conn_id] = cfg
    _save_persisted_connections(conns)

    # Simpan password terenkripsi via SecretStore
    if req.password:
        secrets = get_secret_store()
        secrets.save_secret(f"conn_pw_{conn_id}", req.password)

    auth = get_auth_manager()
    auth.log_audit(
        username=user.username,
        role=user.role,
        action="create_connection",
        target=f"{req.kind}://{req.name}",
        status="success",
    )

    return _to_detail(cfg)


@router.patch("/{conn_id}", response_model=ConnectionDetail)
def update_connection(
    conn_id: str,
    req: UpdateConnectionRequest,
    user: Session = Depends(require_role("editor")),
):
    conns = _load_persisted_connections()
    cfg = conns.get(conn_id)
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
    conns[conn_id] = updated
    _save_persisted_connections(conns)

    if req.password is not None:
        secrets = get_secret_store()
        secrets.save_secret(f"conn_pw_{conn_id}", req.password)

    auth = get_auth_manager()
    auth.log_audit(
        username=user.username,
        role=user.role,
        action="update_connection",
        target=conn_id,
        status="success",
    )

    return _to_detail(updated)


@router.delete("/{conn_id}", status_code=204)
def delete_connection(
    conn_id: str,
    user: Session = Depends(require_role("admin")),
):
    conns = _load_persisted_connections()
    if conn_id not in conns:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")
    del conns[conn_id]
    _save_persisted_connections(conns)

    secrets = get_secret_store()
    secrets.delete_secret(f"conn_pw_{conn_id}")

    auth = get_auth_manager()
    auth.log_audit(
        username=user.username,
        role=user.role,
        action="delete_connection",
        target=conn_id,
        status="success",
    )


@router.post("/test", response_model=ConnectionTestResult)
def test_connection_adhoc(req: TestConnectionRequest):
    """Test koneksi nyata tanpa menyimpan kredensial."""
    t0 = time.perf_counter()

    if req.kind == "duckdb":
        return ConnectionTestResult(
            success=True,
            message="DuckDB workspace aktif dan siap.",
            server_version="DuckDB in-process",
            latency_ms=round((time.perf_counter() - t0) * 1000, 2),
            read_only=False,
        )

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
    """Test koneksi yang sudah disimpan dengan password terenkripsi dari SecretStore."""
    conns = _load_persisted_connections()
    cfg = conns.get(conn_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")

    secrets = get_secret_store()
    password = secrets.get_secret(f"conn_pw_{conn_id}", default="")

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
def get_connection_catalog(
    conn_id: str,
    path: str = "",
    user: Session = Depends(require_role("viewer")),
):
    """Jelajahi katalog sumber data."""
    conns = _load_persisted_connections()
    cfg = conns.get(conn_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Koneksi '{conn_id}' tidak ditemukan.")

    secrets = get_secret_store()
    password = secrets.get_secret(f"conn_pw_{conn_id}", default="")

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
