"""
Airflow export & REST integration engine.
Complies with AGENTS.md Section 6.3:
- Exports pipelines and visual DAG workflows to standard Python Airflow DAG scripts
- Supports Airflow REST API connection, trigger DAG runs, and status inspection
"""

from __future__ import annotations

import re
from typing import Any

import httpx


def export_pipeline_to_airflow_dag(
    pipeline_name: str,
    steps: list[dict[str, Any]],
    cron_schedule: str = "0 2 * * *",
    description: str = "DAG hasil ekspor otomatis dari Data Engineer Workbench",
) -> str:
    """
    Exports a linear pipeline into a clean Apache Airflow DAG script.
    """
    clean_dag_id = re.sub(r"[^a-zA-Z0-9_]+", "_", pipeline_name.lower()).strip("_")
    cron_repr = f'"{cron_schedule}"' if cron_schedule else "None"

    task_definitions = []
    task_chain = []

    for idx, step in enumerate(steps, start=1):
        step_id = (
            f"step_{idx}_{re.sub(r'[^a-zA-Z0-9_]+', '_', step.get('name', f'task_{idx}').lower())}"
        )
        task_chain.append(step_id)
        step_name = step.get("name", f"Step {idx}")
        step_kind = step.get("kind", "sql")

        task_code = f"""
    {step_id} = BashOperator(
        task_id="{step_id}",
        bash_command='echo "Menjalankan step: {step_name} [{step_kind}]" && python -m app.runner.job --step "{step_name}"',
    )"""
        task_definitions.append(task_code)

    dependency_line = " >> ".join(task_chain) if len(task_chain) > 1 else ""

    dag_script = f'''"""
{description}
Diekspor dari Data Engineer Workbench (Self-hosted)
DAG ID: {clean_dag_id}
"""

from datetime import datetime, timedelta
import pendulum
from airflow import DAG
from airflow.operators.bash import BashOperator

# Konfigurasi zona waktu Asia/Jakarta sesuai standar workbench
local_tz = pendulum.timezone("Asia/Jakarta")

default_args = {{
    "owner": "data-engineer",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
}}

with DAG(
    dag_id="{clean_dag_id}",
    default_args=default_args,
    description="{description}",
    schedule_interval={cron_repr},
    start_date=datetime(2026, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["workbench", "pipeline", "indonesia"],
) as dag:
{"".join(task_definitions)}

    {dependency_line}
'''
    return dag_script.strip() + "\n"


def export_workflow_to_airflow_dag(
    workflow_name: str,
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
    cron_schedule: str = "0 3 * * *",
    description: str = "Workflow DAG hasil ekspor visual canvas",
) -> str:
    """
    Exports a visual DAG graph workflow into an Airflow DAG with full dependency topology.
    """
    clean_dag_id = re.sub(r"[^a-zA-Z0-9_]+", "_", workflow_name.lower()).strip("_")
    cron_repr = f'"{cron_schedule}"' if cron_schedule else "None"

    # Map node IDs to safe variable names
    node_var_map: dict[str, str] = {}
    task_definitions = []

    for n in nodes:
        raw_id = n.get("id", "n")
        label = n.get("label", n.get("data", {}).get("label", raw_id))
        safe_name = f"node_{re.sub(r'[^a-zA-Z0-9_]+', '_', label.lower()).strip('_')}"
        node_var_map[raw_id] = safe_name

        task_definitions.append(f"""
    {safe_name} = BashOperator(
        task_id="{safe_name}",
        bash_command='echo "Executing workflow node: {label}"',
    )""")

    # Build dependency chains
    edge_statements = []
    for e in edges:
        source_id = e.get("source")
        target_id = e.get("target")
        if source_id in node_var_map and target_id in node_var_map:
            edge_statements.append(f"    {node_var_map[source_id]} >> {node_var_map[target_id]}")

    dag_script = f'''"""
{description}
Diekspor dari Canvas Graf Data Engineer Workbench
DAG ID: {clean_dag_id}
"""

from datetime import datetime, timedelta
import pendulum
from airflow import DAG
from airflow.operators.bash import BashOperator

local_tz = pendulum.timezone("Asia/Jakarta")

default_args = {{
    "owner": "data-engineer",
    "depends_on_past": False,
    "retries": 3,
    "retry_delay": timedelta(minutes=2),
}}

with DAG(
    dag_id="{clean_dag_id}",
    default_args=default_args,
    description="{description}",
    schedule_interval={cron_repr},
    start_date=datetime(2026, 1, 1, tzinfo=local_tz),
    catchup=False,
    tags=["workbench", "workflow-dag"],
) as dag:
{"".join(task_definitions)}

{"\n".join(edge_statements)}
'''
    return dag_script.strip() + "\n"


class AirflowClient:
    """Connects to user's open-source Apache Airflow via REST API."""

    def __init__(
        self,
        base_url: str = "http://localhost:8080",
        username: str = "",
        password: str = "",
        bearer_token: str = "",
    ):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.bearer_token = bearer_token

    def _get_auth_headers(self) -> dict[str, str]:
        headers = {}
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
        return headers

    def test_connection(self) -> dict[str, Any]:
        url = f"{self.base_url}/api/v1/version"
        auth = (self.username, self.password) if (self.username and self.password) else None
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(url, auth=auth, headers=self._get_auth_headers())
                if res.status_code == 200:
                    data = res.json()
                    return {
                        "success": True,
                        "version": data.get("version", "Airflow REST"),
                        "message": f"Terhubung ke Apache Airflow v{data.get('version')} pada {self.base_url}",
                    }
                return {
                    "success": False,
                    "message": f"Airflow REST API merespons status {res.status_code}: {res.text}",
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"Gagal menghubungi Airflow REST API: {str(e)}",
            }

    def trigger_dag_run(self, dag_id: str, conf: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base_url}/api/v1/dags/{dag_id}/dagRuns"
        auth: Any = (self.username, self.password) if (self.username and self.password) else None
        payload = {"conf": conf or {}}
        try:
            with httpx.Client(timeout=10.0) as client:
                res = client.post(url, json=payload, auth=auth, headers=self._get_auth_headers())
                if res.status_code in (200, 201):
                    return {"success": True, "data": res.json()}
                return {
                    "success": False,
                    "message": f"Gagal memicu DAG '{dag_id}' ({res.status_code}): {res.text}",
                }
        except Exception as e:
            return {"success": False, "message": str(e)}

    def get_dag_status(self, dag_id: str) -> dict[str, Any]:
        url = f"{self.base_url}/api/v1/dags/{dag_id}"
        auth: Any = (self.username, self.password) if (self.username and self.password) else None
        try:
            with httpx.Client(timeout=5.0) as client:
                res = client.get(url, auth=auth, headers=self._get_auth_headers())
                if res.status_code == 200:
                    return {"success": True, "data": res.json()}
                return {"success": False, "message": f"Status {res.status_code}"}
        except Exception as e:
            return {"success": False, "message": str(e)}
