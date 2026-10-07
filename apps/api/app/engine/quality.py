"""
Quality Engine: Pengujian aturan kualitas data (Fase 2).
Sesuai AGENTS.md Bagian 1 & 3:
- Menjalankan uji kualitas langsung di engine DuckDB
- Tipe aturan: NOT NULL, UNIQUE, RANGE, REGEX, ALLOWED VALUES, ROW COUNT, CUSTOM SQL
- Menghasilkan ringkasan kesehatan (Health Score 0-100%), jumlah pelanggaran, dan sampel baris yang melanggar
"""

from __future__ import annotations

import datetime
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Literal

from app.engine.workspace import get_engine

RuleType = Literal[
    "not_null",
    "unique",
    "range",
    "regex",
    "allowed_values",
    "row_count_min",
    "custom_sql",
]

Severity = Literal["error", "warn"]


@dataclass
class QualityRule:
    id: str
    table_name: str
    rule_type: RuleType
    column_name: str | None = None
    params: dict[str, Any] = field(default_factory=dict)
    severity: Severity = "error"
    description: str = ""
    created_at: str = field(default_factory=lambda: datetime.datetime.now(datetime.UTC).isoformat())


@dataclass
class RuleEvaluationResult:
    rule_id: str
    table_name: str
    column_name: str | None
    rule_type: str
    passed: bool
    total_rows: int
    failed_rows: int
    failure_rate: float
    message: str
    severity: Severity
    sample_violations: list[dict[str, Any]] = field(default_factory=list)
    evaluated_at: str = field(
        default_factory=lambda: datetime.datetime.now(datetime.UTC).isoformat()
    )


@dataclass
class TableQualityReport:
    table_name: str
    health_score: float  # 0.0 - 100.0%
    total_rules: int
    passed_rules: int
    failed_rules: int
    results: list[RuleEvaluationResult]


