"""
Python Sandbox Runner (Fase 2).
Sesuai AGENTS.md Bagian 6.1 & 7.2:
- Menjalankan kode pengguna di proses terpisah (subprocess), BUKAN exec/eval di proses FastAPI
- Timeout eksekusi ketat (default 30s)
- Kompatibel lintas sistem operasi (menghindari lock file database via Parquet exchange layer)
- Menyediakan objek `ctx` dengan Polars/pandas yang terhubung ke DuckDB workspace
- Menangkap stdout, stderr, durasi eksekusi, serta preview dataframe hasil
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.engine.workspace import get_engine


@dataclass
class ExecutionResult:
    success: bool
    stdout: str
    stderr: str
    duration_ms: float
    output_preview: dict[str, Any] | None = None
    tables_written: list[str] = field(default_factory=list)
    error_message: str | None = None


# Script wrapper yang diinjeksi ke proses anak
_RUNNER_WRAPPER_CODE = """
import sys
import json
from pathlib import Path
import duckdb
import polars as pl
import pandas as pd

class ExecutionContext:
    def __init__(self, data_dir, params=None):
        self._data_dir = Path(data_dir)
        self.params = params or {}
        self.written_tables = []
        self._last_result = None

    def read_table(self, table_name, engine="polars"):
        parquet_path = self._data_dir / f"{table_name}.parquet"
        if not parquet_path.exists():
            raise FileNotFoundError(f"Tabel '{table_name}' tidak ditemukan di workspace cache.")
        df = pl.read_parquet(str(parquet_path))
        if engine == "pandas":
            return df.to_pandas()
        return df

    def sql(self, query):
        con = duckdb.connect(":memory:")
        try:
            # Daftarkan semua file parquet di data_dir sebagai view
            for p in self._data_dir.glob("*.parquet"):
                tname = p.stem
                con.execute(f"CREATE VIEW \\"{tname}\\" AS SELECT * FROM read_parquet('{p.as_posix()}')")
            arrow_table = con.execute(query).arrow()
            return pl.from_arrow(arrow_table)
        finally:
            con.close()

    def write_table(self, table_name, df, mode="overwrite"):
        parquet_path = self._data_dir / f"{table_name}.parquet"
        if isinstance(df, pl.DataFrame):
            df.write_parquet(str(parquet_path))
        elif isinstance(df, pd.DataFrame):
            df.to_parquet(str(parquet_path), index=False)
        else:
            raise ValueError("DataFrame harus berupa objek Polars atau pandas")

        if table_name not in self.written_tables:
            self.written_tables.append(table_name)

    def log(self, *args):
        print("[ctx.log]", *args)

    def display(self, df):
        self._last_result = df

ctx = ExecutionContext(sys.argv[1], json.loads(sys.argv[2]) if len(sys.argv) > 2 else {})

# --- USER SCRIPT BEGIN ---
{USER_CODE}
# --- USER SCRIPT END ---

result_payload = {
    "tables_written": ctx.written_tables,
    "preview": None
}

target_df = ctx._last_result
if target_df is None and "df" in locals():
    target_df = locals()["df"]

if target_df is not None:
    try:
        if isinstance(target_df, pl.DataFrame):
            sample = target_df.head(50)
            result_payload["preview"] = {
                "columns": sample.columns,
                "types": [str(t) for t in sample.dtypes],
                "rows": sample.to_dicts()
            }
        elif isinstance(target_df, pd.DataFrame):
            sample = target_df.head(50)
            result_payload["preview"] = {
                "columns": list(sample.columns),
                "types": [str(t) for t in sample.dtypes],
                "rows": sample.to_dict(orient="records")
            }
    except Exception as e:
        sys.stderr.write(f"Gagal memformat preview DataFrame: {e}\\n")

