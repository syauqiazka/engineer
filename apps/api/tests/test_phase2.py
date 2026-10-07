"""
Unit and integration tests for Phase 2 features:
- SecretStore AES-GCM
- Auth & RBAC
- SQLite Connector
- MongoDB & Storage Connectors
- Quality Engine
- Python Sandbox Runner
- Workflow DAG Engine
"""

import os
import sqlite3
import tempfile

import pytest

from app.connectors.base import TableRef
from app.connectors.mongodb import _flatten_dict
from app.connectors.sqlite import SQLiteConnector
from app.engine.quality import QualityManager, QualityRule
from app.routes.workflows import WorkflowEdge, WorkflowNode, _topological_sort
from app.runner.sandbox import SandboxRunner
from app.security.auth import AuthManager
from app.security.secrets import SecretStore


def test_secret_store_encryption_and_rotation():
    with tempfile.TemporaryDirectory() as tmp_dir:
        store = SecretStore(key_dir=tmp_dir)
        plaintext = "super-secret-password-12345"

        # Enkripsi & dekripsi
        encrypted = store.encrypt(plaintext)
        assert encrypted != plaintext
        decrypted = store.decrypt(encrypted)
        assert decrypted == plaintext

        # Save and retrieve secret
        store.save_secret("conn_1", plaintext)
        assert store.get_secret("conn_1") == plaintext

        # Master key rotation
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        new_key = AESGCM.generate_key(bit_length=256)
        store.rotate_master_key(new_key)
        assert store.get_secret("conn_1") == plaintext


def test_auth_manager_argon2_and_roles():
    with tempfile.TemporaryDirectory() as tmp_dir:
        auth = AuthManager(data_dir=tmp_dir)

        # Login default admin
        admin = auth.authenticate("admin", "admin123")
        assert admin is not None
        assert admin.role == "admin"

        # Password salah
        failed = auth.authenticate("admin", "wrongpassword")
        assert failed is None

        # Session creation & verification
        sess = auth.create_session(admin)
        assert auth.get_session(sess.token) is not None

        # Audit logging
        auth.log_audit("admin", "admin", "create_table", "users", "success")
        logs = auth.get_recent_audit_logs()
        assert len(logs) >= 1
        assert logs[0]["action"] == "create_table"


def test_sqlite_connector_full_lifecycle():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    try:
        # Siapkan SQLite DB
        con = sqlite3.connect(db_path)
        con.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, score REAL)")
        con.execute("INSERT INTO users VALUES (1, 'Alice', 95.5), (2, 'Bob', 82.0)")
        con.commit()
        con.close()

        conn = SQLiteConnector(db_path=db_path)
        # Test connection
        test_res = conn.test()
        assert test_res.success is True

        # Catalog
        nodes = conn.catalog([])
        assert any(n.name == "users" for n in nodes)

        # Schema
        schema = conn.schema(TableRef(database=db_path, schema=None, table="users"))
        assert len(schema.columns) == 3
        assert schema.columns[0].name == "id"

        # Preview
        preview = conn.preview(TableRef(database=db_path, schema=None, table="users"), limit=5)
        assert len(preview.rows) == 2
        assert preview.columns == ["id", "name", "score"]

        # Read
        batches = list(conn.read("SELECT * FROM users"))
        assert len(batches) >= 1
        assert len(batches[0].rows) == 2

    finally:
        if os.path.exists(db_path):
            os.remove(db_path)


def test_mongodb_flattening_logic():
    raw_doc = {
        "user": {"name": "Budi", "contact": {"city": "Jakarta", "phone": "081234567"}},
        "tags": ["admin", "dev"],
        "active": True,
    }
    flattened = _flatten_dict(raw_doc)
    assert flattened["user.name"] == "Budi"
    assert flattened["user.contact.city"] == "Jakarta"
    assert "admin" in flattened["tags"]
    assert flattened["active"] is True


def test_quality_engine_evaluations():
    with tempfile.TemporaryDirectory() as tmp_dir:
        mgr = QualityManager(data_dir=tmp_dir)

        # Rule NOT NULL
        rule_not_null = QualityRule(
            id="rule_nn",
            table_name="pesanan_harian",
            column_name="id",
            rule_type="not_null",
            severity="error",
        )
        res = mgr.evaluate_rule(rule_not_null)
        assert res.passed is True
        assert res.failed_rows == 0

        # Rule RANGE
        rule_range = QualityRule(
            id="rule_rng",
            table_name="pesanan_harian",
            column_name="total_harga",
            rule_type="range",
            params={"min": 0},
            severity="error",
        )
        res_range = mgr.evaluate_rule(rule_range)
        assert res_range.passed is True

        # Table report
        report = mgr.evaluate_table("pesanan_harian")
        assert report.health_score >= 0.0


def test_python_sandbox_execution():
    runner = SandboxRunner(timeout_seconds=15)
    script = """
import polars as pl

# Baca tabel dari workspace DuckDB
df = ctx.read_table("pesanan_harian", engine="polars")
ctx.log(f"Jumlah baris: {len(df)}")

# Agregasi omzet
agg = df.group_by("status_bayar").agg(pl.len().alias("count"), pl.col("total_harga").sum().alias("sum_total"))
ctx.display(agg)
"""
    result = runner.execute(script)
    assert result.success is True
    assert "[ctx.log] Jumlah baris:" in result.stdout
    assert result.output_preview is not None
    assert "count" in result.output_preview["columns"]


def test_workflow_topological_sort_and_cycle():
    nodes = [
        WorkflowNode(id="A", type="source", label="A"),
        WorkflowNode(id="B", type="filter", label="B"),
        WorkflowNode(id="C", type="destination", label="C"),
    ]
    edges = [
        WorkflowEdge(id="e1", source="A", target="B"),
        WorkflowEdge(id="e2", source="B", target="C"),
    ]
    order = _topological_sort(nodes, edges)
    assert order == ["A", "B", "C"]

    # Deteksi siklus
    cycle_edges = [
        WorkflowEdge(id="e1", source="A", target="B"),
        WorkflowEdge(id="e2", source="B", target="C"),
        WorkflowEdge(id="e3", source="C", target="A"),
    ]
    with pytest.raises(ValueError, match="Siklus"):
        _topological_sort(nodes, cycle_edges)
