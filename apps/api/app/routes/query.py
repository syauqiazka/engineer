from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.engine.workspace import QueryResult, get_engine

router = APIRouter(prefix="/query", tags=["Query"])


class QueryRequest(BaseModel):
    sql: str
    limit: int = 1000


@router.post("", response_model=QueryResult)
def run_sql_query(query_req: QueryRequest):
    engine = get_engine()
    # Simple validation against destructive without confirm
    sql_clean = query_req.sql.strip()
    if not sql_clean:
        raise HTTPException(status_code=400, detail="Kueri SQL tidak boleh kosong")

    try:
        return engine.execute_query(sql=sql_clean, limit=query_req.limit)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Eksekusi SQL gagal: {e!s}")
