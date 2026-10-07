"""
Pipeline step registry + codegen (SQL, Polars, pandas).
Setiap step punya generator kode yang menghasilkan SQL dan Python yang setara.
Menambah step baru = satu class + entri di STEP_GENERATORS.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class PipelineStepDef:
    id: str
    kind: str  # "filter", "deduplicate", "derive", "drop_null", "aggregate", "rename", "cast", "sort", "limit"
    name: str
    params: dict[str, Any]
    enabled: bool = True


class StepCodeGen(Protocol):
    def to_sql(self, step: PipelineStepDef, source_table: str) -> str: ...
    def to_polars(self, step: PipelineStepDef, df_var: str) -> str: ...
    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str: ...


# -----------------------------------------------------------------------
# Step implementations
# -----------------------------------------------------------------------


class FilterCodeGen:
    """Filter baris berdasarkan kondisi SQL atau kolom + nilai."""

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        condition = step.params.get("condition", "TRUE")
        return f"SELECT * FROM {source_table} WHERE {condition}"

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        col = step.params.get("column", "")
        op = step.params.get("operator", "==")
        val = step.params.get("value", "")
        if col and op:
            val_repr = f"'{val}'" if isinstance(val, str) else str(val)
            op_map = {"==": "==", "!=": "!=", ">": ">", "<": "<", ">=": ">=", "<=": "<="}
            py_op = op_map.get(op, op)
            return f"{df_var} = {df_var}.filter(pl.col('{col}') {py_op} {val_repr})"
        condition = step.params.get("condition", "True")
        return f"# {df_var} = {df_var}.filter({condition})  # sesuaikan ke ekspresi Polars"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        col = step.params.get("column", "")
        op = step.params.get("operator", "==")
        val = step.params.get("value", "")
        if col and op:
            val_repr = f"'{val}'" if isinstance(val, str) else str(val)
            return f"{df_var} = {df_var}[{df_var}['{col}'] {op} {val_repr}]"
        condition = step.params.get("condition", "True")
        return f'# {df_var} = {df_var}.query("{condition}")'


class DropNullCodeGen:
    """Hapus baris yang memiliki null pada kolom tertentu atau semua kolom."""

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        cols = step.params.get("columns", [])
        if not cols:
            col = step.params.get("column", "")
            cols = [col] if col else []
        if cols:
            conditions = " AND ".join(f'"{c}" IS NOT NULL' for c in cols)
            return f"SELECT * FROM {source_table} WHERE {conditions}"
        return f"SELECT * FROM {source_table}"  # Tidak ada kolom → tidak ada filter

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        cols = step.params.get("columns", [])
        if not cols:
            col = step.params.get("column", "")
            cols = [col] if col else []
        if cols:
            return f"{df_var} = {df_var}.drop_nulls(subset={cols})"
        return f"{df_var} = {df_var}.drop_nulls()"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        cols = step.params.get("columns", [])
        if not cols:
            col = step.params.get("column", "")
            cols = [col] if col else []
        if cols:
            return f"{df_var} = {df_var}.dropna(subset={cols})"
        return f"{df_var} = {df_var}.dropna()"


class DeduplicateCodeGen:
    """Hapus baris duplikat berdasarkan kolom kunci."""

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        cols = step.params.get("columns", [])
        keep = step.params.get("keep", "first")  # "first" atau "last"
        if cols:
            cols_str = ", ".join(f'"{c}"' for c in cols)
            order_dir = "ASC" if keep == "first" else "DESC"
            rn_expr = f"ROW_NUMBER() OVER (PARTITION BY {cols_str} ORDER BY rowid {order_dir})"
            return (
                f"SELECT * FROM (\n"
                f"  SELECT *, {rn_expr} AS _rn FROM {source_table}\n"
                f") WHERE _rn = 1"
            )
        return f"SELECT DISTINCT * FROM {source_table}"

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        cols = step.params.get("columns", [])
        keep = step.params.get("keep", "first")
        if cols:
            return f"{df_var} = {df_var}.unique(subset={cols}, keep='{keep}')"
        return f"{df_var} = {df_var}.unique()"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        cols = step.params.get("columns", [])
        keep = step.params.get("keep", "first")
        if cols:
            return f"{df_var} = {df_var}.drop_duplicates(subset={cols}, keep='{keep}')"
        return f"{df_var} = {df_var}.drop_duplicates()"


class DeriveCodeGen:
    """Buat kolom baru dari ekspresi SQL / ekspresi Python."""

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        col_name = step.params.get("column_name", "kolom_baru")
        expression = step.params.get("expression", "NULL")
        return f'SELECT *, ({expression}) AS "{col_name}" FROM {source_table}'

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        col_name = step.params.get("column_name", "kolom_baru")
        expression = step.params.get("expression", "None")
        return f"{df_var} = {df_var}.with_columns(pl.lit({expression}).alias('{col_name}'))"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        col_name = step.params.get("column_name", "kolom_baru")
        expression = step.params.get("expression", "None")
        return f"{df_var}['{col_name}'] = {expression}"


class AggregateCodeGen:
    """Group by + agregasi (SUM, COUNT, AVG, MIN, MAX)."""

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        group_by = step.params.get("group_by", [])
        aggregations = step.params.get("aggregations", [])
        # aggregations: [{"column": "total_harga", "function": "SUM", "alias": "total"}]
        gb_str = ", ".join(f'"{c}"' for c in group_by)
        agg_parts = []
        for agg in aggregations:
            fn = agg.get("function", "COUNT").upper()
            col = agg.get("column", "*")
            alias = agg.get("alias", f"{fn.lower()}_{col}")
            col_expr = f'"{col}"' if col != "*" else "*"
            agg_parts.append(f'{fn}({col_expr}) AS "{alias}"')
        select_parts = ([f'"{c}"' for c in group_by] if group_by else []) + agg_parts
        select_str = ", ".join(select_parts) if select_parts else "*"
        sql = f"SELECT {select_str} FROM {source_table}"
        if group_by:
            sql += f"\nGROUP BY {gb_str}"
        return sql

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        group_by = step.params.get("group_by", [])
        aggregations = step.params.get("aggregations", [])
        fn_map = {
            "SUM": "sum",
            "COUNT": "count",
            "AVG": "mean",
            "MIN": "min",
            "MAX": "max",
            "FIRST": "first",
            "LAST": "last",
        }
        agg_exprs = []
        for agg in aggregations:
            fn = fn_map.get(agg.get("function", "COUNT").upper(), "count")
            col = agg.get("column", "")
            alias = agg.get("alias", f"{fn}_{col}")
            if col and col != "*":
                agg_exprs.append(f"pl.col('{col}').{fn}().alias('{alias}')")
            else:
                agg_exprs.append(f"pl.count().alias('{alias}')")
        agg_str = ", ".join(agg_exprs)
        if group_by:
            gb_str = ", ".join(f"'{c}'" for c in group_by)
            return f"{df_var} = {df_var}.group_by([{gb_str}]).agg([{agg_str}])"
        return f"{df_var} = {df_var}.select([{agg_str}])"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        group_by = step.params.get("group_by", [])
        aggregations = step.params.get("aggregations", [])
        fn_map = {"SUM": "sum", "COUNT": "count", "AVG": "mean", "MIN": "min", "MAX": "max"}
        if not aggregations:
            return f"{df_var} = {df_var}.groupby({group_by}).size().reset_index()"
        agg_dict: dict[str, list[str]] = {}
        for agg in aggregations:
            col = agg.get("column", "")
            fn = fn_map.get(agg.get("function", "count").upper(), "count")
            if col and col != "*":
                agg_dict.setdefault(col, []).append(fn)
        agg_dict_str = str(agg_dict)
        gb_str = str(group_by)
        return f"{df_var} = {df_var}.groupby({gb_str}).agg({agg_dict_str}).reset_index()"


class RenameCodeGen:
    """Ganti nama kolom."""

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        mapping = step.params.get("mapping", {})  # {"lama": "baru"}
        desc_res = f"-- DESCRIBE {source_table} terlebih dahulu untuk daftar kolom"
        if not mapping:
            return f"SELECT * FROM {source_table}  {desc_res}"
        renames = ", ".join(f'"{old}" AS "{new}"' for old, new in mapping.items())
        return f"SELECT * REPLACE ({renames}) FROM {source_table}"

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        mapping = step.params.get("mapping", {})
        return f"{df_var} = {df_var}.rename({mapping})"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        mapping = step.params.get("mapping", {})
        return f"{df_var} = {df_var}.rename(columns={mapping})"


class CastCodeGen:
    """Ubah tipe data kolom."""

    # SQL type mapping
    _SQL_TYPES = {
        "int": "INTEGER",
        "integer": "INTEGER",
        "bigint": "BIGINT",
        "float": "DOUBLE",
        "double": "DOUBLE",
        "decimal": "DECIMAL",
        "str": "VARCHAR",
        "varchar": "VARCHAR",
        "text": "VARCHAR",
        "bool": "BOOLEAN",
        "boolean": "BOOLEAN",
        "date": "DATE",
        "datetime": "TIMESTAMP",
        "timestamp": "TIMESTAMP",
    }

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        casts = step.params.get("casts", {})  # {"kolom": "tipe"}
        if not casts:
            return f"SELECT * FROM {source_table}"
        cast_parts = []
        for col, dtype in casts.items():
            sql_type = self._SQL_TYPES.get(dtype.lower(), dtype.upper())
            cast_parts.append(f'TRY_CAST("{col}" AS {sql_type}) AS "{col}"')
        cast_str = ", ".join(cast_parts)
        return f"SELECT * REPLACE ({cast_str}) FROM {source_table}"

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        casts = step.params.get("casts", {})
        _PL_TYPES = {
            "int": "pl.Int64",
            "integer": "pl.Int64",
            "bigint": "pl.Int64",
            "float": "pl.Float64",
            "double": "pl.Float64",
            "str": "pl.Utf8",
            "varchar": "pl.Utf8",
            "text": "pl.Utf8",
            "bool": "pl.Boolean",
            "boolean": "pl.Boolean",
            "date": "pl.Date",
            "datetime": "pl.Datetime",
            "timestamp": "pl.Datetime",
        }
        exprs = [
            f"pl.col('{col}').cast({_PL_TYPES.get(dtype.lower(), 'pl.Utf8')})"
            for col, dtype in casts.items()
        ]
        return f"{df_var} = {df_var}.with_columns([{', '.join(exprs)}])"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        casts = step.params.get("casts", {})
        _PD_TYPES = {
            "int": "int64",
            "integer": "int64",
            "bigint": "int64",
            "float": "float64",
            "double": "float64",
            "str": "str",
            "varchar": "str",
            "text": "str",
            "bool": "bool",
            "boolean": "bool",
            "date": "datetime64[ns]",
            "datetime": "datetime64[ns]",
            "timestamp": "datetime64[ns]",
        }
        lines = [
            f"{df_var}['{col}'] = {df_var}['{col}'].astype('{_PD_TYPES.get(dtype.lower(), dtype)}')"
            for col, dtype in casts.items()
        ]
        return "\n".join(lines) if lines else "# tidak ada cast"


class SortCodeGen:
    """Urutkan baris berdasarkan satu atau lebih kolom."""

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        columns = step.params.get("columns", [])
        # columns: [{"column": "total_harga", "ascending": false}]
        if not columns:
            return f"SELECT * FROM {source_table}"
        order_parts = [
            f'"{c["column"]}" {"ASC" if c.get("ascending", True) else "DESC"}' for c in columns
        ]
        return f"SELECT * FROM {source_table}\nORDER BY {', '.join(order_parts)}"

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        columns = step.params.get("columns", [])
        by = [c["column"] for c in columns]
        desc = [not c.get("ascending", True) for c in columns]
        return f"{df_var} = {df_var}.sort(by={by}, descending={desc})"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        columns = step.params.get("columns", [])
        by = [c["column"] for c in columns]
        asc = [c.get("ascending", True) for c in columns]
        return f"{df_var} = {df_var}.sort_values(by={by}, ascending={asc}).reset_index(drop=True)"


class LimitCodeGen:
    """Batasi jumlah baris output."""

    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        n = step.params.get("n", 100)
        offset = step.params.get("offset", 0)
        sql = f"SELECT * FROM {source_table} LIMIT {n}"
        if offset:
            sql += f" OFFSET {offset}"
        return sql

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        n = step.params.get("n", 100)
        offset = step.params.get("offset", 0)
        if offset:
            return f"{df_var} = {df_var}.slice({offset}, {n})"
        return f"{df_var} = {df_var}.head({n})"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        n = step.params.get("n", 100)
        offset = step.params.get("offset", 0)
        if offset:
            return f"{df_var} = {df_var}.iloc[{offset}:{offset}+{n}].reset_index(drop=True)"
        return f"{df_var} = {df_var}.head({n})"


# -----------------------------------------------------------------------
# Registry
# -----------------------------------------------------------------------

STEP_GENERATORS: dict[str, Any] = {
    "filter": FilterCodeGen(),
    "drop_null": DropNullCodeGen(),
    "deduplicate": DeduplicateCodeGen(),
    "derive": DeriveCodeGen(),
    "aggregate": AggregateCodeGen(),
    "rename": RenameCodeGen(),
    "cast": CastCodeGen(),
    "sort": SortCodeGen(),
    "limit": LimitCodeGen(),
}

STEP_METADATA = {
    "filter": {"label": "Filter Baris", "icon": "Filter", "color": "blue"},
    "drop_null": {"label": "Hapus Null", "icon": "Minus", "color": "orange"},
    "deduplicate": {"label": "Deduplikasi", "icon": "Copy", "color": "purple"},
    "derive": {"label": "Kolom Baru", "icon": "Plus", "color": "green"},
    "aggregate": {"label": "Agregasi", "icon": "BarChart2", "color": "indigo"},
    "rename": {"label": "Ganti Nama", "icon": "Edit", "color": "yellow"},
    "cast": {"label": "Ubah Tipe", "icon": "Shuffle", "color": "pink"},
    "sort": {"label": "Urutkan", "icon": "ArrowUpDown", "color": "cyan"},
    "limit": {"label": "Batasi Baris", "icon": "Scissors", "color": "red"},
}


# -----------------------------------------------------------------------
# Codegen engine
# -----------------------------------------------------------------------


def generate_pipeline_code(source_table: str, steps: list[PipelineStepDef]) -> dict[str, str]:
    """Generate kode SQL, Polars, dan pandas untuk pipeline yang diberikan."""

    active_steps = [s for s in steps if s.enabled]

    # --- SQL ---
    sql_lines = [
        f"-- Pipeline untuk tabel: {source_table}",
        f"-- {len(active_steps)} step aktif",
        "",
    ]
    curr_view = source_table
    for i, step in enumerate(active_steps, 1):
        gen = STEP_GENERATORS.get(step.kind)
        if gen:
            sql_step = gen.to_sql(step, curr_view)
            next_view = f"step_{i}_{step.kind}"
            sql_lines.append(f"-- Step {i}: {step.name}")
            sql_lines.append(f"CREATE OR REPLACE TEMP VIEW {next_view} AS")
            sql_lines.append(sql_step + ";")
            sql_lines.append("")
            curr_view = next_view
    sql_lines.append("-- Hasil akhir")
    sql_lines.append(f"SELECT * FROM {curr_view};")

    # --- Polars ---
    polars_lines = [
        "import polars as pl",
        "",
        "# Baca dari workspace DuckDB",
        f"df = pl.read_database_uri('SELECT * FROM {source_table}', uri='duckdb:///workspace.duckdb')",
        "",
    ]
    for step in active_steps:
        gen = STEP_GENERATORS.get(step.kind)
        if gen:
            polars_lines.append(f"# Step: {step.name}")
            polars_lines.append(gen.to_polars(step, "df"))
            polars_lines.append("")
    polars_lines.append("print(f'Selesai: {len(df):,} baris')")

    # --- pandas ---
    pandas_lines = [
        "import pandas as pd",
        "import duckdb",
        "",
        "# Baca dari workspace DuckDB",
        "con = duckdb.connect('workspace.duckdb')",
        f"df = con.execute('SELECT * FROM {source_table}').fetchdf()",
        "",
    ]
    for step in active_steps:
        gen = STEP_GENERATORS.get(step.kind)
        if gen:
            pandas_lines.append(f"# Step: {step.name}")
            pandas_lines.append(gen.to_pandas(step, "df"))
            pandas_lines.append("")
    pandas_lines.append("print(f'Selesai: {len(df):,} baris')")

    return {
        "sql": "\n".join(sql_lines),
        "polars": "\n".join(polars_lines),
        "pandas": "\n".join(pandas_lines),
    }
