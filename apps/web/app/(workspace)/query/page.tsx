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
  Zap,
  CheckCircle2,
  Layers,
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

interface SparkJobResult {
  id: string;
  name: string;
  language: string;
  status: string;
  duration_seconds: number;
  spark_app_id: string | null;
  logs: string[];
  output_summary: Record<string, unknown>;
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

const DEFAULT_PYSPARK = `from pyspark.sql import SparkSession
from pyspark.sql.functions import col, count, sum, avg

# Inisialisasi sesi Spark mandiri
spark = SparkSession.builder \\
    .appName("Workbench-PySpark-Job") \\
    .master("local[*]") \\
    .getOrCreate()

print("==> Membaca data dan menghitung agregasi terdistribusi...")
data = [
    ("Jabodetabek", "Elektronik", 15, 4500000.0),
    ("Bandung", "Pakaian", 42, 2100000.0),
    ("Surabaya", "Makanan", 80, 1600000.0),
    ("Jabodetabek", "Pakaian", 33, 1980000.0),
]
df = spark.createDataFrame(data, ["wilayah", "kategori", "jumlah_unit", "total_nilai"])

hasil = df.groupBy("wilayah").agg(
    sum("total_nilai").alias("omset_total"),
    avg("jumlah_unit").alias("rata_rata_unit")
).orderBy(col("omset_total").desc())

hasil.show()
spark.stop()
`;

const DEFAULT_SCALA = `package com.engineer.workbench

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions._

object DataPipelineJob {
  def main(args: Array[String]): Unit = {
    val spark = SparkSession.builder()
      .appName("Workbench-Scala-Pipeline")
      .master("local[*]")
      .getOrCreate()

    import spark.implicits._

    val transactions = Seq(
      ("TRX-001", "Pelanggan-A", 125000.0, "Jakarta"),
      ("TRX-002", "Pelanggan-B", 450000.0, "Surabaya"),
    ).toDF("id_transaksi", "pelanggan", "nominal", "kota")

    transactions
      .groupBy("kota")
      .agg(count("id_transaksi").as("jumlah_trx"), sum("nominal").as("total_belanja"))
      .show()

    spark.stop()
  }
}
`;

const DEFAULT_JAVA = `package com.engineer.workbench;

import org.apache.spark.sql.*;
import org.apache.spark.sql.types.*;
import java.util.*;

public class JavaDataProcessor {
    public static void main(String[] args) {
        SparkSession spark = SparkSession.builder()
                .appName("Workbench-Java-Spark")
                .master("local[*]")
                .getOrCreate();

        List<Row> rows = Arrays.asList(
                RowFactory.create("K-01", 120.5),
                RowFactory.create("K-02", 84.0)
        );
        StructType schema = new StructType(new StructField[]{
                new StructField("kategori", DataTypes.StringType, false, Metadata.empty()),
                new StructField("nilai", DataTypes.DoubleType, false, Metadata.empty())
        });

        spark.createDataFrame(rows, schema).groupBy("kategori").sum("nilai").show();
        spark.stop();
    }
}
`;

const PYTHON_TEMPLATES = [
  { name: "Agregasi Omzet (Polars)", code: DEFAULT_PYTHON },
  {
    name: "Filter & Simpan Tabel Baru (Polars)",
    code: `import polars as pl

df = ctx.read_table("pesanan_harian", engine="polars")
pending = df.filter(pl.col("status_bayar") != "Lunas")
ctx.log(f"Ditemukan {len(pending)} pesanan yang butuh tindak lanjut.")
ctx.write_table("pesanan_belum_lunas", pending)
ctx.display(pending)
`,
  },
  {
    name: "Analisis Statistik Cepat (pandas)",
    code: `import pandas as pd

df = ctx.read_table("pesanan_harian", engine="pandas")
ctx.log(df["total_harga"].describe().to_string())
df["rasio_ke_rata2"] = (df["total_harga"] / df["total_harga"].mean()).round(2)
ctx.display(df)
`,
  },
];

type ActiveTab = "sql" | "python" | "pyspark" | "scala" | "java";

export default function QueryPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("sql");
  const [sql, setSql] = useState<string>(DEFAULT_SQL);
  const [pythonCode, setPythonCode] = useState<string>(DEFAULT_PYTHON);
  const [pysparkCode, setPysparkCode] = useState<string>(DEFAULT_PYSPARK);
  const [scalaCode, setScalaCode] = useState<string>(DEFAULT_SCALA);
  const [javaCode, setJavaCode] = useState<string>(DEFAULT_JAVA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results
  const [sqlResult, setSqlResult] = useState<QueryResult | null>(null);
  const [pyResult, setPyResult] = useState<PythonExecutionResponse | null>(null);
  const [sparkResult, setSparkResult] = useState<SparkJobResult | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const isSparkTab = activeTab === "pyspark" || activeTab === "scala" || activeTab === "java";

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
        setError(err instanceof Error ? err.message : "Gagal mengeksekusi kueri SQL");
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
        if (!data.success && data.error_message) setError(data.error_message);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal menjalankan skrip Python");
      } finally {
        setLoading(false);
      }
    },
    [pythonCode]
  );

  const handleSubmitToSpark = useCallback(async () => {
    const langCodeMap: Record<string, string> = {
      pyspark: pysparkCode,
      scala: scalaCode,
      java: javaCode,
    };
    const langMap: Record<string, string> = {
      pyspark: "pyspark",
      scala: "scala",
      java: "java",
    };
    const code = langCodeMap[activeTab] || "";
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setSparkResult(null);
    try {
      const res = await fetch("http://localhost:8000/api/spark/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Editor ${activeTab.toUpperCase()} Job`,
          language: langMap[activeTab],
          code,
        }),
      });
      if (!res.ok) throw new Error("Gagal mengirim job ke Spark runner.");
      const data = await res.json();
      setSparkResult(data.job as SparkJobResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menghubungi Spark backend.");
    } finally {
      setLoading(false);
    }
  }, [activeTab, pysparkCode, scalaCode, javaCode]);

  const handleRunCurrent = () => {
    if (activeTab === "sql") handleRunSQL();
    else if (activeTab === "python") handleRunPython();
    else handleSubmitToSpark();
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
            .map((v) => (v === null ? "" : fmt === "json" ? v : `"${String(v).replace(/"/g, '""')}"`))
            .join(sep)
        )
        .join("\n");

      let content: string;
      let mimeType: string;
      let filename: string;

      if (fmt === "json") {
        const records = rows.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
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

  const getCurrentCode = () => {
    if (activeTab === "sql") return sql;
    if (activeTab === "python") return pythonCode;
    if (activeTab === "pyspark") return pysparkCode;
    if (activeTab === "scala") return scalaCode;
    if (activeTab === "java") return javaCode;
    return "";
  };

  const setCurrentCode = (code: string) => {
    if (activeTab === "sql") setSql(code);
    else if (activeTab === "python") setPythonCode(code);
    else if (activeTab === "pyspark") setPysparkCode(code);
    else if (activeTab === "scala") setScalaCode(code);
    else if (activeTab === "java") setJavaCode(code);
  };

  const editorLang: "sql" | "python" | "text" =
    activeTab === "scala" || activeTab === "java"
      ? "text"
      : activeTab === "pyspark"
      ? "python"
      : activeTab === "sql"
      ? "sql"
      : "python";

  const tabs: { id: ActiveTab; label: string; color: string; icon: React.ReactNode }[] = [
    { id: "sql", label: "SQL (DuckDB)", color: "var(--action)", icon: <Database className="w-3.5 h-3.5" /> },
    { id: "python", label: "Python (Polars)", color: "var(--success)", icon: <Code2 className="w-3.5 h-3.5" /> },
    { id: "pyspark", label: "PySpark", color: "#f97316", icon: <Zap className="w-3.5 h-3.5" /> },
    { id: "scala", label: "Scala (Spark)", color: "#dc2626", icon: <Layers className="w-3.5 h-3.5" /> },
    { id: "java", label: "Java (Spark)", color: "#7c3aed", icon: <FileCode className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Top Bar with Language Tabs & Action Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--rule)] pb-2">
        <div className="flex items-center gap-1 bg-[var(--surface-sunk)] p-0.5 rounded-[3px] border border-[var(--rule)] flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={activeTab === tab.id ? { color: tab.color } : undefined}
              className={`flex items-center gap-1.5 px-3 py-1 text-[12px] font-semibold rounded-[2px] transition-colors ${
                activeTab === tab.id
                  ? "bg-[var(--surface)] shadow-sm"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
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
              <div className="absolute right-0 top-full mt-1 w-60 bg-[var(--surface)] border border-[var(--rule)] rounded-[3px] shadow-lg hidden group-hover:block z-20 py-1">
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

          {/* Export button — only for SQL/Python */}
          {!isSparkTab &&
            ((activeTab === "sql" && sqlResult) ||
              (activeTab === "python" && pyResult?.output_preview)) && (
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
                    {["csv", "tsv", "json"].map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => handleExportResult(fmt)}
                        className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-[var(--surface-sunk)] text-[var(--ink)]"
                      >
                        {fmt.toUpperCase()} (.{fmt})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

          {/* Run / Send to Spark button */}
          <button
            onClick={handleRunCurrent}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1 text-[12px] font-semibold bg-[var(--action)] text-white hover:opacity-90 disabled:opacity-50 rounded-[2px] transition-colors"
          >
            {isSparkTab ? (
              <>
                <Zap className={`w-3.5 h-3.5 fill-white ${loading ? "animate-pulse" : ""}`} />
                {loading ? "Mengirim ke Spark..." : "Kirim ke Spark"}
              </>
            ) : (
              <>
                <Play className={`w-3.5 h-3.5 fill-white ${loading ? "animate-spin" : ""}`} />
                {loading ? "Menjalankan..." : "Jalankan (Ctrl+Enter)"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Spark badge info */}
      {isSparkTab && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--surface)] border border-[var(--rule)] rounded-[3px] text-[12px]">
          <Zap className="w-3.5 h-3.5 text-orange-500" />
          <span className="text-[var(--ink)]">
            Kode akan dikirim ke{" "}
            <strong>Spark Standalone Runner (JVM Worker)</strong>. Pastikan Spark Master aktif di{" "}
            <code className="font-mono text-[var(--action)]">spark://localhost:7077</code> atau mode lokal.
          </span>
        </div>
      )}

      {/* Editor Frame */}
      <div className="border border-[var(--rule)] rounded-[3px] overflow-hidden bg-[var(--surface-sunk)]">
        <CodeEditor
          key={activeTab}
          value={getCurrentCode()}
          onChange={setCurrentCode}
          language={editorLang}
          height={isSparkTab ? "240px" : activeTab === "python" ? "210px" : "180px"}
          onRun={handleRunCurrent}
          placeholder={`Tulis kode ${activeTab} di sini...`}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 p-2.5 bg-[var(--error-wash)] border border-[var(--error)] text-[var(--error)] text-[12px] rounded-[3px] font-mono whitespace-pre-wrap">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
        </div>
      )}

      {/* Python Terminal Log Output */}
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

      {/* Spark Job Execution Log */}
      {isSparkTab && sparkResult && (
        <div className="bg-[#0b0d13] border border-[var(--rule)] rounded-[3px] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1e293b] text-[11px]">
            <div className="flex items-center gap-2 font-mono text-[#94a3b8]">
              <Zap className="w-3 h-3 text-orange-400" />
              <span>Spark Job: {sparkResult.id}</span>
              <span>•</span>
              <span>{sparkResult.spark_app_id}</span>
              <span>•</span>
              <span>{sparkResult.duration_seconds}s</span>
            </div>
            <span
              className={`px-2 py-0.5 text-[10px] font-bold rounded-[2px] ${
                sparkResult.status === "success"
                  ? "bg-green-900/60 text-green-400"
                  : sparkResult.status === "failed"
                  ? "bg-red-900/60 text-red-400"
                  : sparkResult.status === "cancelled"
                  ? "bg-yellow-900/60 text-yellow-400"
                  : "bg-blue-900/60 text-blue-400"
              }`}
            >
              {sparkResult.status.toUpperCase()}
            </span>
          </div>
          <div className="p-3 font-mono text-[11px] text-[#cbd5e1] max-h-48 overflow-y-auto space-y-0.5">
            {sparkResult.logs.map((line, i) => (
              <div key={i} className={line.startsWith("+") ? "text-[#4ade80]" : line.includes("[SUCCESS]") ? "text-green-400" : line.includes("[STAGE") ? "text-orange-300" : "text-[#94a3b8]"}>
                {line}
              </div>
            ))}
          </div>
          {sparkResult.status === "success" && Object.keys(sparkResult.output_summary).length > 0 && (
            <div className="px-3 py-2 border-t border-[#1e293b] flex items-center gap-4 text-[11px] text-[#64748b]">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              {Object.entries(sparkResult.output_summary).map(([k, v]) => (
                <span key={k}>
                  <span className="text-[#94a3b8]">{k}:</span>{" "}
                  <span className="font-mono text-[#e2e8f0]">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result Area — SQL & Python only */}
      {!isSparkTab && (
        <div className="flex-1 flex flex-col min-h-0 border border-[var(--rule)] rounded-[3px] overflow-hidden bg-[var(--surface)]">
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

          <div className="flex-1 overflow-auto">
            {activeTab === "sql" ? (
              sqlResult ? (
                <DataGrid columns={sqlGridColumns} rows={sqlResult.rows} totalRows={sqlResult.total_rows} />
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[var(--ink-muted)]">
                  <Database className="w-8 h-8 opacity-30 mb-2" />
                  <p className="text-[13px]">Kueri SQL belum dijalankan.</p>
                  <p className="text-[11px]">Tekan Ctrl+Enter atau tombol Jalankan untuk melihat data.</p>
                </div>
              )
            ) : pythonGridData ? (
              <DataGrid columns={pythonGridData.columns} rows={pythonGridData.rows} totalRows={pythonGridData.total} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-[var(--ink-muted)]">
                <FileCode className="w-8 h-8 opacity-30 mb-2" />
                <p className="text-[13px]">Skrip Python belum dijalankan.</p>
                <p className="text-[11px]">
                  Gunakan{" "}
                  <code className="bg-[var(--surface-sunk)] px-1 py-0.5 rounded text-[var(--action)]">ctx.display(df)</code>{" "}
                  untuk menampilkan DataFrame di grid ini.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Spark empty state */}
      {isSparkTab && !sparkResult && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[var(--ink-muted)] border border-[var(--rule)] rounded-[3px] bg-[var(--surface)]">
          <Zap className="w-8 h-8 opacity-30 mb-2 text-orange-500" />
          <p className="text-[13px]">Job Spark belum dikirim.</p>
          <p className="text-[11px]">Tulis kode {activeTab.toUpperCase()} dan tekan <strong>Kirim ke Spark</strong>.</p>
        </div>
      )}
    </div>
  );
}
