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
        from app.connectors.postgres import PostgresConnector

        return PostgresConnector(
            host=config.host,
            port=config.port or 5432,
            database=config.database,
            username=config.username,
            password=password,
            read_only=config.read_only,
        )

    elif kind in ("mysql", "mariadb"):
        from app.connectors.mysql import MySQLConnector

        return MySQLConnector(
            host=config.host,
            port=config.port or 3306,
            database=config.database,
            username=config.username,
            password=password,
            read_only=config.read_only,
        )

    elif kind == "sqlite":
        from app.connectors.sqlite import SQLiteConnector

        db_path = config.database or config.host
        return SQLiteConnector(
            db_path=db_path,
            read_only=config.read_only,
        )

    elif kind == "mongodb":
        from app.connectors.mongodb import MongoDBConnector

        return MongoDBConnector(
            host=config.host or "localhost",
            port=config.port or 27017,
            database=config.database or "test",
            username=config.username,
            password=password,
            read_only=config.read_only,
        )

    elif kind in ("storage", "s3", "minio"):
        from app.connectors.storage import StorageConnector

        return StorageConnector(
            endpoint_url=config.host if config.host.startswith("http") else "",
            bucket_or_path=config.database or config.host or "data",
            access_key=config.username,
            secret_key=password,
            storage_type="s3"
            if (config.host.startswith("http") or kind in ("s3", "minio"))
            else "local",
            read_only=config.read_only,
        )

    elif kind == "files":
        raise ValueError("Konektor file diinstansiasi langsung via FileConnector, bukan registry.")

    elif kind == "duckdb":

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
    "sqlite": Capabilities(
        supports_sql=True, supports_write=True, supports_pushdown=True, supports_explain=False
    ),
    "duckdb": Capabilities(supports_sql=True, supports_write=True, supports_pushdown=True),
    "files": Capabilities(supports_sql=False, supports_write=False),
    "kafka": Capabilities(supports_sql=False, supports_write=True, is_streaming=True),
    "mongodb": Capabilities(supports_sql=False, supports_write=True, has_schema=False),
    "storage": Capabilities(supports_sql=False, supports_write=True, has_schema=True),
    "s3": Capabilities(supports_sql=False, supports_write=True, has_schema=True),
}
