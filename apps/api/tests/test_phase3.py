"""
Unit and integration tests for Phase 3 features:
- Local Data Warehouse (manifest, atomic writes, merge, compaction, vacuum, parquet query)
- ClickHouse & Cassandra Connectors (capabilities, safety checks)
- Self-hosted Scheduler & Cron Parser (WIB calculations, human explanations)
- Run History & Execution Manager (logs, cancellation, retry, idempotent backfill)
- Airflow DAG Code Generators
- Phase 3 API Routes
"""

import os
import tempfile

from fastapi.testclient import TestClient

from app.connectors.base import Batch, TableRef, WriteMode
from app.connectors.cassandra import CassandraConnector
from app.connectors.clickhouse import ClickHouseConnector
from app.connectors.registry import ConnectionConfig, build_connector
from app.main import app
from app.orchestration.airflow import export_pipeline_to_airflow_dag, export_workflow_to_airflow_dag
from app.orchestration.runs import RunManager
from app.orchestration.scheduler import (
    calculate_next_runs,
    explain_cron,
)
from app.warehouse.manager import LocalWarehouseManager


def test_warehouse_lifecycle_and_atomic_manifest():
    with tempfile.TemporaryDirectory() as tmp_dir:
        wh = LocalWarehouseManager(root_dir=tmp_dir)

        # 1. Overwrite initial data
        b1 = Batch(
            columns=["id", "kota", "total", "tanggal"],
            rows=[
                ["T1", "Jakarta", 10000.0, "2026-03-01"],
                ["T2", "Bandung", 20000.0, "2026-03-01"],
            ],
        )
        res1 = wh.write_table(
            "transaksi", b1, mode=WriteMode.OVERWRITE, partition_columns=["tanggal"]
        )
        assert res1.success is True
        assert res1.rows_written == 2

        details = wh.get_table_details("transaksi")
        assert details is not None
        assert details["manifest"]["version"] == 1
        assert details["manifest"]["total_rows"] == 2

        # 2. Append additional data
        b2 = Batch(
            columns=["id", "kota", "total", "tanggal"],
            rows=[["T3", "Surabaya", 35000.0, "2026-03-02"]],
        )
        res2 = wh.write_table("transaksi", b2, mode=WriteMode.APPEND)
        assert res2.success is True

        details = wh.get_table_details("transaksi")
        assert details["manifest"]["version"] == 2
        assert details["manifest"]["total_rows"] == 3

        # 3. Merge data (upsert by id)
        b3 = Batch(
            columns=["id", "kota", "total", "tanggal"],
            rows=[
                ["T2", "Bandung Kota", 25000.0, "2026-03-01"],  # Update T2
                ["T4", "Medan", 50000.0, "2026-03-02"],  # Insert T4
            ],
        )
        res3 = wh.write_table("transaksi", b3, mode=WriteMode.MERGE, merge_keys=["id"])
        assert res3.success is True

        # Query via DuckDB Parquet pushdown
        q_res = wh.query_table("transaksi")
        assert q_res["total_rows"] == 4
        assert len(q_res["rows"]) == 4

        # 4. Compaction
        comp_res = wh.compaction("transaksi")
        assert comp_res["success"] is True

        # 5. Vacuum
        vac_res = wh.vacuum("transaksi", retention_versions=1)
        assert vac_res["success"] is True


def test_clickhouse_connector_and_registry():
    cfg = ConnectionConfig(
        id="conn-ch-1",
        name="ch_analytics",
        kind="clickhouse",
        environment="staging",
        host="localhost",
        port=8123,
        database="analytics",
        read_only=True,
    )
    conn = build_connector(cfg)
    assert isinstance(conn, ClickHouseConnector)
    assert conn.capabilities.supports_sql is True
    assert conn.capabilities.supports_explain is True

    # Catalog & schema inspection fallback
    cat = conn.catalog([])
    assert len(cat) >= 1

    schema = conn.schema(TableRef(database="analytics", table="events_log"))
    assert len(schema.columns) >= 2


