from fastapi.testclient import TestClient

from app.connectors.kafka import KafkaConnector
from app.main import app
from app.runner.spark import SparkRunner

client = TestClient(app)


def test_kafka_connector_peek_and_produce():
    connector = KafkaConnector()
    res = connector.test()
    assert res.success is True

    # Peek non-destructive
    messages = connector.peek("stream_pesanan_realtime", partition=0, limit=5)
    assert len(messages) == 5
    assert messages[0].partition == 0
    assert "id_pesanan" in messages[0].value

    # Producer
    prod_res = connector.produce(
        topic="stream_pesanan_realtime",
        key="test-key-1",
        value={"id_pesanan": "TRX-TEST-999", "total_bayar": 125000},
    )
    assert prod_res["success"] is True
    assert prod_res["message"]["key"] == "test-key-1"

    # Consumer lag
    lags = connector.get_consumer_lag("stream_pesanan_realtime")
    assert len(lags) == 3
    assert all(l.lag >= 0 for l in lags)


def test_stream_api_endpoints():
    # Status
    status_resp = client.get("/api/stream/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["success"] is True

    # Topics
    topics_resp = client.get("/api/stream/topics")
    assert topics_resp.status_code == 200
    topics = topics_resp.json()["topics"]
    assert len(topics) >= 1

    topic_name = topics[0]["name"]

    # Peek messages
    peek_resp = client.get(f"/api/stream/topics/{topic_name}/messages?limit=10")
    assert peek_resp.status_code == 200
    data = peek_resp.json()
    assert data["notice"] == "Pratinjau tidak mengubah offset consumer."
    assert len(data["messages"]) == 10

    # Lag
    lag_resp = client.get(f"/api/stream/topics/{topic_name}/lag")
    assert lag_resp.status_code == 200
    assert "partitions" in lag_resp.json()

    # Produce
    produce_resp = client.post(
        f"/api/stream/topics/{topic_name}/produce",
        json={"key": "k-user-1", "value": {"test": 123}},
    )
    assert produce_resp.status_code == 200
    assert produce_resp.json()["success"] is True


def test_spark_runner_and_api():
    runner = SparkRunner()
    job = runner.submit_job(
        name="Test Scala Job",
        language="scala",
        code="println('test')",
    )
    assert job.status == "success"
    assert len(job.logs) > 0
    assert job.duration_seconds >= 0

    # Test API templates
    t_resp = client.get("/api/spark/templates")
    assert t_resp.status_code == 200
    templates = t_resp.json()["templates"]
    assert "pyspark" in templates
    assert "scala" in templates
    assert "java" in templates

    # Test API cluster info
    c_resp = client.get("/api/spark/cluster")
    assert c_resp.status_code == 200
    assert c_resp.json()["status"] == "ready"

    # Test API submit
    sub_resp = client.post(
        "/api/spark/submit",
        json={
            "name": "Integration Test Job",
            "language": "pyspark",
            "code": "print('hello from spark')",
        },
    )
    assert sub_resp.status_code == 200
    resp_job = sub_resp.json()["job"]
    assert resp_job["status"] == "success"
    job_id = resp_job["id"]

    # Test API job detail
    detail_resp = client.get(f"/api/spark/jobs/{job_id}")
    assert detail_resp.status_code == 200
    assert detail_resp.json()["job"]["id"] == job_id
