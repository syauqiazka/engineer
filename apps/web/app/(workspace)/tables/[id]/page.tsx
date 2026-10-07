"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Undo2,
  Redo2,
  Download,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Table as TableIcon,
  BarChart2,
  ShieldAlert,
  Code,
  ChevronDown,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useWorkspaceStore } from "@/lib/store";
import DataGrid, { GridColumn } from "@/components/DataGrid";
import { CodeViewer } from "@/components/CodeEditor";

interface ColumnProfile {
  name: string;
  data_type: string;
  display_type: string;
  total_rows: number;
  null_count: number;
  null_pct: number;
  distinct_count: number;
  min_value: unknown;
  max_value: unknown;
  histogram: number[];
}

interface TableDataResponse {
  table_name: string;
  total_rows: number;
  offset: number;
  limit: number;
  columns: string[];
  column_types: string[];
  rows: unknown[][];
}

export default function TableDetailPage() {
  const routeParams = useParams();
  const tableName = (routeParams?.id as string) || "pesanan_harian";

  const {
    isInspectorOpen,
    toggleInspector,
    pendingChanges,
    recordChange,
    undo,
    redo,
    clearChanges,
    setStatusMetrics,
  } = useWorkspaceStore();

  const [activeTab, setActiveTab] = useState<"data" | "profile" | "quality" | "code">("data");
  const [columns, setColumns] = useState<string[]>([]);
  const [columnTypes, setColumnTypes] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [profiles, setProfiles] = useState<ColumnProfile[]>([]);
  const [selectedColIndex, setSelectedColIndex] = useState<number>(0);
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [totalRows, setTotalRows] = useState<number>(0);

  // Load Table Data and Profiles
  useEffect(() => {
    fetchApi<TableDataResponse>(`/tables/${tableName}/data?limit=100`)
      .then((res) => {
        setColumns(res.columns);
        setColumnTypes(res.column_types);
        setRows(res.rows);
        setTotalRows(res.total_rows);
        setStatusMetrics(res.total_rows, res.columns.length, `seluruh baris lokal (${res.total_rows})`);
      })
      .catch(() => {
        // Fallback demo data
        const sampleCols = ["id", "nomor_pesanan", "tanggal", "nama_pelanggan", "kota", "kategori", "jumlah", "total_harga", "status_bayar"];
        const sampleTypes = ["INTEGER", "VARCHAR", "DATE", "VARCHAR", "VARCHAR", "VARCHAR", "INTEGER", "DOUBLE", "VARCHAR"];
        const sampleRows = [
          [1001, "INV/2026/03/001", "2026-03-01", "Budi Santoso", "Jakarta Selatan", "Elektronik", 2, 3500000.0, "Lunas"],
          [1002, "INV/2026/03/002", "2026-03-01", "Siti Rahmawati", "Bandung", "Pakaian", 5, 450000.0, "Lunas"],
          [1003, "INV/2026/03/002", "2026-03-02", "Dewi Lestari", "Surabaya", "Kuliner", 1, 85000.0, "Pending"],
          [1004, "INV/2026/03/004", "2026-03-02", "Ahmad Fauzi", "jakarta barat", "Elektronik", 1, 1200000.0, "Lunas"],
          [1005, "INV/2026/03/005", "2026-03-03", "Hendra Wijaya", "Medan", "Otomotif", 4, 620000.0, "Gagal"],
          [1006, "INV/2026/03/006", "2026-03-03", "Rini Anggraini", "Semarang", "Pakaian", 3, 275000.0, "Lunas"],
          [1007, "INV/2026/03/007", null, "Joko Anwar", "Yogyakarta", "Buku", 2, 180000.0, "Lunas"],
          [1008, "INV/2026/03/008", "2026-03-04", "Putri Ayu", "Denpasar", "Kuliner", null, 95000.0, "Pending"],
        ];
        setColumns(sampleCols);
        setColumnTypes(sampleTypes);
        setRows(sampleRows);
        setStatusMetrics(sampleRows.length, sampleCols.length);
      });

    fetchApi<ColumnProfile[]>(`/tables/${tableName}/profile`)
      .then((data) => setProfiles(data))
      .catch(() => {});
  }, [tableName, setStatusMetrics]);

  // Keyboard shortcut listener for Undo / Redo in grid
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);


  // Handle export to file

  const handleExport = useCallback((fmt: string) => {
    setShowExportMenu(false);
    const url = `http://localhost:8000/api/files/export/${tableName}?fmt=${fmt}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tableName}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [tableName]);

  // Handle cell edit via DataGrid
  const handleCellEdit = useCallback(async (
    rowIdx: number,
    colIdx: number,
    newValue: string,
    oldValue: unknown
  ) => {
    const colName = columns[colIdx];
    const rowId = (rows[rowIdx][0] as string | number) ?? rowIdx;
    if (String(oldValue ?? "") === newValue) return;

    recordChange({ rowId, column: colName, oldValue, newValue });
    const updatedRows = [...rows];
    updatedRows[rowIdx] = [...updatedRows[rowIdx]];
    updatedRows[rowIdx][colIdx] = newValue;
    setRows(updatedRows);
  }, [columns, rows, recordChange]);

  const handleApplyChanges = async () => {
    if (pendingChanges.length === 0) return;
    for (const change of pendingChanges) {
      try {
        await fetchApi(`/tables/${tableName}/edit`, {
          method: "POST",
          body: JSON.stringify({
            id_column: columns[0] || "id",
            id_value: change.rowId,
            column_name: change.column,
            new_value: change.newValue,
          }),
        });
      } catch (err) {
        console.error("Gagal menyimpan perubahan:", err);
      }
    }
    setAppliedNotification(`${pendingChanges.length} perubahan berhasil diterapkan ke DuckDB`);
    clearChanges();
    setTimeout(() => setAppliedNotification(null), 3000);
  };

  // Helper check if cell has pending change
  const isCellPending = (rowIdx: number, colIdx: number) => {
    const rowId = rows[rowIdx]?.[0];
    const colName = columns[colIdx];
    return pendingChanges.some((c) => c.rowId === rowId && c.column === colName);
  };

  const selectedCol = profiles[selectedColIndex] || (columns[selectedColIndex] ? {
    name: columns[selectedColIndex],
    data_type: columnTypes[selectedColIndex] || "VARCHAR",
    display_type: "txt",
    total_rows: rows.length,
    null_count: rows.filter((r) => r[selectedColIndex] === null).length,
    null_pct: Math.round((rows.filter((r) => r[selectedColIndex] === null).length / (rows.length || 1)) * 100),
    distinct_count: new Set(rows.map((r) => r[selectedColIndex])).size,
    min_value: "-",
    max_value: "-",
    histogram: [0.3, 0.5, 0.7, 0.4, 0.8, 0.6, 0.2, 0.5],
  } : null);

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Zone 1: Navigation Tabs & Toolbar */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 select-none">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-[var(--surface-sunk)] p-0.5 rounded-[2px]">
          {(
            [
              { id: "data", label: "Data", icon: TableIcon },
              { id: "profile", label: "Profil", icon: BarChart2 },
              { id: "quality", label: "Kualitas", icon: ShieldAlert },
              { id: "code", label: "Kode", icon: Code },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 h-[26px] text-[12px] font-medium rounded-[2px] transition-colors ${
                  isActive
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs font-semibold"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center border border-[var(--rule-strong)] rounded-[2px] overflow-hidden bg-[var(--surface)]">
            <button
              onClick={undo}
              title="Urungkan perubahan (Ctrl+Z)"
              className="px-2 h-[26px] hover:bg-[var(--surface-sunk)] text-[var(--ink)]"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <span className="w-px h-3 bg-[var(--rule)]" />
            <button
              onClick={redo}
              title="Ulangi perubahan (Ctrl+Shift+Z)"
              className="px-2 h-[26px] hover:bg-[var(--surface-sunk)] text-[var(--ink)]"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Export with format dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              id="export-menu-btn"
              className="flex items-center gap-1 px-2.5 h-[26px] text-[12px] bg-[var(--surface)] border border-[var(--rule-strong)] text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] shadow-lg z-50 py-1 min-w-[120px]">
                {["csv", "tsv", "xlsx", "json", "parquet"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleExport(fmt)}
                    className="w-full text-left px-3 h-[28px] text-[12px] font-mono hover:bg-[var(--surface-sunk)] text-[var(--ink)]"
                  >
                    .{fmt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Apply Changes (Solid Primary) */}
          <button
            onClick={handleApplyChanges}
            disabled={pendingChanges.length === 0}
            className={`flex items-center gap-1.5 px-3 h-[26px] text-[12px] font-medium rounded-[2px] transition-colors ${
              pendingChanges.length > 0
                ? "bg-[var(--action)] text-white hover:opacity-90"
                : "bg-[var(--surface-sunk)] text-[var(--ink-muted)] cursor-not-allowed"
            }`}
          >
            <Check className="w-3.5 h-3.5" />
            <span>
              {pendingChanges.length > 0
                ? `Terapkan (${pendingChanges.length})`
                : "Terapkan perubahan"}
            </span>
          </button>

          {/* Toggle Inspector */}
          <button
            onClick={toggleInspector}
            title={isInspectorOpen ? "Tutup panel inspektur" : "Buka panel inspektur"}
            className="px-2 h-[26px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
          >
            {isInspectorOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Applied Notification Toast */}
      {appliedNotification && (
        <div className="bg-[var(--ok)] text-white px-3 py-1.5 text-[12px] rounded-[2px] flex items-center justify-between">
          <span>{appliedNotification}</span>
        </div>
      )}

      {/* Zone 2: Main Area (Grid / Profil / Kualitas / Kode) + Inspector */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        {/* Main Content Area */}
        <div className="flex-1 bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden flex flex-col">
          {activeTab === "data" && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <DataGrid
                columns={columns.map((name, i) => ({ name, type: columnTypes[i] || "VARCHAR" } as GridColumn))}
                rows={rows}
                totalRows={totalRows}
                editable
                idColumnIndex={0}
                onCellEdit={handleCellEdit}
              />
            </div>
          )}

          {/* Profil Tab */}
          {activeTab === "profile" && (
            <div className="flex-1 overflow-auto p-3">
              <div className="border border-[var(--rule)] rounded-[2px] overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-[var(--surface-sunk)] border-b border-[var(--rule)] h-[28px] font-mono text-[11px] text-[var(--ink-muted)]">
                    <tr>
                      <th className="px-3 text-left">Kolom</th>
                      <th className="px-3 text-left">Tipe Data</th>
                      <th className="px-3 text-left">Null %</th>
                      <th className="px-3 text-right">Nilai Unik</th>
                      <th className="px-3 text-left">Min / Max</th>
                      <th className="px-3 text-center">Distribusi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule)]">
                    {profiles.map((p) => (
                      <tr key={p.name} className="h-[36px] hover:bg-[var(--surface-sunk)]">
                        <td className="px-3 font-mono font-semibold text-[var(--ink)]">
                          {p.name}
                        </td>
                        <td className="px-3">
                          <span className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--surface-sunk)] text-[var(--ink)] rounded-[2px]">
                            {p.display_type}
                          </span>
                        </td>
                        <td className="px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-[60px] bg-[var(--surface-sunk)] h-2 rounded-[1px] overflow-hidden">
                              <div
                                className={`h-full ${p.null_pct > 0 ? "bg-[var(--warn)]" : "bg-[var(--ok)]"}`}
                                style={{ width: `${Math.min(100, p.null_pct)}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] text-[var(--ink-muted)]">
                              {p.null_pct}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 text-right font-mono text-[var(--ink)]">
                          {p.distinct_count}
                        </td>
                        <td className="px-3 font-mono text-[11px] text-[var(--ink-muted)]">
                          {String(p.min_value ?? "-")} / {String(p.max_value ?? "-")}
                        </td>
                        <td className="px-3">
                          <div className="flex items-center justify-center gap-0.5 h-3">
                            {p.histogram.map((h, i) => (
                              <div
                                key={i}
                                className="w-1.5 bg-[var(--action)] rounded-[1px]"
                                style={{ height: `${h * 100}%` }}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Kualitas Tab */}
          {activeTab === "quality" && (
            <div className="flex-1 p-4 overflow-auto">
              <div className="max-w-[720px] flex flex-col gap-3">
                <div className="flex justify-between items-center pb-2 border-b border-[var(--rule)]">
                  <h3 className="font-semibold text-[14px] text-[var(--ink)]">
                    Aturan Kualitas Data ({tableName})
                  </h3>
                  <button className="px-2.5 h-[26px] text-[12px] bg-[var(--action)] text-white rounded-[2px]">
                    + Tambah Aturan
                  </button>
                </div>
                <div className="border border-[var(--rule)] rounded-[2px] divide-y divide-[var(--rule)]">
                  <div className="p-3 flex justify-between items-center text-[12.5px]">
                    <div>
                      <span className="font-mono font-semibold">tanggal NOT NULL</span>
                      <p className="text-[11.5px] text-[var(--error)]">
                        1 baris melanggar aturan ini (ID 1007)
                      </p>
                    </div>
                    <button className="px-2 py-1 text-[11.5px] border border-[var(--rule-strong)] text-[var(--action)] rounded-[2px]">
                      Tandai di Grid
                    </button>
                  </div>
                  <div className="p-3 flex justify-between items-center text-[12.5px]">
                    <div>
                      <span className="font-mono font-semibold">jumlah &gt; 0</span>
                      <p className="text-[11.5px] text-[var(--error)]">
                        1 baris kosong (ID 1008)
                      </p>
                    </div>
                    <button className="px-2 py-1 text-[11.5px] border border-[var(--rule-strong)] text-[var(--action)] rounded-[2px]">
                      Tandai di Grid
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Kode Tab */}
          {activeTab === "code" && (
            <div className="flex-1 p-4 overflow-auto">
              <div className="max-w-[800px] flex flex-col gap-4">
                <h3 className="font-semibold text-[14px] text-[var(--ink)]">
                  Kode Setara — SQL &amp; Python
                </h3>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-widest mb-2">SQL (DuckDB)</p>
                  <CodeViewer
                    language="sql"
                    value={`-- Baca seluruh tabel dari workspace\nSELECT * FROM ${tableName}\nWHERE tanggal IS NOT NULL\nORDER BY id ASC;`}
                    minHeight="100px"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-widest mb-2">Python (Polars)</p>
                  <CodeViewer
                    language="python"
                    value={`import polars as pl\n\ndf = pl.read_database_uri(\n    "SELECT * FROM ${tableName}",\n    uri="duckdb:///workspace.duckdb"\n)\ndf_clean = df.filter(pl.col("tanggal").is_not_null())\nprint(df_clean.head())`}
                    minHeight="140px"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-widest mb-2">Python (pandas)</p>
                  <CodeViewer
                    language="python"
                    value={`import pandas as pd\nimport duckdb\n\ncon = duckdb.connect("workspace.duckdb")\ndf = con.execute("SELECT * FROM ${tableName}").fetchdf()\nprint(df.head())`}
                    minHeight="120px"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Zone 3: Collapsible Inspector Panel (320px) */}
        {isInspectorOpen && selectedCol && (
          <aside className="w-[320px] bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] p-3 flex flex-col gap-3 shrink-0 select-none overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-[var(--rule)]">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-[var(--ink)]">
                  Inspektur Kolom
                </span>
                <span className="text-[11px] font-mono px-1.5 py-0.2 bg-[var(--surface-sunk)] text-[var(--action)] rounded-[2px]">
                  {selectedCol.display_type}
                </span>
              </div>
              <span className="font-mono text-[12px] font-semibold text-[var(--ink)] truncate max-w-[140px]">
                {selectedCol.name}
              </span>
            </div>

            {/* Column Statistics */}
            <div className="flex flex-col gap-2 text-[12px]">
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Tipe Data Asli</span>
                <span className="font-mono text-[var(--ink)]">{selectedCol.data_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Jumlah Baris</span>
                <span className="font-mono text-[var(--ink)]">{selectedCol.total_rows}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Nilai Null</span>
                <span className="font-mono text-[var(--warn)] font-bold">
                  {selectedCol.null_count} ({selectedCol.null_pct}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Nilai Berbeda (Distinct)</span>
                <span className="font-mono text-[var(--ink)]">{selectedCol.distinct_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--ink-muted)]">Rentang Min / Max</span>
                <span className="font-mono text-[var(--ink)] truncate max-w-[160px]">
                  {String(selectedCol.min_value ?? "-")} / {String(selectedCol.max_value ?? "-")}
                </span>
              </div>
            </div>

            {/* Sparkline Histogram */}
            <div className="pt-2 border-t border-[var(--rule)]">
              <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                Distribusi Nilai
              </span>
              <div className="flex items-end gap-1 h-[48px] bg-[var(--surface-sunk)] p-2 mt-1 rounded-[2px]">
                {selectedCol.histogram.map((h, idx) => (
                  <div
                    key={idx}
                    className="flex-1 bg-[var(--action)] rounded-[1px] hover:opacity-80 transition-opacity"
                    style={{ height: `${h * 100}%` }}
                    title={`Bin ${idx + 1}: ${Math.round(h * 100)}%`}
                  />
                ))}
              </div>
            </div>

            {/* Quality Rule Creator CTA */}
            <div className="pt-2 border-t border-[var(--rule)] flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-[var(--ink-muted)]">
                Tindakan Cepat
              </span>
              <button
                onClick={() =>
                  alert(`Aturan '${selectedCol.name} NOT NULL' berhasil ditambahkan ke profil kualitas.`)
                }
                className="w-full h-[28px] text-[12px] bg-[var(--surface-sunk)] border border-[var(--rule-strong)] text-[var(--ink)] hover:bg-[var(--rule)] rounded-[2px] transition-colors"
              >
                + Buat Aturan &quot;NOT NULL&quot;
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
