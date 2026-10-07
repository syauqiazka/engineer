from dataclasses import dataclass
from typing import Any, Protocol


@dataclass
class PipelineStepDef:
    id: str
    kind: str  # "filter", "deduplicate", "derive", "drop_null", "aggregate"
    name: str
    params: dict[str, Any]
    enabled: bool = True


class StepCodeGen(Protocol):
    def to_sql(self, step: PipelineStepDef, source_table: str) -> str: ...
    def to_polars(self, step: PipelineStepDef, df_var: str) -> str: ...
    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str: ...


class FilterCodeGen:
    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        condition = step.params.get("condition", "TRUE")
        return f"SELECT * FROM {source_table} WHERE {condition}"

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        col = step.params.get("column", "status_bayar")
        val = step.params.get("value", "Lunas")
        return f"{df_var} = {df_var}.filter(pl.col('{col}') == '{val}')"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        col = step.params.get("column", "status_bayar")
        val = step.params.get("value", "Lunas")
        return f"{df_var} = {df_var}[{df_var}['{col}'] == '{val}']"


class DropNullCodeGen:
    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        col = step.params.get("column", "tanggal")
        return f'SELECT * FROM {source_table} WHERE "{col}" IS NOT NULL'

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        col = step.params.get("column", "tanggal")
        return f"{df_var} = {df_var}.drop_nulls(subset=['{col}'])"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        col = step.params.get("column", "tanggal")
        return f"{df_var} = {df_var}.dropna(subset=['{col}'])"


class DeduplicateCodeGen:
    def to_sql(self, step: PipelineStepDef, source_table: str) -> str:
        cols = ", ".join(step.params.get("columns", ["nomor_pesanan"]))
        return f"SELECT DISTINCT ON ({cols}) * FROM {source_table}"

    def to_polars(self, step: PipelineStepDef, df_var: str) -> str:
        cols = step.params.get("columns", ["nomor_pesanan"])
        return f"{df_var} = {df_var}.unique(subset={cols})"

    def to_pandas(self, step: PipelineStepDef, df_var: str) -> str:
        cols = step.params.get("columns", ["nomor_pesanan"])
        return f"{df_var} = {df_var}.drop_duplicates(subset={cols})"


STEP_GENERATORS: dict[str, Any] = {
    "filter": FilterCodeGen(),
    "drop_null": DropNullCodeGen(),
    "deduplicate": DeduplicateCodeGen(),
}


def generate_pipeline_code(source_table: str, steps: list[PipelineStepDef]) -> dict[str, str]:
    # 1. SQL
    sql_lines = [f"-- Pipeline SQL untuk tabel: {source_table}"]
    curr_view = source_table
    for i, step in enumerate(steps, 1):
        if not step.enabled:
            continue
        gen = STEP_GENERATORS.get(step.kind)
        if gen:
            sql_step = gen.to_sql(step, curr_view)
            next_view = f"step_{i}_{step.kind}"
            sql_lines.append(f"CREATE OR REPLACE TEMP VIEW {next_view} AS\n{sql_step};\n")
            curr_view = next_view
    sql_lines.append(f"SELECT * FROM {curr_view};")

    # 2. Polars
    polars_lines = [
        "import polars as pl",
        "",
        "# Baca sumber data dari workspace DuckDB / Parquet",
        f"df = pl.read_database_uri('SELECT * FROM {source_table}', uri='duckdb:///workspace.duckdb')",
        "",
    ]
    for step in steps:
        if not step.enabled:
            continue
        gen = STEP_GENERATORS.get(step.kind)
        if gen:
            polars_lines.append(f"# Step: {step.name}")
            polars_lines.append(gen.to_polars(step, "df"))
    polars_lines.append("")
    polars_lines.append("print(f'Selesai diproses: {len(df)} baris')")

    # 3. Pandas
    pandas_lines = [
        "import pandas as pd",
        "import duckdb",
        "",
        "# Baca data sumber",
        "con = duckdb.connect('workspace.duckdb')",
        f"df = con.execute('SELECT * FROM {source_table}').fetchdf()",
        "",
    ]
    for step in steps:
        if not step.enabled:
            continue
        gen = STEP_GENERATORS.get(step.kind)
        if gen:
            pandas_lines.append(f"# Step: {step.name}")
            pandas_lines.append(gen.to_pandas(step, "df"))
    pandas_lines.append("")
    pandas_lines.append("print(f'Selesai diproses: {len(df)} baris')")

    return {
        "sql": "\n".join(sql_lines),
        "polars": "\n".join(polars_lines),
        "pandas": "\n".join(pandas_lines),
    }
