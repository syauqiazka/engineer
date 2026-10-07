"""
Registry konektor: mapping dari kind string ke class konektor.
Menambah konektor baru = satu modul + entri di sini, tanpa if/else di routes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.connectors.base import Capabilities, TestResult


@dataclass
class ConnectionConfig:
    """Konfigurasi koneksi yang disimpan (tanpa password—disimpan di secret store nanti)."""

    id: str
    name: str
    kind: str
    environment: str  # "dev", "staging", "prod"
    host: str = ""
    port: int | None = None
    database: str = ""
    username: str = ""
    read_only: bool = True
    # Password disimpan terpisah; di Fase 1 pakai plaintext env/in-memory
    _password: str = ""


def build_connector(config: ConnectionConfig, password: str = "") -> Any:
    """
    Buat instance konektor dari konfigurasi.
    Mengembalikan objek yang mengimplementasikan Connector Protocol.
    """
    kind = config.kind.lower()

    if kind == "postgres":
        from app.connectors.postgres import PostgresConnector  # noqa: PLC0415

        return PostgresConnector(
            host=config.host,
            port=config.port or 5432,
            database=config.database,
            username=config.username,
            password=password,
            read_only=config.read_only,
        )

    elif kind in ("mysql", "mariadb"):
        from app.connectors.mysql import MySQLConnector  # noqa: PLC0415

        return MySQLConnector(
            host=config.host,
            port=config.port or 3306,
            database=config.database,
            username=config.username,
            password=password,
            read_only=config.read_only,
        )

    elif kind == "files":
        raise ValueError("Konektor file diinstansiasi langsung via FileConnector, bukan registry.")

    elif kind == "duckdb":
        # Koneksi ke workspace DuckDB internal
        from app.engine.workspace import get_engine  # noqa: PLC0415

        engine = get_engine()

        class _DuckDBConnector:
            kind = "duckdb"
            capabilities = Capabilities(
                supports_sql=True,
                supports_write=True,
                supports_pushdown=True,
            )

            def test(self) -> TestResult:
                return TestResult(
                    success=True,
                    message="DuckDB workspace aktif.",
                    server_version="DuckDB in-process",
                    latency_ms=0.1,
                    read_only=False,
                )

        return _DuckDBConnector()

    else:
        raise ValueError(f"Jenis konektor tidak dikenali: '{kind}'")


# Registry capabilities per kind (untuk UI — menampilkan fitur apa yang tersedia)
KIND_CAPABILITIES: dict[str, Capabilities] = {
    "postgres": Capabilities(
        supports_sql=True, supports_write=True, supports_pushdown=True, supports_explain=True
    ),
    "mysql": Capabilities(
        supports_sql=True, supports_write=True, supports_pushdown=True, supports_explain=True
    ),
    "mariadb": Capabilities(
        supports_sql=True, supports_write=True, supports_pushdown=True, supports_explain=True
    ),
    "duckdb": Capabilities(supports_sql=True, supports_write=True, supports_pushdown=True),
    "files": Capabilities(supports_sql=False, supports_write=False),
    "kafka": Capabilities(supports_sql=False, supports_write=True, is_streaming=True),
    "mongodb": Capabilities(supports_sql=False, supports_write=True, has_schema=False),
}
