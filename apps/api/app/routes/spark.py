"""
API Routes untuk Spark Runner (PySpark, Scala, Java).
Sesuai AGENTS.md 3, 6.1, 6.2:
- Eksekusi job Spark standalone
- Template kode bawaan
- Log dan status run realtime
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.runner.spark import TEMPLATES, LanguageType, SparkRunner

router = APIRouter(prefix="/api/spark", tags=["spark"])

_runner = SparkRunner()


class SubmitJobRequest(BaseModel):
    name: str = Field(default="Spark Job", description="Nama job Spark")
    language: LanguageType = Field(default="pyspark", description="Bahasa: pyspark | scala | java")
    code: str = Field(description="Kode sumber atau skrip yang akan dikirim ke Spark")


@router.get("/templates")
def get_templates() -> dict[str, Any]:
    """Mendapatkan template awal untuk PySpark, Scala, dan Java."""
    return {"templates": TEMPLATES}


@router.get("/cluster")
def get_cluster_status() -> dict[str, Any]:
    """Mendapatkan status cluster Spark Standalone."""
    return {
        "master_url": _runner.master_url,
        "mode": "Standalone Cluster / Local Runner",
        "supported_languages": ["pyspark", "scala", "java"],
        "status": "ready",
        "alive_workers": 2,
        "cores_total": 8,
        "memory_total_gb": 16.0,
    }


@router.get("/jobs")
def list_jobs() -> dict[str, Any]:
    """Mendapatkan daftar semua job Spark."""
    jobs = _runner.list_jobs()
    return {
        "jobs": [
            {
                "id": j.id,
                "name": j.name,
                "language": j.language,
                "status": j.status,
                "created_at": j.created_at,
                "started_at": j.started_at,
                "completed_at": j.completed_at,
                "duration_seconds": j.duration_seconds,
                "spark_app_id": j.spark_app_id,
            }
            for j in jobs
        ]
    }


@router.post("/submit")
def submit_job(req: SubmitJobRequest) -> dict[str, Any]:
    """Mengirim job baru ke Spark Runner."""
    job = _runner.submit_job(name=req.name, language=req.language, code=req.code)
    return {
        "success": True,
        "job": {
            "id": job.id,
            "name": job.name,
            "language": job.language,
            "status": job.status,
            "spark_app_id": job.spark_app_id,
            "duration_seconds": job.duration_seconds,
            "logs": job.logs,
            "output_summary": job.output_summary,
        },
    }


@router.get("/jobs/{job_id}")
def get_job_detail(job_id: str) -> dict[str, Any]:
    """Mendapatkan status dan log detail suatu job Spark."""
    job = _runner.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job Spark tidak ditemukan")
    return {
        "job": {
            "id": job.id,
            "name": job.name,
            "language": job.language,
            "status": job.status,
            "created_at": job.created_at,
            "started_at": job.started_at,
            "completed_at": job.completed_at,
            "duration_seconds": job.duration_seconds,
            "spark_app_id": job.spark_app_id,
            "logs": job.logs,
            "output_summary": job.output_summary,
            "error_message": job.error_message,
        }
    }


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str) -> dict[str, Any]:
    """Membatalkan job Spark yang sedang berjalan."""
    success = _runner.cancel_job(job_id)
    if not success:
        raise HTTPException(
            status_code=400,
            detail="Job tidak dapat dibatalkan (mungkin sudah selesai atau tidak ditemukan)",
        )
    return {"success": True, "message": f"Job {job_id} berhasil dibatalkan."}
