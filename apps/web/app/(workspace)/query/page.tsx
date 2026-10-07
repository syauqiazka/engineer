"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Play, Download, Terminal, AlertCircle } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface QueryResult {
  columns: string[];
  column_types: string[];
  rows: unknown[][];
  total_rows: number;
  execution_time_ms: number;
  scanned_bytes_estimate: number | null;
}

export default function QueryPage() {
  const [sql, setSql] = useState<string>(
    "SELECT \n  kota,\n  kategori,\n  COUNT(*) as jumlah_pesanan,\n  SUM(total_harga) as omset_rp\nFROM pesanan_harian\nGROUP BY kota, kategori\nORDER BY omset_rp DESC;"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);

  const handleRunQuery = useCallback(async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const data = await fetchApi<QueryResult>("/query", {
        method: "POST",
        body: JSON.stringify({ sql }),
      });
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Gagal mengeksekusi kueri SQL");
    } finally {
      setLoading(false);
    }
  }, [sql]);

  // Keyboard shortcut Ctrl+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunQuery();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRunQuery]);

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header Context */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 select-none">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[var(--action)]" />
          <h1 className="text-[14px] font-semibold text-[var(--ink)]">
            Editor Kueri SQL
          </h1>
          <span className="text-[12px] text-[var(--ink-muted)]">
            (Jalankan di: <span className="font-mono text-[var(--ink)]">workspace (DuckDB)</span>)
          </span>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunQuery}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 h-[28px] text-[12px] font-semibold bg-[var(--action)] text-white hover:opacity-90 rounded-[2px] transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{loading ? "Menjalankan..." : "Jalankan kueri"}</span>
            <kbd className="ml-1 text-[10px] font-mono opacity-80">Ctrl+Enter</kbd>
          </button>
        </div>
      </div>

      {/* SQL Editor Area */}
      <div className="h-[180px] bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] p-2 flex flex-col">
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          placeholder="Tulis kueri SQL DuckDB di sini..."
          className="w-full h-full bg-transparent font-mono text-[13px] text-[var(--ink)] outline-none resize-none leading-relaxed"
          spellCheck={false}
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-[var(--error-wash)] border border-[var(--error)] p-2.5 rounded-[2px] flex items-center gap-2 text-[12px] text-[var(--error)]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Query Results Zone */}
      <div className="flex-1 bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden flex flex-col min-h-0">
        {/* Results Toolbar */}
        <div className="px-3 h-[28px] bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between text-[11px] font-mono text-[var(--ink-muted)] select-none">
          <div className="flex items-center gap-4">
            <span>
              {result ? `${result.total_rows} baris dihasilkan` : "Belum ada hasil"}
            </span>
            {result && (
              <>
                <span>|</span>
                <span>Waktu: {result.execution_time_ms} ms</span>
                <span>|</span>
                <span>Perkiraan pindaian: ± {result.scanned_bytes_estimate || 256} byte</span>
              </>
            )}
          </div>
          {result && (
            <button
              onClick={() => alert("Mengunduh hasil kueri ke CSV...")}
              className="flex items-center gap-1 text-[var(--ink)] hover:text-[var(--action)]"
            >
              <Download className="w-3 h-3" />
              <span>Unduh CSV</span>
            </button>
          )}
        </div>

        {/* Results Grid */}
        <div className="flex-1 overflow-auto">
          {result ? (
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 bg-[var(--surface-sunk)] border-b border-[var(--rule)] z-10">
                <tr className="h-[26px]">
                  <th className="w-[44px] px-2 text-center font-mono text-[11px] text-[var(--ink-muted)] border-r border-[var(--rule)]">
                    #
                  </th>
                  {result.columns.map((col, idx) => (
                    <th
                      key={col}
                      className="px-3 text-left font-mono font-medium text-[var(--ink)] border-r border-[var(--rule)]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{col}</span>
                        <span className="text-[10px] text-[var(--ink-muted)] font-normal">
                          {result.column_types[idx]?.toLowerCase() || "any"}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="h-[26px] border-b border-[var(--rule)] hover:bg-[color-mix(in_srgb,var(--action)_6%,var(--surface))]"
                  >
                    <td className="w-[44px] px-2 text-center font-mono text-[11px] text-[var(--ink-muted)] bg-[var(--surface-sunk)] border-r border-[var(--rule)]">
                      {rIdx + 1}
                    </td>
                    {row.map((val, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-3 border-r border-[var(--rule)] font-mono ${
                          typeof val === "number" ? "text-right" : "text-left"
                        }`}
                      >
                        {val === null ? (
                          <span className="italic text-[var(--ink-muted)]">NULL</span>
                        ) : (
                          String(val)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-[12px] text-[var(--ink-muted)]">
              Tekan &quot;Jalankan kueri&quot; atau Ctrl+Enter untuk mengeksekusi SQL
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