print("---ENGINE_RESULT_START---")
print(json.dumps(result_payload))
print("---ENGINE_RESULT_END---")
"""


class SandboxRunner:
    """Runner yang mengeksekusi kode Python pengguna dalam proses terisolasi."""

    def __init__(self, timeout_seconds: int = 30) -> None:
        self.default_timeout = timeout_seconds

    def execute(
        self,
        code: str,
        params: dict[str, Any] | None = None,
        timeout: int | None = None,
    ) -> ExecutionResult:
        engine = get_engine()
        actual_timeout = timeout or self.default_timeout

        # Persiapkan folder staging Parquet untuk pertukaran data bebas lock
        cache_dir = (
            Path(__file__).resolve().parent.parent.parent / "workspace_data" / "parquet_cache"
        )
        cache_dir.mkdir(parents=True, exist_ok=True)

        # Ekspor tabel aktif dari DuckDB ke cache Parquet
        try:
            tables = [t.name for t in engine.list_tables()]
            for tbl in tables:
                tgt_parquet = cache_dir / f"{tbl}.parquet"
                engine.conn.execute(
                    f"COPY \"{tbl}\" TO '{tgt_parquet.as_posix()}' (FORMAT PARQUET)"
                )
        except Exception:
            pass

        safe_env = os.environ.copy()
        safe_env.pop("ENGINEER_SECRET_KEY", None)
        safe_env["PYTHONDONTWRITEBYTECODE"] = "1"
        safe_env["PYTHONUNBUFFERED"] = "1"

        full_script = _RUNNER_WRAPPER_CODE.replace("{USER_CODE}", code)

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", encoding="utf-8", delete=False
        ) as tmp_file:
            tmp_file.write(full_script)
            tmp_script_path = tmp_file.name

        t0 = time.perf_counter()
        try:
            proc = subprocess.run(
                [
                    sys.executable,
                    tmp_script_path,
                    str(cache_dir),
                    json.dumps(params or {}),
                ],
                capture_output=True,
                text=True,
                timeout=actual_timeout,
                env=safe_env,
            )
            duration_ms = round((time.perf_counter() - t0) * 1000, 2)

            raw_stdout = proc.stdout
            raw_stderr = proc.stderr

            output_preview = None
            tables_written = []

            if "---ENGINE_RESULT_START---" in raw_stdout:
                parts = raw_stdout.split("---ENGINE_RESULT_START---")
                user_stdout = parts[0].strip()
                result_part = parts[1].split("---ENGINE_RESULT_END---")[0].strip()
                try:
                    payload = json.loads(result_part)
                    output_preview = payload.get("preview")
                    tables_written = payload.get("tables_written", [])
                except Exception:
                    pass
            else:
                user_stdout = raw_stdout.strip()

            success = proc.returncode == 0
            err_msg = (
                None
                if success
                else (raw_stderr.strip() or f"Kode keluar dengan kode status {proc.returncode}")
            )

            # Sinkronkan kembali tabel yang ditulis ke DuckDB
            if success and tables_written:
                for w_tbl in tables_written:
                    p_file = cache_dir / f"{w_tbl}.parquet"
                    if p_file.exists():
                        try:
                            engine.conn.execute(
                                f"CREATE OR REPLACE TABLE \"{w_tbl}\" AS SELECT * FROM read_parquet('{p_file.as_posix()}')"
                            )
                        except Exception:
                            pass

            return ExecutionResult(
                success=success,
                stdout=user_stdout,
                stderr=raw_stderr.strip(),
                duration_ms=duration_ms,
                output_preview=output_preview,
                tables_written=tables_written,
                error_message=err_msg,
            )

        except subprocess.TimeoutExpired:
            duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            return ExecutionResult(
                success=False,
                stdout="",
                stderr="",
                duration_ms=duration_ms,
                error_message=f"Batas waktu eksekusi terlampaui ({actual_timeout} detik).",
            )
        except Exception as e:
            duration_ms = round((time.perf_counter() - t0) * 1000, 2)
            return ExecutionResult(
                success=False,
                stdout="",
                stderr=str(e),
                duration_ms=duration_ms,
                error_message=str(e),
            )
        finally:
            try:
                os.remove(tmp_script_path)
            except Exception:
                pass


_sandbox: SandboxRunner | None = None


def get_sandbox_runner() -> SandboxRunner:
    global _sandbox
    if _sandbox is None:
        _sandbox = SandboxRunner()
    return _sandbox
