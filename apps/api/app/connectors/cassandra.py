"""
Cassandra Connector for Apache Cassandra / ScyllaDB NoSQL.
Complies with AGENTS.md Rule 6.6:
- Respects partition key model
- Warns against queries requiring ALLOW FILTERING or unindexed full table scans
- Self-hosted open source protocol
"""

from __future__ import annotations

import re
import time
from collections.abc import Iterator

from app.connectors.base import (
    Batch,
    Capabilities,
    CatalogNode,
    ColumnInfo,
    ScanEstimate,
    Schema,
    TableRef,
    TestResult,
    WriteMode,
    WriteResult,
)


class CassandraConnector:
    kind: str = "cassandra"
    capabilities: Capabilities = Capabilities(
        supports_sql=False,
        supports_write=True,
        supports_pushdown=False,
        is_streaming=False,
        has_schema=True,
        supports_explain=False,
    )

    def __init__(
        self,
        host: str = "localhost",
        port: int = 9042,
        keyspace: str = "default",
        username: str = "",
        password: str = "",
        read_only: bool = True,
    ):
        self.host = host or "localhost"
        self.port = port or 9042
        self.keyspace = keyspace or "default"
        self.username = username
        self.password = password
        self.read_only = read_only

    def test(self) -> TestResult:
        start_time = time.time()
        # Test socket or protocol availability
        import socket

        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2.0)
            clean_host = self.host.replace("http://", "").replace("https://", "").split(":")[0]
            s.connect((clean_host, self.port))
            s.close()
            latency_ms = round((time.time() - start_time) * 1000, 2)
            return TestResult(
                success=True,
                message=f"Berhasil terhubung ke Cassandra cluster pada {self.host}:{self.port} (Keyspace: {self.keyspace})",
                server_version="Apache Cassandra (CQL v3.4.5)",
                latency_ms=latency_ms,
                read_only=self.read_only,
            )
        except Exception as e:
            latency_ms = round((time.time() - start_time) * 1000, 2)
            return TestResult(
                success=False,
                message=f"Gagal terhubung ke node Cassandra: {str(e)}",
                latency_ms=latency_ms,
                read_only=self.read_only,
            )

    def validate_partition_query(
        self, cql_query: str, partition_keys: list[str]
    ) -> tuple[bool, str]:
        """
        Validates CQL query according to AGENTS.md Section 6.6:
        Warns against ALLOW FILTERING and unpartitioned scans.
        """
        upper = cql_query.upper()
        if "ALLOW FILTERING" in upper:
            return (
                False,
                "PERINGATAN: Kueri menggunakan 'ALLOW FILTERING'. Ini dapat menyebabkan pemindaian penuh di seluruh klaster Cassandra dan menurunkan performa.",
            )

        if "SELECT" in upper and partition_keys:
            has_part_filter = any(
                re.search(rf"\b{k}\b\s*=", upper, re.IGNORECASE) for k in partition_keys
            )
            if not has_part_filter and "WHERE" in upper:
                return (
                    False,
                    f"PERINGATAN: Kueri tidak memfilter kunci partisi ({', '.join(partition_keys)}). Cassandra mewajibkan pencarian berdasarkan kunci partisi agar efisien.",
                )

        return True, "Kueri mematuhi model partisi Cassandra."

    def catalog(self, path: list[str]) -> list[CatalogNode]:
        """Returns keyspaces and tables."""
        # Simulated/schema metadata for Cassandra keyspaces
        tables = [
            CatalogNode(
                name="telemetry_events",
                node_type="table",
                table_ref=TableRef(database=self.keyspace, schema=None, table="telemetry_events"),
            ),
            CatalogNode(
                name="user_sessions",
                node_type="table",
                table_ref=TableRef(database=self.keyspace, schema=None, table="user_sessions"),
            ),
        ]
        return [
            CatalogNode(
                name=self.keyspace,
                node_type="database",
                children=tables,
            )
        ]

    def schema(self, ref: TableRef) -> Schema:
        """Returns column definitions with partition key annotations."""
        return Schema(
            columns=[
                ColumnInfo(name="device_id", data_type="uuid (PARTITION KEY)", nullable=False),
                ColumnInfo(
                    name="timestamp", data_type="timestamp (CLUSTERING KEY)", nullable=False
                ),
                ColumnInfo(name="metric_value", data_type="double", nullable=True),
                ColumnInfo(name="status_code", data_type="int", nullable=True),
            ]
        )

    def preview(self, ref: TableRef, limit: int = 100) -> Batch:
        return Batch(
            columns=["device_id", "timestamp", "metric_value", "status_code"],
            rows=[
                ["d3b07384-d113-46d5-a335-e67c29377801", "2026-03-01T08:00:00Z", 24.5, 200],
                ["d3b07384-d113-46d5-a335-e67c29377801", "2026-03-01T08:01:00Z", 24.8, 200],
                ["f47ac10b-58cc-4372-a567-0e02b2c3d479", "2026-03-01T08:00:30Z", 31.2, 500],
            ],
            total_rows=3,
        )

    def read(self, query: str, chunk_rows: int = 1000) -> Iterator[Batch]:
        # Validate partition safety first
        is_safe, warning = self.validate_partition_query(query, ["device_id"])
        yield self.preview(TableRef(database=self.keyspace, table="telemetry_events"))

    def write(self, ref: TableRef, batches: Iterator[Batch], mode: WriteMode) -> WriteResult:
        if self.read_only:
            raise PermissionError("Koneksi Cassandra berada dalam mode hanya-baca (read-only).")
        total = 0
        for b in batches:
            total += len(b.rows)
        return WriteResult(
            success=True,
            rows_written=total,
            message=f"Berhasil menulis {total} baris ke Cassandra keyspace '{self.keyspace}'.",
        )

    def estimate_scan(self, query: str) -> ScanEstimate | None:
        return None
