"""
Manifest and metadata system for Local Data Warehouse.
Stores atomic versioned manifests in JSON and catalog metadata.
Guarantees atomic switches and retention tracking for Parquet tables.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ParquetFileInfo:
    path: str  # relative path within table directory
    row_count: int
    size_bytes: int
    partition_values: dict[str, str] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)


@dataclass
class TableManifest:
    table_name: str
    version: int
    schema: list[dict[str, Any]]  # List of {name, data_type, nullable}
    partition_columns: list[str] = field(default_factory=list)
    files: list[ParquetFileInfo] = field(default_factory=list)
    total_rows: int = 0
    total_bytes: int = 0
    created_at: float = field(default_factory=time.time)
    operation: str = "create"  # "create", "append", "overwrite", "merge", "compaction"
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "table_name": self.table_name,
            "version": self.version,
            "schema": self.schema,
            "partition_columns": self.partition_columns,
            "files": [asdict(f) for f in self.files],
            "total_rows": self.total_rows,
            "total_bytes": self.total_bytes,
            "created_at": self.created_at,
            "operation": self.operation,
            "message": self.message,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TableManifest:
        files = [ParquetFileInfo(**f) for f in data.get("files", [])]
        return cls(
            table_name=data["table_name"],
            version=data["version"],
            schema=data.get("schema", []),
            partition_columns=data.get("partition_columns", []),
            files=files,
            total_rows=data.get("total_rows", 0),
            total_bytes=data.get("total_bytes", 0),
            created_at=data.get("created_at", time.time()),
            operation=data.get("operation", "unknown"),
            message=data.get("message", ""),
        )


class TableManifestManager:
    """Manages versioned manifests in `_manifests/` with atomic pointer updates."""

    def __init__(self, table_dir: Path):
        self.table_dir = table_dir
        self.manifests_dir = table_dir / "_manifests"
        self.current_pointer_file = self.manifests_dir / "current.json"
        self.manifests_dir.mkdir(parents=True, exist_ok=True)

    def get_current_manifest(self) -> TableManifest | None:
        if not self.current_pointer_file.exists():
            return None
        try:
            pointer_data = json.loads(self.current_pointer_file.read_text(encoding="utf-8"))
            version = pointer_data.get("current_version")
            if version is None:
                return None
            version_file = self.manifests_dir / f"v{version}.json"
            if not version_file.exists():
                return None
            data = json.loads(version_file.read_text(encoding="utf-8"))
            return TableManifest.from_dict(data)
        except Exception:
            return None

    def get_version_history(self) -> list[dict[str, Any]]:
        history: list[dict[str, Any]] = []
        if not self.manifests_dir.exists():
            return history
        for file in sorted(self.manifests_dir.glob("v*.json"), reverse=True):
            try:
                data = json.loads(file.read_text(encoding="utf-8"))
                history.append(
                    {
                        "version": data.get("version"),
                        "operation": data.get("operation"),
                        "total_rows": data.get("total_rows"),
                        "total_bytes": data.get("total_bytes"),
                        "file_count": len(data.get("files", [])),
                        "created_at": data.get("created_at"),
                        "message": data.get("message"),
                    }
                )
            except Exception:
                continue
        return history

    def commit_manifest(self, manifest: TableManifest) -> None:
        """
        Commits a new version manifest atomically:
        1. Write v{version}.json
        2. Write temp current pointer file
        3. Atomic replace/rename current.json
        """
        version_file = self.manifests_dir / f"v{manifest.version}.json"
        version_file.write_text(json.dumps(manifest.to_dict(), indent=2), encoding="utf-8")

        temp_pointer = (
            self.manifests_dir / f"current.tmp.{os.getpid()}_{int(time.time() * 1000)}.json"
        )
        temp_pointer.write_text(
            json.dumps({"current_version": manifest.version, "updated_at": time.time()}),
            encoding="utf-8",
        )
        temp_pointer.replace(self.current_pointer_file)
