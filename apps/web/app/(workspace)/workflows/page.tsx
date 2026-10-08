"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play,
  Code2,
  Database,
  Filter,
  GitBranch,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Copy,
  Check,
  Save,
  LucideIcon,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import { CodeViewer } from "@/components/CodeEditor";

interface WorkflowModel {
  id: string;
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
  updated_at: string;
}

interface ExecuteWorkflowResponse {
  success: boolean;
  execution_order: string[];
  node_results: Record<string, { status: string; message: string }>;
  error?: string;
}

interface CodegenResponse {
  python_polars: string;
  sql: string;
}

interface WorkflowNodeData extends Record<string, unknown> {
  nodeType?: string;
  label?: string;
  subtext?: string;
  executionStatus?: "idle" | "running" | "success" | "error";
  executionMsg?: string;
  table?: string;
  condition?: string;
  column?: string;
  target_table?: string;
}

// Custom Node Component dengan Handle input & output
function WorkflowNodeComponent({ id, data }: { id: string; data: WorkflowNodeData }) {
  const status = data.executionStatus; // 'idle' | 'running' | 'success' | 'error'

  const typeConfig: Record<string, { icon: LucideIcon; color: string; bg: string; title: string }> = {
    source: {
      icon: Database,
      color: "var(--action)",
      bg: "rgba(99, 102, 241, 0.1)",
      title: "Sumber Data",
    },
    filter: {
      icon: Filter,
      color: "#0284c7",
      bg: "rgba(2, 132, 199, 0.1)",
      title: "Filter Baris",
    },
    transform_sql: {
      icon: GitBranch,
      color: "#8b5cf6",
      bg: "rgba(139, 92, 246, 0.1)",
      title: "Transformasi SQL",
    },
    quality_assert: {
      icon: ShieldCheck,
      color: "var(--success)",
      bg: "rgba(16, 185, 129, 0.1)",
      title: "Uji Kualitas",
    },
    destination: {
      icon: Save,
      color: "#f59e0b",
      bg: "rgba(245, 158, 11, 0.1)",
      title: "Tujuan (Target)",
    },
  };

  const cfg = typeConfig[data.nodeType || "source"] || typeConfig.source;
  const Icon = cfg.icon;

  return (
    <div
      className={`min-w-[200px] bg-[var(--surface)] border rounded-[4px] shadow-md transition-all ${
        status === "running"
          ? "border-[var(--action)] ring-2 ring-[var(--action)] ring-opacity-50 animate-pulse"
          : status === "success"
          ? "border-[var(--success)] ring-1 ring-[var(--success)]"
          : status === "error"
          ? "border-[var(--error)] ring-1 ring-[var(--error)]"
          : "border-[var(--rule)]"
      }`}
    >
      {/* Target input handle (kecuali source) */}
      {data.nodeType !== "source" && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-[var(--action)] !border-2 !border-[var(--surface)]"
        />
      )}

      {/* Header */}
      <div
        className="px-2.5 py-1.5 border-b border-[var(--rule)] flex items-center justify-between"
        style={{ backgroundColor: cfg.bg }}
      >
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
          <span className="text-[11px] font-bold font-mono text-[var(--ink)] uppercase">
            {cfg.title}
          </span>
        </div>

        {status === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success)]" />}
        {status === "error" && <XCircle className="w-3.5 h-3.5 text-[var(--error)]" />}
        {status === "running" && <Clock className="w-3.5 h-3.5 text-[var(--action)] animate-spin" />}
      </div>

      {/* Content */}
      <div className="p-2.5 flex flex-col gap-1">
        <span className="text-[12px] font-semibold text-[var(--ink)] leading-snug">
          {data.label || id}
        </span>
        {data.subtext && (
          <span className="text-[10px] font-mono text-[var(--ink-muted)] truncate">
            {data.subtext}
          </span>
        )}

        {/* Execution result feedback */}
        {data.executionMsg && (
          <div
            className={`mt-1 text-[10px] font-mono px-1.5 py-0.5 rounded truncate ${
              status === "success"
                ? "bg-[rgba(16,185,129,0.1)] text-[var(--success)]"
                : "bg-[var(--error-wash)] text-[var(--error)]"
            }`}
          >
            {data.executionMsg}
          </div>
        )}
      </div>

      {/* Source output handle (kecuali destination) */}
      {data.nodeType !== "destination" && (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-[var(--action)] !border-2 !border-[var(--surface)]"
        />
      )}
    </div>
  );
}

const nodeTypes = {
  workflowNode: WorkflowNodeComponent,
};

