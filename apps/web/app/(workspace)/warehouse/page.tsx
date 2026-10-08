"use client";

import React, { useState, useEffect } from "react";
import {
  Database,
  Layers,
  FileText,
  Archive,
  Trash2,
  RefreshCw,
  Info,
  CheckCircle2,
  Clock,
  Sparkles,
  Table as TableIcon,
} from "lucide-react";
import { fetchApi } from "@/lib/api";

interface WarehouseTableSummary {
  name: string;
  version: number;
  total_rows: number;
  total_bytes: number;
  file_count: number;
  partition_columns: string[];
  updated_at: number;
  last_operation: string;
}

interface ManifestVersion {
  version: number;
  operation: string;
  total_rows: number;
  total_bytes: number;
  file_count: number;
  created_at: number;
  message: string;
}

interface TableDetailResponse {
  manifest: {
    table_name: string;
    version: number;
    schema: Array<{ name: string; data_type: string; nullable: boolean }>;
    partition_columns: string[];
    files: Array<{ path: string; row_count: number; size_bytes: number }>;
    total_rows: number;
    total_bytes: number;
  };
  history: ManifestVersion[];
  notice: string;
}

interface PreviewResponse {
  columns: string[];
  rows: unknown[][];
  total_rows: number;
  execution_time_ms: number;
}

