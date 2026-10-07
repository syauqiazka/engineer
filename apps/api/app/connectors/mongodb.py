"""
MongoDBConnector: Konektor untuk NoSQL MongoDB (Fase 2).
Sesuai AGENTS.md Bagian 4.1 & 6.6:
- Mengimplementasikan protocol Connector
- Menggunakan driver open-source `pymongo` (Apache-2.0)
- Sampling dokumen otomatis untuk inferensi skema
- Flattening dokumen bersarang dengan dot-notation (mis. 'alamat.kota')
- Format array sebagai JSON terstruktur
"""

from __future__ import annotations

import json
import time
from collections.abc import Iterator
from typing import Any

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

_CAPS = Capabilities(
    supports_sql=False,
    supports_write=True,
    supports_pushdown=False,
    is_streaming=False,
    has_schema=False,
    supports_explain=False,
)


def _flatten_dict(d: dict[str, Any], parent_key: str = "", sep: str = ".") -> dict[str, Any]:
    items: list[tuple[str, Any]] = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(_flatten_dict(v, new_key, sep=sep).items())
        elif isinstance(v, list):
            items.append((new_key, json.dumps(v, default=str)))
        else:
            items.append((new_key, v))
    return dict(items)


def _infer_type(val: Any) -> str:
    if val is None:
        return "VARCHAR"
    if isinstance(val, bool):
        return "BOOLEAN"
    if isinstance(val, int):
        return "BIGINT"
    if isinstance(val, float):
        return "DOUBLE"
    return "VARCHAR"


