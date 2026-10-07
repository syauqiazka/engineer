from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.engine.workspace import ColumnProfile, TableSummary, get_engine

router = APIRouter(prefix="/tables", tags=["Tables"])


class CellEditRequest(BaseModel):
    id_column: str
    id_value: Any
    column_name: str
    new_value: Any


class CellEditResponse(BaseModel):
    success: bool
    message: str


@router.get("", response_model=list[TableSummary])
def list_workspace_tables():
    engine = get_engine()
    return engine.list_tables()


@router.get("/{table_name}/data")
def get_table_data(
    table_name: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
):
    engine = get_engine()
    try:
        return engine.get_table_data(table_name=table_name, offset=offset, limit=limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=404, detail=f"Tabel '{table_name}' tidak ditemukan: {e!s}")


@router.get("/{table_name}/profile", response_model=list[ColumnProfile])
def get_table_profile(table_name: str):
    engine = get_engine()
    try:
        return engine.profile_table(table_name=table_name)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(
            status_code=404, detail=f"Gagal memuat profil tabel '{table_name}': {e!s}"
        )


@router.post("/{table_name}/edit", response_model=CellEditResponse)
def edit_table_cell(table_name: str, edit_req: CellEditRequest):
    engine = get_engine()
    try:
        engine.update_cell(
            table_name=table_name,
            id_col=edit_req.id_column,
            id_val=edit_req.id_value,
            col_name=edit_req.column_name,
            new_val=edit_req.new_value,
        )
        return CellEditResponse(
            success=True,
            message=f"Berhasil memperbarui kolom {edit_req.column_name} pada baris {edit_req.id_value}",
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Gagal memperbarui sel: {e!s}")