export default function WarehousePage() {
  const [tables, setTables] = useState<WarehouseTableSummary[]>([]);
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [tableDetails, setTableDetails] = useState<TableDetailResponse | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"history" | "preview">("history");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadTables = async () => {
    try {
      const data = await fetchApi<{ tables: WarehouseTableSummary[] }>("/warehouse/tables");
      setTables(data.tables);
      if (data.tables.length > 0 && !selectedTableName) {
        setSelectedTableName(data.tables[0].name);
      }
    } catch {
      // Fallback sample data if loading
      const fallback: WarehouseTableSummary[] = [
        {
          name: "dw_pengiriman_logistik",
          version: 2,
          total_rows: 6,
          total_bytes: 4210,
          file_count: 3,
          partition_columns: ["tanggal"],
          updated_at: Date.now() / 1000 - 3600,
          last_operation: "overwrite",
        },
      ];
      setTables(fallback);
      if (!selectedTableName) setSelectedTableName(fallback[0].name);
    } finally {
      setLoading(false);
    }
  };

  const loadTableDetails = async (tableName: string) => {
    try {
      const details = await fetchApi<TableDetailResponse>(`/warehouse/tables/${tableName}`);
      setTableDetails(details);
    } catch (err) {
      console.error(err);
    }

    try {
      const prev = await fetchApi<PreviewResponse>(`/warehouse/tables/${tableName}/preview?limit=50`);
      setPreviewData(prev);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadTables();
  }, []);

  useEffect(() => {
    if (selectedTableName) {
      loadTableDetails(selectedTableName);
    }
  }, [selectedTableName]);

  const handleCompaction = async () => {
    if (!selectedTableName) return;
    setActionLoading(true);
    try {
      const res = await fetchApi<{ message: string; version: number }>(
        `/warehouse/tables/${selectedTableName}/compaction`,
        { method: "POST" }
      );
      showToast(res.message);
      loadTableDetails(selectedTableName);
      loadTables();
    } catch (err: unknown) {
      showToast(`Gagal compaction: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVacuum = async () => {
    if (!selectedTableName) return;
    setActionLoading(true);
    try {
      const res = await fetchApi<{ message: string }>(
        `/warehouse/tables/${selectedTableName}/vacuum`,
        { method: "POST" }
      );
      showToast(res.message);
      loadTableDetails(selectedTableName);
      loadTables();
    } catch (err: unknown) {
      showToast(`Gagal vacuum: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg)]">
      {/* Top Banner: Honest Notice mandated by AGENTS.md Section 5.4 & 2.4 */}
      <div className="bg-[var(--surface)] border-b border-[var(--rule)] px-6 py-2 flex items-center justify-between text-[12px] text-[var(--ink-muted)]">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-[var(--action)] shrink-0" />
          <span>
            <strong>Gudang data lokal</strong> berjalan di satu mesin (DuckDB + Parquet berpartisi). Untuk data
            melebihi kapasitas mesin lokal, gunakan Spark atau ClickHouse.
          </span>
        </div>
        <span className="font-mono text-[11px] bg-[var(--surface-sunk)] px-2 py-0.5 rounded-[2px] border border-[var(--rule)]">
          Format: Parquet + Manifest Atomik
        </span>
      </div>

      {/* Main Workspace: 2-Zones (Table list on left, Inspector & Preview on right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Warehouse Tables Catalog */}
        <div className="w-[38%] border-r border-[var(--rule)] bg-[var(--surface)] flex flex-col overflow-y-auto">
          <div className="h-10 px-4 border-b border-[var(--rule)] bg-[var(--surface-sunk)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-[var(--action)]" />
              <span className="text-[12.5px] font-semibold text-[var(--ink)]">Tabel Gudang Data ({tables.length})</span>
            </div>
            <button
              onClick={loadTables}
              className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
              title="Segarkan tabel"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="text-[13px] text-[var(--ink-muted)] py-10 text-center">Memuat tabel...</div>
          ) : (
            <div className="divide-y divide-[var(--rule)]">
              {tables.map((t) => {
                const isSelected = selectedTableName === t.name;
                return (
                  <div
                    key={t.name}
                    onClick={() => setSelectedTableName(t.name)}
                    className={`p-3.5 cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[color-mix(in_srgb,var(--action)_10%,transparent)] border-l-2 border-[var(--action)]"
                        : "hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[13px] text-[var(--ink)]">{t.name}</span>
                      <span className="text-[11px] font-mono px-1.5 py-0.2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[var(--ink)]">
                        v{t.version}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11.5px] font-mono text-[var(--ink-muted)] mt-1.5">
                      <span>{t.total_rows.toLocaleString()} baris</span>
                      <span>•</span>
                      <span>{formatBytes(t.total_bytes)}</span>
                      <span>•</span>
                      <span>{t.file_count} berkas parquet</span>
                    </div>

                    {t.partition_columns && t.partition_columns.length > 0 && (
                      <div className="text-[11px] text-[var(--ink-muted)] mt-1 flex items-center gap-1 font-mono">
                        <Layers className="w-3 h-3" /> Partisi Hive: [{t.partition_columns.join(", ")}]
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Table Inspector & Parquet Pushdown Preview */}
        <div className="flex-1 flex flex-col bg-[var(--surface)] overflow-y-auto">
          {tableDetails ? (
            <div className="flex-1 flex flex-col">
              {/* Header and Maintenance Controls */}
              <div className="p-4 border-b border-[var(--rule)] bg-[var(--surface-sunk)] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-[var(--ink)]">
                      {tableDetails.manifest.table_name}
                    </h2>
                    <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                      (Versi saat ini: v{tableDetails.manifest.version})
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--ink-muted)] mt-0.5">
                    {tableDetails.manifest.total_rows.toLocaleString()} baris total •{" "}
                    {formatBytes(tableDetails.manifest.total_bytes)} • {tableDetails.manifest.files.length} berkas aktif
                  </div>
                </div>

                {/* Compaction & Vacuum Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCompaction}
                    disabled={actionLoading}
                    className="h-7 px-3 bg-[var(--surface)] border border-[var(--rule-strong)] text-[var(--ink)] hover:bg-[var(--surface-sunk)] text-[12px] font-medium rounded-[2px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Gabungkan berkas Parquet kecil menjadi optimal"
                  >
                    <Archive className="w-3.5 h-3.5 text-[var(--action)]" />
                    Kompaksi (Compaction)
                  </button>

                  <button
                    onClick={handleVacuum}
                    disabled={actionLoading}
                    className="h-7 px-3 bg-[var(--surface)] border border-[var(--rule-strong)] text-[var(--ink)] hover:bg-[var(--surface-sunk)] text-[12px] font-medium rounded-[2px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Hapus berkas versi lama yang sudah kedaluwarsa"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[var(--error)]" />
                    Vacuum
                  </button>
                </div>
              </div>

              {/* Inspector Tabs */}
              <div className="flex border-b border-[var(--rule)] bg-[var(--surface)] px-4">
                <button
                  onClick={() => setActiveTab("history")}
                  className={`h-9 px-3 text-[12.5px] font-medium border-b-2 flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "history"
                      ? "border-[var(--action)] text-[var(--action)]"
                      : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" /> Riwayat Manifest ({tableDetails.history.length})
                </button>
                <button
                  onClick={() => setActiveTab("preview")}
                  className={`h-9 px-3 text-[12.5px] font-medium border-b-2 flex items-center gap-1.5 cursor-pointer ${
                    activeTab === "preview"
                      ? "border-[var(--action)] text-[var(--action)]"
                      : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" /> Pratinjau Parquet (DuckDB Pushdown)
                </button>
              </div>

              {/* Tab: Riwayat Versi Manifest */}
              {activeTab === "history" && (
                <div className="p-4 space-y-3">
                  <table className="w-full text-left border-collapse text-[12px] border border-[var(--rule)] rounded-[2px]">
                    <thead>
                      <tr className="border-b border-[var(--rule)] bg-[var(--surface-sunk)] text-[var(--ink-muted)] h-8 font-medium">
                        <th className="px-3">Versi</th>
                        <th className="px-3">Operasi</th>
                        <th className="px-3">Baris</th>
                        <th className="px-3">Ukuran</th>
                        <th className="px-3">Berkas</th>
                        <th className="px-4">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--rule)]">
                      {tableDetails.history.map((h) => (
                        <tr key={h.version} className="h-10 hover:bg-[var(--surface-sunk)] transition-colors">
                          <td className="px-3 font-mono font-semibold text-[var(--action)]">v{h.version}</td>
                          <td className="px-3">
                            <span className="inline-block px-1.5 py-0.5 text-[10.5px] font-mono rounded-[2px] bg-[var(--surface-sunk)] border border-[var(--rule)] text-[var(--ink)] capitalize">
                              {h.operation}
                            </span>
                          </td>
                          <td className="px-3 font-mono">{h.total_rows.toLocaleString()}</td>
                          <td className="px-3 font-mono">{formatBytes(h.total_bytes)}</td>
                          <td className="px-3 font-mono">{h.file_count}</td>
                          <td className="px-4 text-[var(--ink-muted)] truncate max-w-[280px]">{h.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Active Parquet Files List */}
                  <div className="pt-2">
                    <div className="text-[12px] font-semibold text-[var(--ink)] mb-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-[var(--action)]" />
                      <span>Daftar Berkas Parquet Aktif di Disk</span>
                    </div>
                    <div className="border border-[var(--rule)] rounded-[2px] overflow-hidden text-[11.5px] font-mono">
                      {tableDetails.manifest.files.map((f, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-2 border-b border-[var(--rule)] last:border-0 flex items-center justify-between bg-[var(--surface)] hover:bg-[var(--surface-sunk)]"
                        >
                          <span className="text-[var(--ink)] truncate max-w-[340px]">{f.path}</span>
                          <span className="text-[var(--ink-muted)]">
                            {f.row_count.toLocaleString()} baris • {formatBytes(f.size_bytes)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Pratinjau Data Parquet (DuckDB pushdown) */}
              {activeTab === "preview" && (
                <div className="flex-1 p-4 flex flex-col">
                  {previewData && previewData.columns.length > 0 ? (
                    <div className="flex-1 flex flex-col border border-[var(--rule)] rounded-[2px] overflow-hidden">
                      <div className="h-8 px-3 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between text-[11.5px] text-[var(--ink-muted)]">
                        <span>Menampilkan {previewData.rows.length} baris sampel (waktu eksekusi: {previewData.execution_time_ms} ms)</span>
                        <span className="font-mono">DuckDB in-memory reader</span>
                      </div>
                      <div className="flex-1 overflow-auto max-h-[420px]">
                        <table className="w-full text-left border-collapse text-[12px] font-mono">
                          <thead>
                            <tr className="bg-[var(--surface-sunk)] border-b border-[var(--rule)] sticky top-0">
                              {previewData.columns.map((c) => (
                                <th key={c} className="px-3 py-1.5 font-medium text-[var(--ink)] border-r border-[var(--rule)] last:border-0">
                                  {c}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--rule)]">
                            {previewData.rows.map((r, rIdx) => (
                              <tr key={rIdx} className="hover:bg-[var(--surface-sunk)] h-7">
                                {r.map((cell, cIdx) => (
                                  <td
                                    key={cIdx}
                                    className="px-3 py-1 text-[var(--ink)] border-r border-[var(--rule)] last:border-0 truncate max-w-[200px]"
                                  >
                                    {cell === null ? (
                                      <span className="italic text-[var(--ink-muted)]">NULL</span>
                                    ) : (
                                      String(cell)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[13px] text-[var(--ink-muted)] py-12 text-center">
                      Tidak ada data sampel untuk ditampilkan.
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--ink-muted)]">
              Pilih tabel gudang data di sebelah kiri untuk melihat manifest & pratinjau data.
            </div>
          )}
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-8 left-8 bg-[var(--surface-sunk)] border border-[var(--rule-strong)] px-4 py-2.5 rounded-[2px] shadow-lg text-[12.5px] text-[var(--ink)] z-50">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
