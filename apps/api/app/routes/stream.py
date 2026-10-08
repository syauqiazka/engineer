"""
Endpoints API untuk Kafka Stream.
Sesuai AGENTS.md 6.2 & DESIGN.md:
- Peek messages (sampel) tanpa commit offset
- Menampilkan pesan konfirmasi: "Pratinjau tidak mengubah offset consumer."
- Consumer lag per partisi
- Kirim pesan uji (produce)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.connectors.kafka import KafkaConnector

router = APIRouter(prefix="/api/stream", tags=["stream"])

# Default singleton connector
_kafka = KafkaConnector()


class ProduceRequest(BaseModel):
    key: str = Field(default="", description="Kunci pesan Kafka")
    value: Any = Field(description="Payload pesan (JSON string atau dictionary)")
    partition: int | None = Field(default=None, description="Nomor partisi target (opsional)")


@router.get("/status")
def get_stream_status() -> dict[str, Any]:
    """Menguji status koneksi broker Kafka."""
    test_res = _kafka.test()
    return {
        "success": test_res.success,
        "message": test_res.message,
        "server_version": test_res.server_version,
        "latency_ms": test_res.latency_ms,
        "bootstrap_servers": _kafka.bootstrap_servers,
    }


@router.get("/topics")
def list_topics() -> dict[str, Any]:
    """Mendapatkan daftar topik Kafka yang tersedia."""
    cat = _kafka.catalog([])
    topics = []
    if cat and cat[0].children:
        for child in cat[0].children:
            topics.append(
                {
                    "name": child.name,
                    "partitions": 3,
                    "replication_factor": 1,
                }
            )
    return {
        "topics": topics,
        "count": len(topics),
        "cluster_mode": "KRaft / Self-hosted",
    }


@router.get("/topics/{topic}/messages")
def peek_messages(
    topic: str,
    partition: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    """
    Mengintip pesan Kafka tanpa commit offset (ephemeral group).
    """
    messages = _kafka.peek(topic=topic, partition=partition, limit=limit)
    return {
        "topic": topic,
        "partition": partition,
        "count": len(messages),
        "messages": [
            {
                "offset": m.offset,
                "partition": m.partition,
                "timestamp": m.timestamp,
                "key": m.key,
                "value": m.value,
                "headers": m.headers,
            }
            for m in messages
        ],
        "notice": "Pratinjau tidak mengubah offset consumer.",
    }


@router.get("/topics/{topic}/lag")
def get_consumer_lag(
    topic: str,
    group_id: str = Query(default="workbench-group"),
) -> dict[str, Any]:
    """
    Mendapatkan metrik lag consumer per partisi.
    """
    lags = _kafka.get_consumer_lag(topic=topic, group_id=group_id)
    total_lag = sum(l.lag for l in lags)
    return {
        "topic": topic,
        "group_id": group_id,
        "total_lag": total_lag,
        "partitions": [
            {
                "partition": l.partition,
                "current_offset": l.current_offset,
                "high_watermark": l.high_watermark,
                "lag": l.lag,
            }
            for l in lags
        ],
    }


@router.post("/topics/{topic}/produce")
def produce_message(topic: str, req: ProduceRequest) -> dict[str, Any]:
    """
    Mengirim pesan uji ke topik Kafka.
    """
    try:
        res = _kafka.produce(
            topic=topic,
            key=req.key,
            value=req.value,
            partition=req.partition,
        )
        return res
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gagal mengirim pesan ke Kafka: {str(e)}")
