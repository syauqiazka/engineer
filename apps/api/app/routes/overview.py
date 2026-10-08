from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/overview", tags=["Overview"])


class AttentionItem(BaseModel):
    id: str
    status: str  # "error", "warn", "info"
    status_label: str
    name: str
    time: str
    reason: str
    target_link: str


class TimelineRunBlock(BaseModel):
    run_id: str
    status: str  # "ok", "error", "action", "muted"
    duration_sec: int
    rows_processed: int
    started_at: str


class PipelineTimeline(BaseModel):
    pipeline_name: str
    runs: list[TimelineRunBlock]


class FreshnessItem(BaseModel):
    table_name: str
    last_updated: str
    threshold: str
    is_stale: bool


class QualityBreachItem(BaseModel):
    rule_name: str
    table_name: str
    breach_count: int
    sparkline: list[int]


class ConnectionItem(BaseModel):
    name: str
    kind: str
    environment: str  # "dev", "staging", "prod"
    status: str  # "online", "warning", "offline"
    latency_ms: float


class ResourceMetrics(BaseModel):
    cpu_pct: float
    memory_pct: float
    disk_pct: float
    disk_used_gb: float
    disk_total_gb: float


class OverviewResponse(BaseModel):
    summary_sentence: str
    attention_items: list[AttentionItem]
    timelines: list[PipelineTimeline]
    freshness: list[FreshnessItem]
    quality_breaches: list[QualityBreachItem]
    connections: list[ConnectionItem]
    resources: ResourceMetrics


@router.get("", response_model=OverviewResponse)
def get_overview_data():
    return OverviewResponse(
        summary_sentence="Hari ini: 42 run berhasil, 2 gagal, 1 berjalan. 1 tabel basi. Disk 62%.",
        attention_items=[
            AttentionItem(
                id="att-1",
                status="error",
                status_label="✕ Gagal",
                name="orders_daily",
                time="02:00 WIB",
                reason="Kolom `tanggal` gagal diubah ke date: 31 baris berformat DD/MM/YYYY",
                target_link="/runs",
            ),
            AttentionItem(
                id="att-2",
                status="warn",
                status_label="! Terlambat",
                name="sync_pelanggan",
                time="seharusnya 03:00 WIB",
                reason="Jadwal terlewat, dependensi upstream belum selesai",
                target_link="/schedules",
            ),
            AttentionItem(
                id="att-3",
                status="warn",
                status_label="! Basi",
                name="stg_sensor",
                time="terakhir 2 hari lalu",
                reason="Melewati ambang kesegaran 24 jam",
                target_link="/tables/stg_sensor",
            ),
        ],
        timelines=[
            PipelineTimeline(
                pipeline_name="orders_daily",
                runs=[
                    TimelineRunBlock(
                        run_id="r1",
                        status="ok",
                        duration_sec=42,
                        rows_processed=12400,
                        started_at="00:00",
                    ),
                    TimelineRunBlock(
                        run_id="r2",
                        status="ok",
                        duration_sec=45,
                        rows_processed=12550,
                        started_at="01:00",
                    ),
                    TimelineRunBlock(
                        run_id="r3",
                        status="error",
                        duration_sec=12,
                        rows_processed=0,
                        started_at="02:00",
                    ),
                    TimelineRunBlock(
                        run_id="r4",
                        status="ok",
                        duration_sec=44,
                        rows_processed=12600,
                        started_at="03:00",
                    ),
                    TimelineRunBlock(
                        run_id="r5",
                        status="ok",
                        duration_sec=43,
                        rows_processed=12580,
                        started_at="04:00",
                    ),
                    TimelineRunBlock(
                        run_id="r6",
                        status="action",
                        duration_sec=20,
                        rows_processed=8200,
                        started_at="05:00",
                    ),
                ],
            ),
            PipelineTimeline(
                pipeline_name="sync_pelanggan",
                runs=[
                    TimelineRunBlock(
                        run_id="r7",
                        status="ok",
                        duration_sec=18,
                        rows_processed=420,
                        started_at="00:00",
                    ),
                    TimelineRunBlock(
                        run_id="r8",
                        status="ok",
                        duration_sec=17,
                        rows_processed=430,
                        started_at="01:00",
                    ),
                    TimelineRunBlock(
                        run_id="r9",
                        status="ok",
                        duration_sec=19,
                        rows_processed=425,
                        started_at="02:00",
                    ),
                    TimelineRunBlock(
                        run_id="r10",
                        status="muted",
                        duration_sec=0,
                        rows_processed=0,
                        started_at="03:00",
                    ),
                ],
            ),
            PipelineTimeline(
                pipeline_name="sensor_telemetry_clean",
                runs=[
                    TimelineRunBlock(
                        run_id="r11",
                        status="ok",
                        duration_sec=95,
                        rows_processed=182000,
                        started_at="00:00",
                    ),
                    TimelineRunBlock(
                        run_id="r12",
                        status="ok",
                        duration_sec=92,
                        rows_processed=183200,
                        started_at="02:00",
                    ),
                    TimelineRunBlock(
                        run_id="r13",
                        status="ok",
                        duration_sec=89,
                        rows_processed=180100,
                        started_at="04:00",
                    ),
                ],
            ),
        ],
        freshness=[
            FreshnessItem(
                table_name="pesanan_harian",
                last_updated="10 menit lalu",
                threshold="1 jam",
                is_stale=False,
            ),
            FreshnessItem(
                table_name="stg_sensor",
                last_updated="2 hari lalu",
                threshold="24 jam",
                is_stale=True,
            ),
            FreshnessItem(
                table_name="dim_pelanggan",
                last_updated="5 jam lalu",
                threshold="12 jam",
                is_stale=False,
            ),
        ],
        quality_breaches=[
            QualityBreachItem(
                rule_name="tanggal NOT NULL",
                table_name="pesanan_harian",
                breach_count=1,
                sparkline=[0, 0, 1, 0, 2, 1, 1],
            ),
            QualityBreachItem(
                rule_name="jumlah > 0",
                table_name="pesanan_harian",
                breach_count=1,
                sparkline=[0, 1, 0, 0, 0, 1, 1],
            ),
            QualityBreachItem(
                rule_name="suhu_celsius BETWEEN -10 AND 50",
                table_name="stg_sensor",
                breach_count=0,
                sparkline=[0, 0, 0, 0, 0, 0, 0],
            ),
        ],
        connections=[
            ConnectionItem(
                name="db_produksi_pg",
                kind="postgres",
                environment="prod",
                status="online",
                latency_ms=4.2,
            ),
            ConnectionItem(
                name="dw_lokal_duckdb",
                kind="duckdb",
                environment="dev",
                status="online",
                latency_ms=0.3,
            ),
            ConnectionItem(
                name="clickhouse_analytics",
                kind="clickhouse",
                environment="staging",
                status="online",
                latency_ms=8.5,
            ),
            ConnectionItem(
                name="cassandra_iot",
                kind="cassandra",
                environment="dev",
                status="online",
                latency_ms=6.2,
            ),
            ConnectionItem(
                name="stream_events",
                kind="kafka",
                environment="staging",
                status="online",
                latency_ms=12.1,
            ),
        ],
        resources=ResourceMetrics(
            cpu_pct=18.4, memory_pct=34.2, disk_pct=62.0, disk_used_gb=124.0, disk_total_gb=200.0
        ),
    )
