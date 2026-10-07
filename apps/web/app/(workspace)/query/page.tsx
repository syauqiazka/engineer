"use client";

import React, { useState, useCallback, useRef } from "react";
import {
  Play,
  Download,
  Terminal,
  AlertCircle,
  Clock,
  Database,
  ChevronDown,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import CodeEditor from "@/components/CodeEditor";
import DataGrid, { GridColumn } from "@/components/DataGrid";

interface QueryResult {
  columns: string[];
  column_types: string[];
  rows: unknown[][];
  total_rows: number;
  execution_time_ms: number;
  scanned_bytes_estimate: number | null;
}

const DEFAULT_SQL = `SELECT 
  kota,
  kategori,
  COUNT(*) AS jumlah_pesanan,
  SUM(total_harga) AS omset_rp
FROM pesanan_harian
GROUP BY kota, kategori
ORDER BY omset_rp DESC;`;

export default function QueryPage() {
  const [sql, setSql] = useState<string>(DEFAULT_SQL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleRunQuery = useCallback(
    async (sqlToRun?: string) => {
      const query = sqlToRun ?? sql;
      if (!query.trim()) return;
      setLoading(true);
      setError(null);

      try {
        const data = await fetchApi<QueryResult>("/query", {
          method: "POST",
          body: JSON.stringify({ sql: query }),
        });
        setResult(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Gagal mengeksekusi kueri SQL");
      } finally {
        setLoading(false);
      }
    },
    [sql]
  );

  const handleExportResult = useCallback(
    (fmt: string) => {
      if (!result) return;
      setShowExportMenu(false);

      // Build CSV/TSV in-browser from result
      const sep = fmt === "tsv" ? "\t" : ",";
      const header = result.columns.join(sep);
      const body = result.rows
        .map((row) =>
          row
            .map((v) =>
              v === null ? "" : fmt === "json" ? v : `"${String(v).replace(/"/g, '""')}"`
            )
            .join(sep)
        )
        .join("\n");

      let content: string;
      let mimeType: string;
      let filename: string;

      if (fmt === "json") {
        const records = result.rows.map((row) =>
          Object.fromEntries(result.columns.map((c, i) => [c, row[i]]))
        );
        content = JSON.stringify(records, null, 2);
        mimeType = "application/json";
        filename = "query_result.json";
      } else {
        content = header + "\n" + body;
        mimeType = fmt === "tsv" ? "text/tab-separated-values" : "text/csv";
        filename = `query_result.${fmt}`;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [result]
  );

  const gridColumns: GridColumn[] =
    result?.columns.map((name, i) => ({
      name,
      type: result.column_types[i] || "VARCHAR",
    })) ?? [];

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[var(--action)]" />
          <h1 className="text-[14px] font-semibold text-[var(--ink)]">
            Editor Kueri SQL
          </h1>
          <span className="text-[12px] text-[var(--ink-muted)]">
            Engine:{" "}
            <span className="font-mono text-[var(--ink)]">workspace · DuckDB</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="run-query-btn"
            onClick={() => handleRunQuery()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-[28px] text-[12px] font-semibold bg-[var(--action)] text-white hover:opacity-90 rounded-[2px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{loading ? "Menjalankan…" : "Jalankan"}</span>
            <kbd className="ml-1 text-[10px] font-mono opacity-70">⌃↵</kbd>
          </button>
        </div>
      </div>

      {/* SQL Editor — CodeMirror 6 */}
      <div className="flex-shrink-0">
        <CodeEditor
          id="sql-editor"
          value={sql}
          onChange={(v) => setSql(v)}
          language="sql"
          height="180px"
          minHeight="120px"
          placeholder="-- Tulis kueri SQL DuckDB di sini…  Ctrl+Enter untuk menjalankan"
          onRun={(v) => handleRunQuery(v)}
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="bg-[var(--error-wash)] border border-[var(--error)] p-2.5 rounded-[2px] flex items-start gap-2 text-[12px] text-[var(--error)]"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <pre className="font-mono whitespace-pre-wrap break-all">{error}</pre>
        </div>
      )}

      {/* Results */}
      <div className="flex-1 bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden flex flex-col min-h-0">
        {/* Results toolbar */}
        <div className="px-3 h-[28px] bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between text-[11px] font-mono text-[var(--ink-muted)] select-none flex-shrink-0">
          <div className="flex items-center gap-3">
            {loading ? (
              <span className="flex items-center gap-1.5">
                <div className="w-3 h-3 border border-[var(--action)] border-t-transparent rounded-full animate-spin" />
                Menjalankan…
              </span>
            ) : result ? (
              <>
                <span className="flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  {result.total_rows.toLocaleString("id-ID")} baris
                </span>
                <span className="text-[var(--rule-strong)]">|</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {result.execution_time_ms} ms
                </span>
                {result.scanned_bytes_estimate && (
                  <>
                    <span className="text-[var(--rule-strong)]">|</span>
                    <span>
                      ~{(result.scanned_bytes_estimate / 1024).toFixed(1)} KB dipindai
                    </span>
                  </>
                )}
              </>
            ) : (
              <span>Tekan Ctrl+Enter untuk menjalankan</span>
            )}
          </div>

          {result && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                id="export-result-btn"
                className="flex items-center gap-1 text-[var(--ink)] hover:text-[var(--action)] transition-colors"
              >
                <Download className="w-3 h-3" />
                <span>Unduh</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] shadow-lg z-50 py-1 min-w-[100px]">
                  {["csv", "tsv", "json"].map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => handleExportResult(fmt)}
                      className="w-full text-left px-3 h-[26px] text-[11px] font-mono hover:bg-[var(--surface-sunk)] text-[var(--ink)]"
                    >
                      .{fmt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Results grid */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {result ? (
            <DataGrid
              columns={gridColumns}
              rows={result.rows}
              totalRows={result.total_rows}
              editable={false}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-[12px] text-[var(--ink-muted)]">
              {loading ? "Memproses kueri…" : "Hasil kueri akan muncul di sini"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
