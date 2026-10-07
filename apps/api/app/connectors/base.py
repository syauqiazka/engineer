from collections.abc import Iterator
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Protocol, runtime_checkable


class WriteMode(str, Enum):
    APPEND = "append"
    OVERWRITE = "overwrite"
    MERGE = "merge"


@dataclass(frozen=True)
class Capabilities:
    supports_sql: bool = False
    supports_write: bool = False
    supports_pushdown: bool = False
    is_streaming: bool = False
    has_schema: bool = True
    supports_explain: bool = False


@dataclass(frozen=True)
class TableRef:
    database: str | None = None
    schema: str | None = None
    table: str = ""

    @property
    def full_name(self) -> str:
        parts = [p for p in (self.database, self.schema, self.table) if p]
        return ".".join(parts)


@dataclass
class ColumnInfo:
    name: str
    data_type: str
    nullable: bool = True


@dataclass
class Schema:
    columns: list[ColumnInfo] = field(default_factory=list)


@dataclass
class CatalogNode:
    name: str
    node_type: str  # "database", "schema", "table", "view", "file"
    children: list["CatalogNode"] = field(default_factory=list)
    table_ref: TableRef | None = None


@dataclass
class TestResult:
    success: bool
    message: str
    server_version: str | None = None
    latency_ms: float | None = None
    read_only: bool = True


@dataclass
class ScanEstimate:
    estimated_rows: int
    estimated_bytes: int


@dataclass
class Batch:
    columns: list[str]
    rows: list[list[Any]]
    total_rows: int | None = None


@dataclass
class WriteResult:
    success: bool
    rows_written: int
    message: str | None = None


@runtime_checkable
class Connector(Protocol):
    kind: str
    capabilities: Capabilities

    def test(self) -> TestResult: ...
    def catalog(self, path: list[str]) -> list[CatalogNode]: ...
    def schema(self, ref: TableRef) -> Schema: ...
    def preview(self, ref: TableRef, limit: int = 100) -> Batch: ...
    def read(self, query: str, chunk_rows: int = 1000) -> Iterator[Batch]: ...
    def write(self, ref: TableRef, batches: Iterator[Batch], mode: WriteMode) -> WriteResult: ...
    def estimate_scan(self, query: str) -> ScanEstimate | None: ...
