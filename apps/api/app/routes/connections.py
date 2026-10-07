from fastapi import APIRouter
from pydantic import BaseModel

from app.connectors.base import TestResult

router = APIRouter(prefix="/connections", tags=["Connections"])


class ConnectionDetail(BaseModel):
    id: str
    name: str
    kind: str  # "postgres", "mysql", "duckdb", "kafka", "files"
    environment: str  # "dev", "staging", "prod"
    host: str
    database: str
    read_only: bool
    status: str


@router.get("", response_model=list[ConnectionDetail])
def list_connections():
    return [
        ConnectionDetail(
            id="conn-1",
            name="db_produksi_pg",
            kind="postgres",
            environment="prod",
            host="pg.internal.corp",
            database="analytics_prod",
            read_only=True,
            status="online",
        ),
        ConnectionDetail(
            id="conn-2",
            name="dw_lokal_duckdb",
            kind="duckdb",
            environment="dev",
            host="localhost (workspace)",
            database="workspace.duckdb",
            read_only=False,
            status="online",
        ),
        ConnectionDetail(
            id="conn-3",
            name="stream_events",
            kind="kafka",
            environment="staging",
            host="kafka-broker:9092",
            database="topics/raw_events",
            read_only=True,
            status="online",
        ),
    ]


class TestConnectionRequest(BaseModel):
    kind: str
    host: str
    port: int | None = None
    database: str | None = None
    username: str | None = None
    password: str | None = None


@router.post("/test", response_model=TestResult)
def test_connection(req: TestConnectionRequest):
    # Simulated local test conforming to Connector interface
    if req.kind == "duckdb":
        return TestResult(
            success=True,
            message="Koneksi ke DuckDB workspace berhasil.",
            server_version="DuckDB v1.2.0",
            latency_ms=0.2,
            read_only=False,
        )
    elif req.kind in ("postgres", "mysql"):
        return TestResult(
            success=True,
            message=f"Berhasil terhubung ke {req.kind} di {req.host}",
            server_version=f"{req.kind.upper()} 16.2",
            latency_ms=3.8,
            read_only=True,
        )
    else:
        return TestResult(
            success=True,
            message="Koneksi uji berhasil diverifikasi.",
            latency_ms=1.1,
            read_only=True,
        )