class MongoDBConnector:
    kind = "mongodb"
    capabilities = _CAPS

    def __init__(
        self,
        host: str = "localhost",
        port: int = 27017,
        database: str = "test",
        username: str = "",
        password: str = "",
        auth_source: str = "admin",
        read_only: bool = True,
    ) -> None:
        self.host = host
        self.port = port or 27017
        self.database_name = database
        self.username = username
        self.password = password
        self.auth_source = auth_source
        self.read_only = read_only

    def _get_client(self):
        from pymongo import MongoClient

        if self.username and self.password:
            from urllib.parse import quote_plus

            uri = f"mongodb://{quote_plus(self.username)}:{quote_plus(self.password)}@{self.host}:{self.port}/{self.database_name}?authSource={self.auth_source}"
        else:
            uri = f"mongodb://{self.host}:{self.port}/{self.database_name}"

        return MongoClient(uri, serverSelectionTimeoutMS=3000)

    def test(self) -> TestResult:
        t0 = time.perf_counter()
        try:
            client = self._get_client()
            info = client.server_info()
            version = info.get("version", "Unknown")
            latency = round((time.perf_counter() - t0) * 1000, 2)
            client.close()
            return TestResult(
                success=True,
                message=f"MongoDB tersambung: {self.host}:{self.port}/{self.database_name}",
                server_version=f"MongoDB v{version}",
                latency_ms=latency,
                read_only=self.read_only,
            )
        except Exception as e:
            return TestResult(
                success=False,
                message=f"Gagal tersambung ke MongoDB: {e}",
            )

    def catalog(self, path: list[str]) -> list[CatalogNode]:
        client = self._get_client()
        nodes: list[CatalogNode] = []
        try:
            if not path:
                db_names = client.list_database_names()
                nodes = [
                    CatalogNode(name=name, node_type="database")
                    for name in db_names
                    if name not in ("admin", "local", "config")
                ]
                if not nodes and self.database_name:
                    nodes = [CatalogNode(name=self.database_name, node_type="database")]
            elif len(path) == 1:
                db = client[path[0]]
                coll_names = db.list_collection_names()
                nodes = [
                    CatalogNode(
                        name=coll,
                        node_type="table",
                        table_ref=TableRef(database=path[0], schema=None, table=coll),
                    )
                    for coll in coll_names
                ]
        finally:
            client.close()
        return nodes

    def schema(self, ref: TableRef, sample_size: int = 100) -> Schema:
        client = self._get_client()
        try:
            db_name = ref.database or self.database_name
            coll = client[db_name][ref.table]

            cursor = coll.find().limit(sample_size)
            fields_map: dict[str, str] = {}
            for doc in cursor:
                doc.pop("_id", None)
                flattened = _flatten_dict(doc)
                for k, v in flattened.items():
                    if k not in fields_map or fields_map[k] == "VARCHAR":
                        fields_map[k] = _infer_type(v)

            columns = [ColumnInfo(name="_id", data_type="VARCHAR", nullable=False)]
            for col_name, col_type in sorted(fields_map.items()):
                columns.append(ColumnInfo(name=col_name, data_type=col_type, nullable=True))

            return Schema(columns=columns)
        finally:
            client.close()

    def preview(self, ref: TableRef, limit: int = 100) -> Batch:
        client = self._get_client()
        try:
            db_name = ref.database or self.database_name
            coll = client[db_name][ref.table]
            docs = list(coll.find().limit(limit))

            flat_docs: list[dict[str, Any]] = []
            all_cols_set: set[str] = set()

            for doc in docs:
                str_id = str(doc.pop("_id", ""))
                flat = _flatten_dict(doc)
                flat["_id"] = str_id
                all_cols_set.update(flat.keys())
                flat_docs.append(flat)

            ordered_cols = ["_id"] + sorted([c for c in all_cols_set if c != "_id"])
            rows: list[list[Any]] = []
            for f in flat_docs:
                row = [f.get(c) for c in ordered_cols]
                rows.append(row)

            return Batch(columns=ordered_cols, rows=rows, total_rows=len(rows))
        finally:
            client.close()

    def read(self, query: str, chunk_rows: int = 1000) -> Iterator[Batch]:
        """query diasumsikan nama collection atau ref string."""
        client = self._get_client()
        try:
            coll_name = query.strip().replace('"', "")
            coll = client[self.database_name][coll_name]
            cursor = coll.find()
            current_chunk: list[dict[str, Any]] = []

            for doc in cursor:
                str_id = str(doc.pop("_id", ""))
                flat = _flatten_dict(doc)
                flat["_id"] = str_id
                current_chunk.append(flat)

                if len(current_chunk) >= chunk_rows:
                    cols = sorted({k for item in current_chunk for k in item.keys()})
                    if "_id" in cols:
                        cols.remove("_id")
                        cols.insert(0, "_id")
                    batch_rows = [[item.get(c) for c in cols] for item in current_chunk]
                    yield Batch(columns=cols, rows=batch_rows)
                    current_chunk = []

            if current_chunk:
                cols = sorted({k for item in current_chunk for k in item.keys()})
                if "_id" in cols:
                    cols.remove("_id")
                    cols.insert(0, "_id")
                batch_rows = [[item.get(c) for c in cols] for item in current_chunk]
                yield Batch(columns=cols, rows=batch_rows)
        finally:
            client.close()

    def write(
        self,
        ref: TableRef,
        batches: Iterator[Batch],
        mode: WriteMode = WriteMode.APPEND,
    ) -> WriteResult:
        if self.read_only:
            return WriteResult(success=False, rows_written=0, message="Koneksi read-only.")

        client = self._get_client()
        try:
            db_name = ref.database or self.database_name
            coll = client[db_name][ref.table]

            if mode == WriteMode.OVERWRITE:
                coll.delete_many({})

            total = 0
            for batch in batches:
                if not batch.rows:
                    continue
                docs_to_insert = [
                    {col: val for col, val in zip(batch.columns, row) if val is not None}
                    for row in batch.rows
                ]
                res = coll.insert_many(docs_to_insert)
                total += len(res.inserted_ids)

            return WriteResult(
                success=True, rows_written=total, message=f"{total} dokumen ditulis."
            )
        finally:
            client.close()

    def estimate_scan(self, query: str) -> ScanEstimate | None:
        return None
