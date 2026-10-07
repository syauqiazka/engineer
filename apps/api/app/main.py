from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.engine.workspace import get_engine
from app.routes.connections import router as connections_router
from app.routes.overview import router as overview_router
from app.routes.pipeline import router as pipeline_router
from app.routes.query import router as query_router
from app.routes.tables import router as tables_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DuckDB workspace engine and realistic seed data
    engine = get_engine()
    print(f"[ENGINE] DuckDB Workspace initialized at: {engine.db_path}")
    yield
    print("[ENGINE] Shutting down DuckDB engine.")


app = FastAPI(
    title="Data Engineer Workbench API",
    description="Backend engine mandiri tanpa layanan pihak ketiga untuk workbench data engineer.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(overview_router, prefix="/api")
app.include_router(tables_router, prefix="/api")
app.include_router(query_router, prefix="/api")
app.include_router(connections_router, prefix="/api")
app.include_router(pipeline_router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "engineer-api",
        "engine": "DuckDB in-process",
        "free_mode": True,
    }