class QualityManager:
    """Pengelola penyimpanan aturan kualitas dan eksekusi pada tabel DuckDB."""

    def __init__(self, data_dir: str | Path | None = None) -> None:
        if data_dir is None:
            base_dir = Path(__file__).resolve().parent.parent.parent / "workspace_data"
            base_dir.mkdir(parents=True, exist_ok=True)
            self._dir = base_dir
        else:
            self._dir = Path(data_dir)
            self._dir.mkdir(parents=True, exist_ok=True)

        self._rules_file = self._dir / "quality_rules.json"
        self._init_default_rules()

    def _init_default_rules(self) -> None:
        if not self._rules_file.exists():
            default_rules = [
                QualityRule(
                    id="rule-pesanan-notnull-id",
                    table_name="pesanan_harian",
                    column_name="id",
                    rule_type="not_null",
                    severity="error",
                    description="ID pesanan tidak boleh NULL",
                ),
                QualityRule(
                    id="rule-pesanan-unique-id",
                    table_name="pesanan_harian",
                    column_name="id",
                    rule_type="unique",
                    severity="error",
                    description="ID pesanan harus unik",
                ),
                QualityRule(
                    id="rule-pesanan-range-total",
                    table_name="pesanan_harian",
                    column_name="total_harga",
                    rule_type="range",
                    params={"min": 0},
                    severity="error",
                    description="Total harga pesanan harus positif (>= 0)",
                ),
                QualityRule(
                    id="rule-pesanan-status-enum",
                    table_name="pesanan_harian",
                    column_name="status_bayar",
                    rule_type="allowed_values",
                    params={"values": ["Lunas", "Pending", "Gagal"]},
                    severity="warn",
                    description="Status bayar harus sesuai nilai enum yang diakui",
                ),
            ]
            self.save_all_rules(default_rules)

    def load_all_rules(self) -> list[QualityRule]:
        if not self._rules_file.exists():
            return []
        try:
            raw = json.loads(self._rules_file.read_text(encoding="utf-8"))
            return [
                QualityRule(
                    id=r["id"],
                    table_name=r["table_name"],
                    rule_type=r["rule_type"],
                    column_name=r.get("column_name"),
                    params=r.get("params", {}),
                    severity=r.get("severity", "error"),
                    description=r.get("description", ""),
                    created_at=r.get("created_at", ""),
                )
                for r in raw
            ]
        except Exception:
            return []

    def save_all_rules(self, rules: list[QualityRule]) -> None:
        data = [asdict(r) for r in rules]
        self._rules_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def add_rule(self, rule: QualityRule) -> QualityRule:
        rules = self.load_all_rules()
        rules.append(rule)
        self.save_all_rules(rules)
        return rule

    def delete_rule(self, rule_id: str) -> bool:
        rules = self.load_all_rules()
        filtered = [r for r in rules if r.id != rule_id]
        if len(filtered) < len(rules):
            self.save_all_rules(filtered)
            return True
        return False

    def evaluate_rule(self, rule: QualityRule) -> RuleEvaluationResult:
        engine = get_engine()
        table = rule.table_name
        col = rule.column_name

        # Hitung total baris tabel
        try:
            count_res = engine.query(f'SELECT COUNT(*) as cnt FROM "{table}"')
            total_rows = int(count_res.rows[0][0]) if count_res.rows else 0
        except Exception as e:
            return RuleEvaluationResult(
                rule_id=rule.id,
                table_name=table,
                column_name=col,
                rule_type=rule.rule_type,
                passed=False,
                total_rows=0,
                failed_rows=0,
                failure_rate=1.0,
                message=f"Tabel '{table}' tidak dapat diakses: {e}",
                severity=rule.severity,
            )

        failed_rows = 0
        violations_query = ""
        violation_condition = ""

        if rule.rule_type == "not_null" and col:
            violation_condition = f'"{col}" IS NULL'
            violations_query = f'SELECT * FROM "{table}" WHERE {violation_condition} LIMIT 10'

        elif rule.rule_type == "unique" and col:
            # Cari baris yang duplikat
            violations_query = f"""
                SELECT "{col}", COUNT(*) as jml_duplikat
                FROM "{table}"
                WHERE "{col}" IS NOT NULL
                GROUP BY "{col}"
                HAVING COUNT(*) > 1
                LIMIT 10
            """
            dup_cnt_query = f"""
                SELECT COALESCE(SUM(c - 1), 0) FROM (
                    SELECT COUNT(*) as c FROM "{table}" WHERE "{col}" IS NOT NULL GROUP BY "{col}" HAVING COUNT(*) > 1
                )
            """
            try:
                cnt_res = engine.query(dup_cnt_query)
                failed_rows = int(cnt_res.rows[0][0]) if cnt_res.rows else 0
            except Exception:
                failed_rows = 0

        elif rule.rule_type == "range" and col:
            conds = []
            if "min" in rule.params:
                conds.append(f'"{col}" < {rule.params["min"]}')
            if "max" in rule.params:
                conds.append(f'"{col}" > {rule.params["max"]}')
            violation_condition = " OR ".join(conds) if conds else "1=0"
            violations_query = f'SELECT * FROM "{table}" WHERE {violation_condition} LIMIT 10'

        elif rule.rule_type == "allowed_values" and col:
            vals = rule.params.get("values", [])
            val_strs = ", ".join(f"'{v}'" for v in vals)
            violation_condition = f'"{col}" NOT IN ({val_strs}) AND "{col}" IS NOT NULL'
            violations_query = f'SELECT * FROM "{table}" WHERE {violation_condition} LIMIT 10'

        elif rule.rule_type == "row_count_min":
            min_rows = int(rule.params.get("min_count", 1))
            passed = total_rows >= min_rows
            return RuleEvaluationResult(
                rule_id=rule.id,
                table_name=table,
                column_name=None,
                rule_type=rule.rule_type,
                passed=passed,
                total_rows=total_rows,
                failed_rows=0 if passed else (min_rows - total_rows),
                failure_rate=0.0 if passed else 1.0,
                message=f"Total baris: {total_rows} (min {min_rows})",
                severity=rule.severity,
            )

        elif rule.rule_type == "custom_sql":
            sql_predicate = rule.params.get("sql", "1=1")
            violation_condition = f"NOT ({sql_predicate})"
            violations_query = f'SELECT * FROM "{table}" WHERE {violation_condition} LIMIT 10'

        # Eksekusi penghitungan baris gagal jika ada kondisi
        if violation_condition and rule.rule_type != "unique":
            try:
                fail_res = engine.query(
                    f'SELECT COUNT(*) FROM "{table}" WHERE {violation_condition}'
                )
                failed_rows = int(fail_res.rows[0][0]) if fail_res.rows else 0
            except Exception:
                failed_rows = 0

        # Ambil sampel pelanggaran
        sample_rows: list[dict[str, Any]] = []
        if failed_rows > 0 and violations_query:
            try:
                sample_batch = engine.query(violations_query)
                for r in sample_batch.rows:
                    sample_rows.append(dict(zip(sample_batch.columns, r)))
            except Exception:
                pass

        passed = failed_rows == 0
        failure_rate = (failed_rows / total_rows) if total_rows > 0 else 0.0

        msg = (
            f"Lulus (0 pelanggaran dari {total_rows:,} baris)"
            if passed
            else f"Gagal: {failed_rows:,} baris melanggar ({failure_rate:.1%})"
        )

        return RuleEvaluationResult(
            rule_id=rule.id,
            table_name=table,
            column_name=col,
            rule_type=rule.rule_type,
            passed=passed,
            total_rows=total_rows,
            failed_rows=failed_rows,
            failure_rate=round(failure_rate, 4),
            message=msg,
            severity=rule.severity,
            sample_violations=sample_rows,
        )

    def evaluate_table(self, table_name: str) -> TableQualityReport:
        rules = [r for r in self.load_all_rules() if r.table_name == table_name]
        results = [self.evaluate_rule(r) for r in rules]

        total = len(results)
        passed = sum(1 for r in results if r.passed)
        failed = total - passed
        score = (passed / total * 100.0) if total > 0 else 100.0

        return TableQualityReport(
            table_name=table_name,
            health_score=round(score, 1),
            total_rules=total,
            passed_rules=passed,
            failed_rules=failed,
            results=results,
        )


_quality_mgr: QualityManager | None = None


def get_quality_manager() -> QualityManager:
    global _quality_mgr
    if _quality_mgr is None:
        _quality_mgr = QualityManager()
    return _quality_mgr
