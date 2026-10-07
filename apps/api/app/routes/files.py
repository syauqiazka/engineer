"""
Route untuk upload file (CSV/TSV/Excel/JSON/Parquet) ke workspace DuckDB,
dan export tabel dari workspace ke berbagai format.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.connectors.files import SUPPORTED_EXTENSIONS, read_file_bytes_to_workspace
from app.engine.workspace import get_engine

router = APIRouter(prefix="/files", tags=["Files & Import/Export"])

# Batas ukuran upload: 200 MB
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


class ImportResult(BaseModel):
    success: bool
    table_name: str
    row_count: int
    column_count: int
    message: str


class ExportFormatInfo(BaseModel):
    formats: list[str]
    max_rows_csv: int
    max_rows_excel: int
    max_rows_parquet: int


@router.get("/export-info", response_model=ExportFormatInfo)
def get_export_info():
    return ExportFormatInfo(
        formats=["csv", "tsv", "xlsx", "json", "parquet"],
        max_rows_csv=1_000_000,
        max_rows_excel=1_048_576,
        max_rows_parquet=100_000_000,
    )


@router.post("/import", response_model=ImportResult)
async def import_file(
    file: UploadFile = File(...),
    table_name: Annotated[str | None, Form()] = None,
):
    """
    Upload file ke workspace dan buat tabel baru di DuckDB.
    Format yang didukung: CSV, TSV, Excel (.xlsx/.xls), JSON, NDJSON, Parquet.
    Batas ukuran: 200 MB.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nama file tidak boleh kosong.")

    ext = Path(file.filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Format tidak didukung: '{ext}'. "
            f"Format yang diterima: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File terlalu besar ({len(content) // (1024*1024)} MB). Batas: 200 MB.",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File kosong.")

    engine = get_engine()
    try:
        result = read_file_bytes_to_workspace(
            file_bytes=content,
            filename=file.filename,
            workspace_conn=engine.conn,
            table_name=table_name,
            content_type=file.content_type,
        )
        return ImportResult(
            success=True,
            table_name=result["table_name"],
            row_count=result["row_count"],
            column_count=result["column_count"],
            message=f"Berhasil mengimpor {result['row_count']:,} baris ke tabel '{result['table_name']}'.",
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Gagal mengimpor file: {e!s}")


@router.get("/export/{table_name}")
def export_table(
    table_name: str,
    fmt: str = "csv",
    limit: int = 1_000_000,
):
    """
    Ekspor tabel dari workspace ke format yang diminta.
    Format: csv, tsv, json, parquet, xlsx.
    """
    engine = get_engine()

    # Validasi tabel ada
    try:
        tables_res = engine.conn.execute("SHOW TABLES").fetchall()
        table_names = [t[0] for t in tables_res]
        if table_name not in table_names:
            raise HTTPException(status_code=404, detail=f"Tabel '{table_name}' tidak ditemukan.")
    except Exception as e:  # noqa: BLE001
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail=str(e))

    fmt = fmt.lower()
    safe_limit = min(limit, 100_000_000)

    try:
        if fmt in ("csv", "tsv"):
            sep = "\t" if fmt == "tsv" else ","
            buf = io.StringIO()
            # Header
            desc = engine.conn.execute(f'DESCRIBE "{table_name}"').fetchall()
            cols = [d[0] for d in desc]
            buf.write(sep.join(cols) + "\n")
            # Data
            rows = engine.conn.execute(
                f'SELECT * FROM "{table_name}" LIMIT {safe_limit}'
            ).fetchall()
            for row in rows:
                line = sep.join(
                    "" if v is None else str(v).replace('"', '""') for v in row
                )
                buf.write(line + "\n")
            content_bytes = buf.getvalue().encode("utf-8-sig")  # BOM untuk Excel compat
            media_type = "text/csv" if fmt == "csv" else "text/tab-separated-values"
            filename = f"{table_name}.{fmt}"
            return StreamingResponse(
                iter([content_bytes]),
                media_type=media_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{filename}"',
                    "Content-Length": str(len(content_bytes)),
                },
            )

        elif fmt == "json":
            import json  # noqa: PLC0415

            rows = engine.conn.execute(
                f'SELECT * FROM "{table_name}" LIMIT {safe_limit}'
            ).fetchall()
            desc = engine.conn.execute(f'DESCRIBE "{table_name}"').fetchall()
            cols = [d[0] for d in desc]
            records = [dict(zip(cols, r, strict=False)) for r in rows]
            content_bytes = json.dumps(records, ensure_ascii=False, default=str).encode("utf-8")
            return StreamingResponse(
                iter([content_bytes]),
                media_type="application/json",
                headers={
                    "Content-Disposition": f'attachment; filename="{table_name}.json"',
                    "Content-Length": str(len(content_bytes)),
                },
            )

        elif fmt == "parquet":
            import tempfile  # noqa: PLC0415
            from pathlib import Path as _Path  # noqa: PLC0415

            with tempfile.NamedTemporaryFile(suffix=".parquet", delete=False) as tmp:
                tmp_path = _Path(tmp.name)

            try:
                engine.conn.execute(
                    f"COPY (SELECT * FROM \"{table_name}\" LIMIT {safe_limit}) "
                    f"TO '{str(tmp_path).replace(chr(92), '/')}' (FORMAT PARQUET)"
                )
                content_bytes = tmp_path.read_bytes()
            finally:
                tmp_path.unlink(missing_ok=True)

            return StreamingResponse(
                iter([content_bytes]),
                media_type="application/octet-stream",
                headers={
                    "Content-Disposition": f'attachment; filename="{table_name}.parquet"',
                    "Content-Length": str(len(content_bytes)),
                },
            )

        elif fmt == "xlsx":
            import pandas as _pd  # noqa: PLC0415

            max_excel = min(safe_limit, 1_048_576)
            rows = engine.conn.execute(
                f'SELECT * FROM "{table_name}" LIMIT {max_excel}'
            ).fetchall()
            desc = engine.conn.execute(f'DESCRIBE "{table_name}"').fetchall()
            cols = [d[0] for d in desc]
            df = _pd.DataFrame(rows, columns=cols)
            buf = io.BytesIO()
            df.to_excel(buf, index=False, engine="openpyxl")
            content_bytes = buf.getvalue()
            return StreamingResponse(
                iter([content_bytes]),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition": f'attachment; filename="{table_name}.xlsx"',
                    "Content-Length": str(len(content_bytes)),
                },
            )

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Format ekspor tidak didukung: '{fmt}'. Pilih: csv, tsv, json, parquet, xlsx",
            )

    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Gagal ekspor: {e!s}")