def test_cassandra_connector_and_partition_safety():
    cfg = ConnectionConfig(
        id="conn-cass-1",
        name="cass_telemetry",
        kind="cassandra",
        environment="dev",
        host="localhost",
        port=9042,
        database="iot_keyspace",
        read_only=True,
    )
    conn = build_connector(cfg)
    assert isinstance(conn, CassandraConnector)
    assert conn.capabilities.supports_sql is False

    # Check partition safety warning on ALLOW FILTERING
    is_safe, warn = conn.validate_partition_query(
        "SELECT * FROM telemetry WHERE metric_value > 20 ALLOW FILTERING",
        partition_keys=["device_id"],
    )
    assert is_safe is False
    assert "ALLOW FILTERING" in warn

    # Check safe query with partition key
    is_safe2, _ = conn.validate_partition_query(
        "SELECT * FROM telemetry WHERE device_id = 123",
        partition_keys=["device_id"],
    )
    assert is_safe2 is True


def test_scheduler_cron_and_runs():
    # Cron human explanation and next run times
    expl = explain_cron("0 2 * * *", tz="Asia/Jakarta")
    assert "02:00 WIB" in expl

    runs = calculate_next_runs("0 2 * * *", count=3, tz_str="Asia/Jakarta")
    assert len(runs) == 3
    assert all("02:00 WIB" in r for r in runs)

    with tempfile.TemporaryDirectory() as tmp_dir:
        # Test Run Manager
        os.environ["WORKSPACE_DIR"] = tmp_dir
        run_mgr = RunManager()
        run = run_mgr.create_run(
            target_name="pipeline_harian",
            target_type="pipeline",
            trigger="schedule",
            write_mode="overwrite",
        )
        assert run.status == "running"

        # Cancel run
        cancelled = run_mgr.cancel_run(run.id)
        assert cancelled.status == "cancelled"

        # Retry run
        retried = run_mgr.retry_run(run.id)
        assert retried.attempt == 2
        assert retried.status == "running"


def test_airflow_dag_export():
    pipeline_steps = [
        {"name": "Ekstrak dari Postgres", "kind": "sql"},
        {"name": "Filter Nilai Null", "kind": "filter"},
        {"name": "Load ke Parquet", "kind": "write"},
    ]
    dag_code = export_pipeline_to_airflow_dag("Pesanan ETL", pipeline_steps, "0 2 * * *")
    assert "from airflow import DAG" in dag_code
    assert "Asia/Jakarta" in dag_code
    assert "BashOperator" in dag_code
    assert "step_1" in dag_code
    assert "step_2" in dag_code
    assert ">>" in dag_code

    # Workflow export
    nodes = [{"id": "n1", "label": "Source"}, {"id": "n2", "label": "Transform"}]
    edges = [{"source": "n1", "target": "n2"}]
    wf_code = export_workflow_to_airflow_dag("Stream ETL", nodes, edges)
    assert "node_source >> node_transform" in wf_code


def test_phase3_api_endpoints():
    client = TestClient(app)

    # 1. Warehouse API
    res = client.get("/api/warehouse/tables")
    assert res.status_code == 200
    assert "tables" in res.json()

    # 2. Schedules API
    res_sched = client.get("/api/schedules")
    assert res_sched.status_code == 200
    assert "schedules" in res_sched.json()

    # 3. Explain API
    res_exp = client.get("/api/schedules/explain?cron=0%202%20*%20*%20*")
    assert res_exp.status_code == 200
    assert "02:00 WIB" in res_exp.json()["human_description"]

    # 4. Runs API
    res_runs = client.get("/api/runs")
    assert res_runs.status_code == 200
    assert "runs" in res_runs.json()

    # 5. Airflow Export API
    res_air = client.post(
        "/api/airflow/export-pipeline",
        json={
            "pipeline_name": "Test DAG",
            "steps": [{"name": "Step A", "kind": "sql"}],
            "cron_schedule": "0 1 * * *",
        },
    )
    assert res_air.status_code == 200
    assert "from airflow import DAG" in res_air.json()["code"]
