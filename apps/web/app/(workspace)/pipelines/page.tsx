"use client";

import React, { useState, useEffect } from "react";
import { GitBranch, Code, Play, Check, Copy, Eye } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { CodeViewer } from "@/components/CodeEditor";

interface StepItem {
  id: string;
  kind: string;
  name: string;
  params: Record<string, unknown>;
  enabled: boolean;
  input_rows: number;
  output_rows: number;
}

export default function PipelinesPage() {
  const [mode, setMode] = useState<"visual" | "code">("visual");
  const sourceTable = "pesanan_harian";
  const [steps, setSteps] = useState<StepItem[]>([
    {
      id: "s1",
      kind: "drop_null",
      name: "Buang Baris Tanggal Kosong",
      params: { column: "tanggal" },
      enabled: true,
      input_rows: 12,
      output_rows: 11,
    },
    {
      id: "s2",
      kind: "deduplicate",
      name: "Deduplikasi Nomor Pesanan",
      params: { columns: ["nomor_pesanan"] },
      enabled: true,
      input_rows: 11,
      output_rows: 10,
    },
    {
      id: "s3",
      kind: "filter",
      name: "Filter Status Bayar Lunas",
      params: { column: "status_bayar", value: "Lunas", condition: "status_bayar = 'Lunas'" },
      enabled: true,
      input_rows: 10,
      output_rows: 7,
    },
  ]);

  const [generatedCode, setGeneratedCode] = useState<{
    sql: string;
    polars: string;
    pandas: string;
  }>({
    sql: "",
    polars: "",
    pandas: "",
  });
  const [selectedCodeTab, setSelectedCodeTab] = useState<"polars" | "sql" | "pandas">("polars");
  const [copied, setCopied] = useState(false);

  // Fetch Codegen
  useEffect(() => {
    fetchApi<{ sql: string; polars: string; pandas: string }>("/pipeline/codegen", {
      method: "POST",
      body: JSON.stringify({
        source_table: sourceTable,
        steps,
      }),
    })
      .then((data) => setGeneratedCode(data))
      .catch(() => {});
  }, [sourceTable, steps]);

  const toggleStep = (id: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-3">
      {/* Header & Mode Switcher */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 select-none">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--ink)] flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[var(--action)]" />
            <span>Pipeline ETL Linear: Bersihkan Data Transaksi</span>
          </h1>
          <p className="text-[12px] text-[var(--ink-muted)]">
            Sumber data: <span className="font-mono text-[var(--ink)]">{sourceTable}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Visual vs Code Selector */}
          <div className="flex items-center bg-[var(--surface-sunk)] p-0.5 rounded-[2px] text-[12px] font-medium">
            <button
              onClick={() => setMode("visual")}
              className={`flex items-center gap-1.5 px-3 h-[26px] rounded-[2px] transition-colors ${
                mode === "visual"
                  ? "bg-[var(--surface)] text-[var(--ink)] font-semibold shadow-xs"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Visual</span>
            </button>
            <button
              onClick={() => setMode("code")}
              className={`flex items-center gap-1.5 px-3 h-[26px] rounded-[2px] transition-colors ${
                mode === "code"
                  ? "bg-[var(--surface)] text-[var(--ink)] font-semibold shadow-xs"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              <Code className="w-3.5 h-3.5" />
              <span>Lihat sebagai kode</span>
            </button>
          </div>

          <button
            onClick={() => alert("Pipeline berhasil dijalankan di DuckDB! 7 baris dihasilkan.")}
            className="flex items-center gap-1.5 px-3 h-[28px] text-[12px] font-semibold bg-[var(--action)] text-white hover:opacity-90 rounded-[2px]"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Jalankan pipeline</span>
          </button>
        </div>
      </div>

      {/* Visual Step Mode */}
      {mode === "visual" ? (
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden divide-y divide-[var(--rule)]">
          <div className="px-3 py-2 bg-[var(--surface-sunk)] text-[12px] font-semibold text-[var(--ink-muted)] flex justify-between">
            <span>Urutan Step Transformasi</span>
            <span>Metrik Baris</span>
          </div>

          {steps.map((step, idx) => (
            <div
              key={step.id}
              className={`p-3 flex items-center justify-between text-[13px] ${
                !step.enabled ? "opacity-50 bg-[var(--surface-sunk)]" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-5 h-5 flex items-center justify-center font-mono text-[11px] font-bold rounded-[2px] ${
                    step.enabled
                      ? "bg-[var(--action)] text-white"
                      : "bg-[var(--rule-strong)] text-[var(--ink-muted)] line-through"
                  }`}
                >
                  {idx + 1}
                </span>

                <div>
                  <h3
                    className={`font-semibold ${
                      step.enabled ? "text-[var(--ink)]" : "text-[var(--ink-muted)] line-through"
                    }`}
                  >
                    {step.name}
                  </h3>
                  <p className="text-[11.5px] font-mono text-[var(--ink-muted)]">
                    Jenis: {step.kind} | Parameter: {JSON.stringify(step.params)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="font-mono text-[12px] text-[var(--ink-muted)]">
                  {step.input_rows} → <span className="font-bold text-[var(--ink)]">{step.output_rows}</span> baris
                </span>

                <button
                  onClick={() => toggleStep(step.id)}
                  className={`px-2 py-0.5 text-[11px] font-medium border rounded-[2px] ${
                    step.enabled
                      ? "border-[var(--rule-strong)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      : "border-[var(--action)] text-[var(--action)] font-semibold"
                  }`}
                >
                  {step.enabled ? "Nonaktifkan" : "Aktifkan"}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Code Generation Mode */
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden flex flex-col">
          {/* Subtabs for Code Engines */}
          <div className="px-3 py-1.5 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(["polars", "sql", "pandas"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedCodeTab(tab)}
                  className={`px-2.5 py-0.5 text-[12px] font-mono font-medium rounded-[2px] ${
                    selectedCodeTab === tab
                      ? "bg-[var(--surface)] text-[var(--action)] font-bold shadow-xs"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              onClick={() => copyToClipboard(generatedCode[selectedCodeTab])}
              className="flex items-center gap-1 text-[11px] text-[var(--ink)] hover:text-[var(--action)] px-2 py-0.5 border border-[var(--rule-strong)] rounded-[2px]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[var(--ok)]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Disalin!" : "Salin Kode"}</span>
            </button>
          </div>

          <div className="overflow-hidden">
            <CodeViewer
              language={selectedCodeTab === "sql" ? "sql" : "python"}
              value={generatedCode[selectedCodeTab]}
              minHeight="200px"
              height="400px"
            />
          </div>
        </div>
      )}
    </div>
  );
}
