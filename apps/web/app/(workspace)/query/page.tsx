"use client";

import React, { useState, useCallback } from "react";
import {
  Play,
  Download,
  Terminal,
  AlertCircle,
  Clock,
  Database,
  ChevronDown,
  Code2,
  FileCode,
  Sparkles,
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

interface PythonExecutionResponse {
  success: boolean;
  stdout: string;
  stderr: string;
  duration_ms: number;
  output_preview: {
    columns: string[];
    types: string[];
    rows: Record<string, unknown>[];
  } | null;
  tables_written: string[];
  error_message: string | null;
}

const DEFAULT_SQL = `SELECT 
  kota,
  kategori,
  COUNT(*) AS jumlah_pesanan,
  SUM(total_harga) AS omset_rp
FROM pesanan_harian
GROUP BY kota, kategori
ORDER BY omset_rp DESC;`;

const DEFAULT_PYTHON = `import polars as pl

# 1. Baca tabel langsung dari DuckDB workspace via cache parquet (bebas lock)
df = ctx.read_table("pesanan_harian", engine="polars")
ctx.log(f"Berhasil membaca {len(df)} baris data!")

# 2. Agregasi cepat dengan engine Polars
agg = df.group_by(["kota", "kategori"]).agg(
    pl.len().alias("jumlah_pesanan"),
    pl.col("total_harga").sum().alias("omset_rp")
).sort("omset_rp", descending=True)

ctx.log("Agregasi selesai. Menampilkan hasil:")
ctx.display(agg)
`;

const PYTHON_TEMPLATES = [
  {
    name: "Agregasi Omzet (Polars)",
    code: DEFAULT_PYTHON,
  },
  {
    name: "Filter & Simpan Tabel Baru (Polars)",
    code: `import polars as pl

# Baca pesanan
df = ctx.read_table("pesanan_harian", engine="polars")

# Filter pesanan yang belum lunas
pending = df.filter(pl.col("status_bayar") != "Lunas")
ctx.log(f"Ditemukan {len(pending)} pesanan yang butuh tindak lanjut.")

# Tulis tabel baru ke DuckDB workspace
ctx.write_table("pesanan_belum_lunas", pending)
ctx.log("Tabel 'pesanan_belum_lunas' berhasil dibuat di workspace!")

ctx.display(pending)
`,
  },
  {
    name: "Analisis Statistik Cepat (pandas)",
    code: `import pandas as pd

# Baca data ke DataFrame pandas
df = ctx.read_table("pesanan_harian", engine="pandas")

ctx.log("--- Ringkasan Statistik Kolom total_harga ---")
ctx.log(df["total_harga"].describe().to_string())

# Tambah kolom rasio nilai
avg_val = df["total_harga"].mean()
df["rasio_ke_rata2"] = (df["total_harga"] / avg_val).round(2)

ctx.display(df)
`,
  },
];

export default function QueryPage() {
  const [activeTab, setActiveTab] = useState<"sql" | "python">("sql");
  const [sql, setSql] = useState<string>(DEFAULT_SQL);
  const [pythonCode, setPythonCode] = useState<string>(DEFAULT_PYTHON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Results
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
  const [pyResult, setPyResult] = useState<PythonExecutionResponse | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleRunSQL = useCallback(
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
        setSqlResult(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Gagal mengeksekusi kueri SQL");
      } finally {
        setLoading(false);
      }
    },
    [sql]
  );

  const handleRunPython = useCallback(
    async (codeToRun?: string) => {
      const code = codeToRun ?? pythonCode;
      if (!code.trim()) return;
      setLoading(true);
      setError(null);

      try {
        const data = await fetchApi<PythonExecutionResponse>("/runner/python", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setPyResult(data);
        if (!data.success && data.error_message) {
          setError(data.error_message);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || "Gagal menjalankan skrip Python");
      } finally {
        setLoading(false);
      }
    },
    [pythonCode]
  );

  const handleRunCurrent = () => {
    if (activeTab === "sql") {
      handleRunSQL();
    } else {
      handleRunPython();
    }
  };

  const handleExportResult = useCallback(
    (fmt: string) => {
      let columns: string[] = [];
      let rows: unknown[][] = [];

      if (activeTab === "sql" && sqlResult) {
        columns = sqlResult.columns;
        rows = sqlResult.rows;
      } else if (activeTab === "python" && pyResult?.output_preview) {
        columns = pyResult.output_preview.columns;
        rows = pyResult.output_preview.rows.map((r) => columns.map((c) => r[c]));
      } else {
        return;
      }

      setShowExportMenu(false);
      const sep = fmt === "tsv" ? "\t" : ",";
      const header = columns.join(sep);
      const body = rows
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
        const records = rows.map((row) =>
          Object.fromEntries(columns.map((c, i) => [c, row[i]]))
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
    [activeTab, sqlResult, pyResult]
  );

  // Ubah preview python ke format GridColumn jika ada
  const pythonGridData = React.useMemo(() => {
    if (!pyResult?.output_preview) return null;
    const { columns, types, rows } = pyResult.output_preview;
    const gridCols: GridColumn[] = columns.map((c, i) => ({
      name: c,
      type: types[i] || "VARCHAR",
    }));
    const gridRows = rows.map((r) => columns.map((c) => r[c]));
    return { columns: gridCols, rows: gridRows, total: rows.length };
  }, [pyResult]);

  const sqlGridColumns: GridColumn[] = React.useMemo(
    () =>
      sqlResult
        ? sqlResult.columns.map((col, idx) => ({
            name: col,
            type: sqlResult.column_types[idx] ?? "VARCHAR",
          }))
        : [],
    [sqlResult]
  );

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top Bar with Language Tabs & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] pb-2">
        <div className="flex items-center gap-1 bg-[var(--surface-sunk)] p-0.5 rounded-[3px] border border-[var(--rule)]">
          <button
            onClick={() => setActiveTab("sql")}
            className={`flex items-center gap-1.5 px-3 py-1 text-[12px] font-semibold rounded-[2px] transition-colors ${
              activeTab === "sql"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Database className="w-3.5 h-3.5 text-[var(--action)]" />
            SQL (DuckDB)
          </button>
          <button
            onClick={() => setActiveTab("python")}
            className={`flex items-center gap-1.5 px-3 py-1 text-[12px] font-semibold rounded-[2px] transition-colors ${
              activeTab === "python"
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
                : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-[var(--success)]" />
            Python (Polars Sandbox)
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {activeTab === "python" && (
            <div className="relative group">
              <button className="flex items-center gap-1 px-2.5 py-1 text-[12px] bg-[var(--surface)] border border-[var(--rule)] hover:bg-[var(--surface-sunk)] text-[var(--ink)] rounded-[2px]">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>Contoh Kode</span>
                <ChevronDown className="w-3 h-3 text-[var(--ink-muted)]" />
              </button>
              <div className="absolute right-0 top-full mt-1 w-56 bg-[var(--surface)] border border-[var(--rule)] rounded-[3px] shadow-lg hidden group-hover:block z-20 py-1">
                {PYTHON_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    onClick={() => setPythonCode(tmpl.code)}
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-sunk)] text-[var(--ink)] block"
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Export button */}
          {((activeTab === "sql" && sqlResult) || (activeTab === "python" && pyResult?.output_preview)) && (
            <div className="relative">
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                className="flex items-center gap-1 px-2.5 py-1 text-[12px] bg-[var(--surface)] border border-[var(--rule)] hover:bg-[var(--surface-sunk)] text-[var(--ink)] rounded-[2px]"
              >
                <Download className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
                <span>Ekspor</span>
                <ChevronDown className="w-3 h-3 text-[var(--ink-muted)]" />
              </button>
              {showExportMenu && (
                <div className="absolute right-0 top-full mt-1 w-32 bg-[var(--surface)] border border-[var(--rule)] rounded-[3px] shadow-lg z-20 py-1">
                  <button
                    onClick={() => handleExportResult("csv")}
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-sunk)] text-[var(--ink)]"
                  >
                    CSV (.csv)
                  </button>
                  <button
                    onClick={() => handleExportResult("tsv")}
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-sunk)] text-[var(--ink)]"
                  >
                    TSV (.tsv)
                  </button>
                  <button
                    onClick={() => handleExportResult("json")}
                    className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-sunk)] text-[var(--ink)]"
                  >
                    JSON (.json)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Run button */}
          <button
            onClick={handleRunCurrent}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1 text-[12px] font-semibold bg-[var(--action)] text-white hover:bg-[var(--action-hover)] disabled:opacity-50 rounded-[2px] transition-colors"
          >
            <Play className={`w-3.5 h-3.5 fill-white ${loading ? "animate-spin" : ""}`} />
            {loading ? "Menjalankan..." : "Jalankan (Ctrl+Enter)"}
          </button>
        </div>
      </div>

      {/* Editor Frame */}
      <div className="border border-[var(--rule)] rounded-[3px] overflow-hidden bg-[var(--surface-sunk)]">
        {activeTab === "sql" ? (
          <CodeEditor
            value={sql}
            onChange={setSql}
            language="sql"
            height="180px"
            onRun={handleRunSQL}
            placeholder="Tulis kueri SQL di sini..."
          />
        ) : (
          <CodeEditor
            value={pythonCode}
            onChange={setPythonCode}
            language="python"
            height="210px"
            onRun={handleRunPython}
            placeholder="Tulis skrip Python dengan ctx.read_table('tabel'), Polars/pandas di sini..."
          />
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-2.5 bg-[var(--error-wash)] border border-[var(--error)] text-[var(--error)] text-[12px] rounded-[3px] font-mono whitespace-pre-wrap">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Python Terminal Log Output (if present) */}
      {activeTab === "python" && pyResult && (
        <div className="bg-[#0b0d13] border border-[var(--rule)] rounded-[3px] p-2.5 font-mono text-[11px] text-[#cbd5e1] flex flex-col gap-1 max-h-36 overflow-y-auto">
          <div className="flex items-center justify-between text-[10px] text-[#64748b] border-b border-[#1e293b] pb-1">
            <span className="flex items-center gap-1">
              <Terminal className="w-3 h-3" /> Console Output (Sandbox Subprocess)
            </span>
            <span>Durasi: {pyResult.duration_ms} ms</span>
          </div>
          {pyResult.stdout ? (
            <pre className="whitespace-pre-wrap">{pyResult.stdout}</pre>
          ) : (
            <span className="text-[#64748b] italic">Tidak ada output stdout.</span>
          )}
          {pyResult.tables_written.length > 0 && (
            <div className="text-[var(--success)] text-[11px] mt-1">
              ✓ Tabel ditulis ke workspace: {pyResult.tables_written.join(", ")}
            </div>
          )}
        </div>
      )}

      {/* Result Metrics & Data Grid */}
      <div className="flex-1 flex flex-col min-h-0 border border-[var(--rule)] rounded-[3px] overflow-hidden bg-[var(--surface)]">
        {/* Result Header Info */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--surface-sunk)] border-b border-[var(--rule)] text-[11px] text-[var(--ink-muted)]">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[var(--ink)]">Hasil Eksekusi</span>
            {activeTab === "sql" && sqlResult && (
              <>
                <span>{sqlResult.total_rows.toLocaleString()} baris</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {sqlResult.execution_time_ms} ms
                </span>
              </>
            )}
            {activeTab === "python" && pythonGridData && (
              <>
                <span>{pythonGridData.total} baris DataFrame</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {pyResult?.duration_ms} ms
                </span>
              </>
            )}
          </div>
        </div>

        {/* Grid Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === "sql" ? (
            sqlResult ? (
              <DataGrid
                columns={sqlGridColumns}
                rows={sqlResult.rows}
                totalRows={sqlResult.total_rows}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[var(--ink-muted)]">
                <Database className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-[13px]">Kueri SQL belum dijalankan.</p>
                <p className="text-[11px]">Tekan Ctrl+Enter atau tombol Jalankan untuk melihat data.</p>
              </div>
            )
          ) : pythonGridData ? (
            <DataGrid
              columns={pythonGridData.columns}
              rows={pythonGridData.rows}
              totalRows={pythonGridData.total}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[var(--ink-muted)]">
              <FileCode className="w-8 h-8 opacity-30 mb-2" />
              <p className="text-[13px]">Skrip Python belum dijalankan.</p>
              <p className="text-[11px]">
                Gunakan <code className="bg-[var(--surface-sunk)] px-1 py-0.5 rounded text-[var(--action)]">ctx.display(df)</code> untuk menampilkan DataFrame di grid ini.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