export default function WorkflowsPage() {
  const [activeWf, setActiveWf] = useState<WorkflowModel | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [running, setRunning] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codegen, setCodegen] = useState<CodegenResponse | null>(null);
  const [codeTab, setCodeTab] = useState<"python" | "sql">("python");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const data = await fetchApi<WorkflowModel[]>("/workflows");
        if (ignore) return;
        if (data.length > 0) {
          const wf = data[0];
          setActiveWf(wf);
          const flowNodes: Node[] = wf.nodes.map((n) => {
            const d = n.data as WorkflowNodeData;
            return {
              ...n,
              type: "workflowNode",
              data: {
                ...d,
                nodeType: (n.type as string) || "source",
                label: (n.data?.label as string) || (n.id as string),
                subtext:
                  n.type === "source"
                    ? `Tabel: ${String(d?.table || "")}`
                    : n.type === "filter"
                    ? String(d?.condition || "")
                    : n.type === "quality_assert"
                    ? `Assert: ${String(d?.column || "")}`
                    : n.type === "transform_sql"
                    ? "SQL Query"
                    : `Tujuan: ${String(d?.target_table || "")}`,
                executionStatus: "idle",
              },
            };
          });
          setNodes(flowNodes);
          setEdges(wf.edges);
        }
      } catch (err) {
        console.error("Gagal memuat workflow:", err);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, [setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  const handleExecute = async () => {
    if (!activeWf) return;
    setRunning(true);

    // Reset status node ke running
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: { ...n.data, executionStatus: "running", executionMsg: "Mengeksekusi..." },
      }))
    );

    try {
      const res = await fetchApi<ExecuteWorkflowResponse>(`/workflows/${activeWf.id}/execute`, {
        method: "POST",
      });

      // Update node statuses berdasarkan hasil
      setNodes((nds) =>
        nds.map((n) => {
          const r = res.node_results[n.id];
          if (r) {
            return {
              ...n,
              data: {
                ...n.data,
                executionStatus: r.status,
                executionMsg: r.message,
              },
            };
          }
          return n;
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Eksekusi gagal: " + msg);
    } finally {
      setRunning(false);
    }
  };

  const handleOpenCodegen = async () => {
    if (!activeWf) return;
    try {
      const res = await fetchApi<CodegenResponse>(`/workflows/${activeWf.id}/codegen`, {
        method: "POST",
      });
      setCodegen(res);
      setShowCodeModal(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Gagal membuat kode: " + msg);
    }
  };

  const handleCopyCode = () => {
    if (!codegen) return;
    const text = codeTab === "python" ? codegen.python_polars : codegen.sql;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [showAirflowModal, setShowAirflowModal] = useState(false);
  const [airflowDagCode, setAirflowDagCode] = useState("");
  const [airflowFileName, setAirflowFileName] = useState("dag_workflow.py");

  const handleExportAirflow = async () => {
    if (!activeWf) return;
    try {
      const res = await fetchApi<{ code: string; filename: string }>("/airflow/export-workflow", {
        method: "POST",
        body: JSON.stringify({
          workflow_name: activeWf.name,
          nodes,
          edges,
        }),
      });
      setAirflowDagCode(res.code);
      setAirflowFileName(res.filename);
      setShowAirflowModal(true);
    } catch {
      alert("Gagal mengekspor DAG Airflow");
    }
  };

  const downloadAirflowDag = () => {
    const blob = new Blob([airflowDagCode], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = airflowFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Workflow Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] pb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <GitBranch className="w-5 h-5 text-[var(--action)]" />
            <h1 className="text-[16px] font-bold text-[var(--ink)]">
              {activeWf?.name || "Workflow Graf (DAG)"}
            </h1>
          </div>
          <span className="text-[11px] px-2 py-0.5 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded font-mono text-[var(--ink-muted)]">
            {nodes.length} Nodes • {edges.length} Edges
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAirflow}
            className="flex items-center gap-1.5 px-3 py-1 text-[12px] font-semibold bg-[var(--surface)] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
            title="Ekspor sebagai file DAG Apache Airflow"
          >
            <Sparkles className="w-3.5 h-3.5 text-[var(--action)]" />
            Ekspor DAG Airflow
          </button>

          <button
            onClick={handleOpenCodegen}
            className="flex items-center gap-1.5 px-3 py-1 text-[12px] font-semibold bg-[var(--surface)] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
          >
            <Code2 className="w-3.5 h-3.5 text-[var(--action)]" />
            Lihat sebagai Kode
          </button>

          <button
            onClick={handleExecute}
            disabled={running}
            className="flex items-center gap-1.5 px-3.5 py-1 text-[12px] font-semibold bg-[var(--action)] text-white hover:bg-[var(--action-hover)] disabled:opacity-50 rounded-[2px]"
          >
            <Play className={`w-3.5 h-3.5 fill-white ${running ? "animate-spin" : ""}`} />
            {running ? "Menjalankan DAG..." : "Jalankan Workflow"}
          </button>
        </div>
      </div>

      {/* Interactive Visual Canvas */}
      <div className="flex-1 w-full border border-[var(--rule)] rounded-[3px] overflow-hidden bg-[#0d1017] relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background color="#1e2433" gap={16} />
          <Controls className="!bg-[var(--surface)] !border-[var(--rule)] !text-[var(--ink)]" />
          <MiniMap
            className="!bg-[var(--surface-sunk)] !border-[var(--rule)]"
            nodeColor="#6366f1"
          />
        </ReactFlow>

        {/* Floating Canvas Guide */}
        <div className="absolute left-3 bottom-3 bg-[var(--surface)] border border-[var(--rule)] px-2.5 py-1 rounded-[3px] text-[11px] text-[var(--ink-muted)] shadow flex items-center gap-2 pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 text-[var(--action)]" />
          <span>Tarik konektor antar-node untuk membentuk DAG valid tanpa siklus</span>
        </div>
      </div>

      {/* Code Modal ("Lihat sebagai Kode") */}
      {showCodeModal && codegen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-[var(--rule)] bg-[var(--surface-sunk)]">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[var(--action)]" />
                <span className="text-[13px] font-bold text-[var(--ink)]">
                  Kode Representasi Pipeline Mandiri (Fase 2)
                </span>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-[12px]"
              >
                ✕ Tutup
              </button>
            </div>

            {/* Code Tabs */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--rule)] bg-[var(--surface)]">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCodeTab("python")}
                  className={`px-2.5 py-1 text-[12px] font-semibold rounded-[2px] ${
                    codeTab === "python"
                      ? "bg-[var(--surface-sunk)] text-[var(--action)] border border-[var(--rule)]"
                      : "text-[var(--ink-muted)]"
                  }`}
                >
                  Python (Polars Engine)
                </button>
                <button
                  onClick={() => setCodeTab("sql")}
                  className={`px-2.5 py-1 text-[12px] font-semibold rounded-[2px] ${
                    codeTab === "sql"
                      ? "bg-[var(--surface-sunk)] text-[var(--action)] border border-[var(--rule)]"
                      : "text-[var(--ink-muted)]"
                  }`}
                >
                  DuckDB SQL
                </button>
              </div>

              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] bg-[var(--surface-sunk)] border border-[var(--rule)] hover:bg-[var(--surface)] rounded-[2px] text-[var(--ink)]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[var(--success)]" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Tersalin!" : "Salin Kode"}
              </button>
            </div>

            {/* Code Display */}
            <div className="flex-1 overflow-auto p-3 bg-[var(--surface-sunk)]">
              <CodeViewer
                value={codeTab === "python" ? codegen.python_polars : codegen.sql}
                language={codeTab === "python" ? "python" : "sql"}
                height="450px"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: Ekspor DAG Airflow */}
      {showAirflowModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            <div className="p-3.5 border-b border-[var(--rule)] flex items-center justify-between bg-[var(--surface-sunk)]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--action)]" />
                <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                  Ekspor ke Apache Airflow DAG: <span className="font-mono text-[var(--action)]">{airflowFileName}</span>
                </h3>
              </div>
              <button
                onClick={() => setShowAirflowModal(false)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-sm"
              >
                ✕
              </button>
            </div>

            <div className="px-4 py-2 border-b border-[var(--rule)] flex items-center justify-between bg-[var(--surface)]">
              <span className="text-[12px] text-[var(--ink-muted)]">
                Script Python standar Airflow dengan dependensi graf node dan zona waktu Asia/Jakarta (WIB).
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(airflowDagCode);
                    alert("Kode DAG berhasil disalin!");
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-[11.5px] bg-[var(--surface-sunk)] border border-[var(--rule)] hover:bg-[var(--surface)] rounded-[2px] text-[var(--ink)] cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" /> Salin Kode
                </button>
                <button
                  onClick={downloadAirflowDag}
                  className="flex items-center gap-1 px-3 py-1 text-[11.5px] bg-[var(--action)] text-white hover:opacity-90 rounded-[2px] font-medium cursor-pointer"
                >
                  Unduh .py
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3 bg-[var(--surface-sunk)]">
              <CodeViewer value={airflowDagCode} language="python" height="420px" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

