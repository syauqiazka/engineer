"use client";

/**
 * DataGrid: virtualized scrollable grid dengan inline editing.
 * Menggunakan TanStack Virtual untuk performa dan React state untuk sorting/selection.
 * Tidak bergantung pada TanStack Table API yang berubah-ubah antar major version.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";

export interface GridColumn {
  name: string;
  type: string;
}

export interface DataGridProps {
  columns: GridColumn[];
  rows: unknown[][];
  totalRows?: number;
  isLoading?: boolean;
  editable?: boolean;
  idColumnIndex?: number;
  onCellEdit?: (
    rowIdx: number,
    colIdx: number,
    newValue: string,
    oldValue: unknown
  ) => Promise<void> | void;
  onSelectionChange?: (selectedRows: number[]) => void;
  className?: string;
}

type SortDir = "asc" | "desc" | null;

interface SortState {
  colIdx: number;
  dir: SortDir;
}

function typeChip(type: string): { label: string; color: string } {
  const t = type.toUpperCase();
  if (t.includes("INT")) return { label: "int", color: "#60a5fa" };
  if (t.includes("DOUBLE") || t.includes("FLOAT") || t.includes("DECIMAL"))
    return { label: "dec", color: "#34d399" };
  if (t.includes("BOOL")) return { label: "bool", color: "#a78bfa" };
  if (t.includes("TIMESTAMP")) return { label: "ts", color: "#f59e0b" };
  if (t.includes("DATE")) return { label: "date", color: "#fb923c" };
  if (t.includes("JSON")) return { label: "json", color: "#e879f9" };
  return { label: "txt", color: "#94a3b8" };
}

function colWidth(name: string): number {
  return Math.max(120, Math.min(280, name.length * 9 + 90));
}

export default function DataGrid({
  columns,
  rows,
  totalRows,
  isLoading = false,
  editable = false,
  onCellEdit,
  onSelectionChange,
  className = "",
}: DataGridProps) {
  const [sort, setSort] = useState<SortState | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [savingCell, setSavingCell] = useState<{ rowIdx: number; colIdx: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sorted rows
  const sortedRows = useMemo<unknown[][]>(() => {
    if (!sort || sort.dir === null) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sort.colIdx];
      const bv = b[sort.colIdx];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort]);

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 20,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualHeight = rowVirtualizer.getTotalSize();

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  useEffect(() => {
    onSelectionChange?.([...selected]);
  }, [selected, onSelectionChange]);

  const handleSort = useCallback((ci: number) => {
    setSort((prev) => {
      if (!prev || prev.colIdx !== ci) return { colIdx: ci, dir: "asc" };
      if (prev.dir === "asc") return { colIdx: ci, dir: "desc" };
      return null;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((_, i) => i)));
    }
  }, [selected.size, rows]);

  const toggleRow = useCallback((i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }, []);

  const handleSave = useCallback(
    async (rowIdx: number, colIdx: number, oldValue: unknown) => {
      setEditingCell(null);
      if (editValue === String(oldValue ?? "")) return;
      setSavingCell({ rowIdx, colIdx });
      try {
        await onCellEdit?.(rowIdx, colIdx, editValue, oldValue);
      } finally {
        setSavingCell(null);
      }
    },
    [editValue, onCellEdit]
  );

  if (isLoading) {
    return (
      <div className="grid-loading">
        <div className="grid-loading-spinner" />
        <span>Memuat data…</span>
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="grid-empty">
        <span>Tidak ada data untuk ditampilkan.</span>
      </div>
    );
  }

  const allSelected = rows.length > 0 && selected.size === rows.length;

  return (
    <div className={`data-grid-wrapper ${className}`}>
      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="grid-selection-bar">
          <span>{selected.size} baris dipilih</span>
          <button
            onClick={() => setSelected(new Set())}
            className="grid-deselect-btn"
            aria-label="Batalkan pilihan"
          >
            <X size={13} /> Batalkan
          </button>
        </div>
      )}

      {/* Scroll container */}
      <div ref={scrollRef} className="grid-scroll-container">
        <table
          className="data-grid"
          style={{
            width:
              36 + columns.reduce((sum, c) => sum + colWidth(c.name), 0) + "px",
          }}
        >
          {/* Sticky header */}
          <thead className="grid-thead">
            <tr>
              {/* Checkbox */}
              <th className="grid-th" style={{ width: "36px" }}>
                <input
                  type="checkbox"
                  className="grid-checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Pilih semua baris"
                />
              </th>
              {columns.map((col, ci) => {
                const chip = typeChip(col.type);
                const sortDir =
                  sort?.colIdx === ci ? sort.dir : null;
                return (
                  <th
                    key={col.name}
                    className="grid-th"
                    style={{ width: colWidth(col.name) + "px" }}
                  >
                    <button
                      className="grid-header-btn"
                      onClick={() => handleSort(ci)}
                      aria-label={`Urutkan berdasarkan ${col.name}`}
                    >
                      <span
                        className="grid-type-chip"
                        style={{ color: chip.color }}
                        title={col.type}
                      >
                        {chip.label}
                      </span>
                      <span className="grid-header-name">{col.name}</span>
                      {sortDir === "asc" ? (
                        <ArrowUp size={11} className="grid-sort-icon" />
                      ) : sortDir === "desc" ? (
                        <ArrowDown size={11} className="grid-sort-icon" />
                      ) : (
                        <ArrowUpDown size={11} className="grid-sort-icon muted" />
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Virtual body */}
          <tbody
            className="grid-tbody"
            style={{ height: totalVirtualHeight + "px", position: "relative" }}
          >
            {virtualRows.map((vrow) => {
              const rIdx = vrow.index;
              const row = sortedRows[rIdx];
              const isRowSelected = selected.has(rIdx);

              return (
                <tr
                  key={rIdx}
                  className={`grid-row ${isRowSelected ? "is-selected" : ""}`}
                  style={{
                    position: "absolute",
                    top: vrow.start + "px",
                    width: "100%",
                    display: "flex",
                  }}
                  ref={rowVirtualizer.measureElement}
                  data-index={rIdx}
                >
                  {/* Checkbox cell */}
                  <td className="grid-td" style={{ width: "36px", flexShrink: 0 }}>
                    <div className="grid-cell-value">
                      <input
                        type="checkbox"
                        className="grid-checkbox"
                        checked={isRowSelected}
                        onChange={() => toggleRow(rIdx)}
                        aria-label={`Pilih baris ${rIdx + 1}`}
                      />
                    </div>
                  </td>

                  {columns.map((col, ci) => {
                    const value = row[ci];
                    const isEditing =
                      editingCell?.rowIdx === rIdx && editingCell?.colIdx === ci;
                    const isSaving =
                      savingCell?.rowIdx === rIdx && savingCell?.colIdx === ci;
                    const isNull = value === null || value === undefined;

                    return (
                      <td
                        key={ci}
                        className="grid-td"
                        style={{ width: colWidth(col.name) + "px", flexShrink: 0 }}
                      >
                        {isEditing && editable ? (
                          <div className="grid-cell-edit-wrap">
                            <input
                              ref={inputRef}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave(rIdx, ci, value);
                                if (e.key === "Escape") setEditingCell(null);
                              }}
                              onBlur={() => handleSave(rIdx, ci, value)}
                              className="grid-cell-input"
                              aria-label={`Edit ${col.name}`}
                            />
                          </div>
                        ) : (
                          <div
                            className={`grid-cell-value ${isNull ? "is-null" : ""} ${editable ? "is-editable" : ""}`}
                            onDoubleClick={() => {
                              if (editable) {
                                setEditingCell({ rowIdx: rIdx, colIdx: ci });
                                setEditValue(isNull ? "" : String(value));
                              }
                            }}
                            title={isNull ? "NULL" : String(value)}
                          >
                            {isSaving ? (
                              <span>⏳</span>
                            ) : isNull ? (
                              <span className="grid-null-badge">NULL</span>
                            ) : (
                              <span className="grid-cell-text">{String(value)}</span>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="grid-footer">
        <span className="grid-footer-count">
          {rows.length.toLocaleString("id-ID")} baris
          {totalRows && totalRows > rows.length
            ? ` dari ${totalRows.toLocaleString("id-ID")} total`
            : ""}
        </span>
        {editable && (
          <span className="grid-footer-hint">Klik dua kali sel untuk mengedit</span>
        )}
      </div>
    </div>
  );
}
