"""
API routes for Local Data Warehouse.
Endpoints for table catalog, manifest inspections, atomic writes, compaction, and vacuum.
"""

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.connectors.base import Batch, WriteMode
from app.warehouse.manager import get_warehouse_manager

router = APIRouter(prefix="/warehouse", tags=["Warehouse"])


class WriteBatchPayload(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    mode: str = Field(default="append")  # "append", "overwrite", "merge"
    merge_keys: list[str] | None = None
    partition_columns: list[str] | None = None
    message: str = ""


class VacuumPayload(BaseModel):
    retention_versions: int = Field(default=3, ge=1)


class CompactionPayload(BaseModel):
    target_size_mb: int = Field(default=64, ge=1)


@router.get("/tables")
def list_warehouse_tables():
    manager = get_warehouse_manager()
    tables = manager.list_tables()
    return {
        "tables": tables,
        "total_tables": len(tables),
        "notice": "Gudang data lokal berjalan di satu mesin (DuckDB + Parquet). Untuk skala terdistribusi lebih besar, gunakan Spark atau ClickHouse.",
    }


@router.get("/tables/{name}")
def get_warehouse_table(name: str):
    manager = get_warehouse_manager()
    details = manager.get_table_details(name)
    if not details:
        raise HTTPException(status_code=404, detail=f"Tabel gudang data '{name}' tidak ditemukan.")
    return details


@router.get("/tables/{name}/preview")
def preview_warehouse_table(name: str, limit: int = 100, sql_filter: str | None = None):
    manager = get_warehouse_manager()
    try:
        return manager.query_table(name, sql_filter=sql_filter, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal membaca tabel: {str(e)}")


@router.post("/tables/{name}/write")
def write_warehouse_table(name: str, payload: WriteBatchPayload):
    manager = get_warehouse_manager()
    try:
        mode_enum = WriteMode(payload.mode.lower())
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Mode tulis '{payload.mode}' tidak valid. Pilihan: append, overwrite, merge.",
        )

    batch = Batch(columns=payload.columns, rows=payload.rows)
    try:
        result = manager.write_table(
            table_name=name,
            batch=batch,
            mode=mode_enum,
            merge_keys=payload.merge_keys,
            partition_columns=payload.partition_columns,
            message=payload.message,
        )
        return {
            "success": result.success,
            "rows_written": result.rows_written,
            "message": result.message,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menulis ke tabel: {str(e)}")


@router.post("/tables/{name}/compaction")
def trigger_compaction(name: str, payload: CompactionPayload = CompactionPayload()):
    manager = get_warehouse_manager()
    try:
        res = manager.compaction(name, target_file_size_mb=payload.target_size_mb)
        return res
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tabel '{name}' tidak ditemukan.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menjalankan compaction: {str(e)}")


@router.post("/tables/{name}/vacuum")
def trigger_vacuum(name: str, payload: VacuumPayload = VacuumPayload()):
    manager = get_warehouse_manager()
    try:
        res = manager.vacuum(name, retention_versions=payload.retention_versions)
        return res
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Tabel '{name}' tidak ditemukan.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal menjalankan vacuum: {str(e)}")
