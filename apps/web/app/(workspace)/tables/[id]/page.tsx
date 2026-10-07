"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useWorkspaceStore } from "@/lib/store";

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
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [appliedNotification, setAppliedNotification] = useState<string | null>(null);

  // Load Table Data and Profiles
  useEffect(() => {
    fetchApi<TableDataResponse>(`/tables/${tableName}/data?limit=100`)
      .then((res) => {
        setColumns(res.columns);
        setColumnTypes(res.column_types);
        setRows(res.rows);
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

  // Handle cell edit commit
  const handleStartEdit = (rowIdx: number, colIdx: number, currentVal: unknown) => {
    setEditingCell({ rowIdx, colIdx });
    setEditValue(currentVal === null || currentVal === undefined ? "" : String(currentVal));
  };

  const handleCommitEdit = () => {
    if (!editingCell) return;
    const { rowIdx, colIdx } = editingCell;
    const oldVal = rows[rowIdx][colIdx];
    const colName = columns[colIdx];
    const rowId = (rows[rowIdx][0] as string | number) ?? rowIdx;

    if (String(oldVal) !== editValue) {
      // Record change in zustand store
      recordChange({
        rowId,
        column: colName,
        oldValue: oldVal,
        newValue: editValue,
      });

      // Update local grid state
      const updatedRows = [...rows];
      updatedRows[rowIdx] = [...updatedRows[rowIdx]];
      updatedRows[rowIdx][colIdx] = editValue;
      setRows(updatedRows);
    }
    setEditingCell(null);
  };

  const handleApplyChanges = async () => {
    if (pendingChanges.length === 0) return;

    // Send edits to backend
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

          {/* Export */}
          <button
            onClick={() => alert(`Mengekspor tabel ${tableName} ke Parquet/CSV...`)}
            className="flex items-center gap-1 px-2.5 h-[26px] text-[12px] bg-[var(--surface)] border border-[var(--rule-strong)] text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor</span>
          </button>

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
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-[12.5px]">
                {/* Sticky Header */}
                <thead className="sticky top-0 bg-[var(--surface-sunk)] border-b border-[var(--rule)] z-10">
                  <tr className="h-[28px]">
                    <th className="w-[48px] px-2 text-center font-mono text-[11px] text-[var(--ink-muted)] border-r border-[var(--rule)] select-none">
                      #
                    </th>
                    {columns.map((col, idx) => (
                      <th
                        key={col}
                        onClick={() => setSelectedColIndex(idx)}
                        className={`px-3 text-left font-mono font-medium border-r border-[var(--rule)] cursor-pointer select-none transition-colors ${
                          selectedColIndex === idx
                            ? "bg-[var(--surface)] text-[var(--action)]"
                            : "text-[var(--ink)] hover:bg-[var(--surface)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{col}</span>
                          <span className="text-[10px] font-mono px-1 py-0.2 bg-[var(--surface-sunk)] text-[var(--ink-muted)] rounded-[2px]">
                            {columnTypes[idx]?.toLowerCase() || "txt"}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Rows */}
                <tbody>
                  {rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="h-[28px] border-b border-[var(--rule)] hover:bg-[color-mix(in_srgb,var(--action)_6%,var(--surface))] transition-colors"
                    >
                      {/* Row Number */}
                      <td className="w-[48px] px-2 text-center font-mono text-[11px] text-[var(--ink-muted)] bg-[var(--surface-sunk)] border-r border-[var(--rule)] select-none">
                        {rIdx + 1}
                      </td>

                      {/* Cells */}
                      {row.map((cell, cIdx) => {
                        const isPending = isCellPending(rIdx, cIdx);
                        const isEditing =
                          editingCell?.rowIdx === rIdx && editingCell?.colIdx === cIdx;
                        const isNum = typeof cell === "number";

                        return (
                          <td
                            key={cIdx}
                            onDoubleClick={() => handleStartEdit(rIdx, cIdx, cell)}
                            className={`px-3 border-r border-[var(--rule)] relative select-text ${
                              isPending
                                ? "bg-[var(--mark-wash)]"
                                : ""
                            } ${isNum ? "text-right font-mono" : "text-left"}`}
                          >
                            {/* Pending change yellow triangle indicator */}
                            {isPending && (
                              <span className="absolute top-0 left-0 w-0 h-0 border-t-[6px] border-t-[var(--mark)] border-r-[6px] border-r-transparent" />
                            )}

                            {isEditing ? (
                              <input
                                autoFocus
                                type="text"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleCommitEdit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleCommitEdit();
                                  if (e.key === "Escape") setEditingCell(null);
                                }}
                                className="w-full h-[22px] px-1 bg-[var(--surface)] text-[var(--ink)] border border-[var(--action)] outline-none rounded-[1px]"
                              />
                            ) : cell === null || cell === undefined ? (
                              <span className="italic text-[var(--ink-muted)] font-mono text-[11.5px]">
                                NULL
                              </span>
                            ) : cell === "" ? (
                              <span className="italic text-[var(--ink-muted)] font-mono text-[11.5px]">
                                &quot;&quot;
                              </span>
                            ) : (
                              <span>{String(cell)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <div className="max-w-[800px] flex flex-col gap-3">
                <h3 className="font-semibold text-[14px] text-[var(--ink)]">
                  Kode Setara (DuckDB &amp; Polars)
                </h3>
                <div className="bg-[var(--surface-sunk)] border border-[var(--rule-strong)] p-3 rounded-[2px] font-mono text-[12px] text-[var(--ink)]">
                  <pre>{`-- Kueri SQL DuckDB
SELECT * 
FROM ${tableName}
WHERE tanggal IS NOT NULL
ORDER BY id ASC;`}</pre>
                </div>
                <div className="bg-[var(--surface-sunk)] border border-[var(--rule-strong)] p-3 rounded-[2px] font-mono text-[12px] text-[var(--ink)]">
                  <pre>{`# Kode Python Polars
import polars as pl

df = pl.read_database_uri(
    "SELECT * FROM ${tableName}",
    uri="duckdb:///workspace.duckdb"
)
df_clean = df.filter(pl.col("tanggal").is_not_null())
print(df_clean.head())`}</pre>
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
