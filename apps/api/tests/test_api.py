from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"


def test_list_tables():
    res = client.get("/api/tables")
    assert res.status_code == 200
    tables = res.json()
    assert any(t["name"] == "pesanan_harian" for t in tables)


def test_table_profile():
    res = client.get("/api/tables/pesanan_harian/profile")
    assert res.status_code == 200
    profiles = res.json()
    assert len(profiles) > 0
    # Check null count on tanggal
    col_tgl = next(p for p in profiles if p["name"] == "tanggal")
    assert col_tgl["null_count"] == 1


def test_query_duckdb():
    res = client.post("/api/query", json={"sql": "SELECT COUNT(*) as cnt FROM pesanan_harian"})
    assert res.status_code == 200
    data = res.json()
    assert data["rows"][0][0] == 12


def test_pipeline_codegen():
    res = client.post(
        "/api/pipeline/codegen",
        json={
            "source_table": "pesanan_harian",
            "steps": [
                {
                    "id": "s1",
                    "kind": "filter",
                    "name": "Filter Lunas",
                    "params": {
                        "column": "status_bayar",
                        "value": "Lunas",
                        "condition": "status_bayar = 'Lunas'",
                    },
                    "enabled": True,
                }
            ],
        },
    )
    assert res.status_code == 200
    codes = res.json()
    assert "polars" in codes
    assert "pandas" in codes
    assert "WHERE status_bayar = 'Lunas'" in codes["sql"]
