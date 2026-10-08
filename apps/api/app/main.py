from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.engine.workspace import get_engine
from app.routes.airflow import router as airflow_router
from app.routes.auth import router as auth_router
from app.routes.connections import router as connections_router
from app.routes.files import router as files_router
from app.routes.overview import router as overview_router
from app.routes.pipeline import router as pipeline_router
from app.routes.quality import router as quality_router
from app.routes.query import router as query_router
from app.routes.runner import router as runner_router
from app.routes.runs import router as runs_router
from app.routes.schedules import router as schedules_router
from app.routes.tables import router as tables_router
from app.routes.warehouse import router as warehouse_router
from app.routes.workflows import router as workflows_router


from app.routes.spark import router as spark_router
from app.routes.stream import router as stream_router


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
    version="0.4.0",
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
app.include_router(files_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(quality_router, prefix="/api")
app.include_router(runner_router, prefix="/api")
app.include_router(workflows_router, prefix="/api")
app.include_router(warehouse_router, prefix="/api")
app.include_router(schedules_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(airflow_router, prefix="/api")
app.include_router(stream_router)
app.include_router(spark_router)


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "engineer-api",
        "engine": "DuckDB in-process",
        "free_mode": True,
    }
