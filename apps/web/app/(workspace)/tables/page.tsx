"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Table, Search, ArrowRight, Upload, RefreshCw } from "lucide-react";
import { fetchApi } from "@/lib/api";
import ImportFileModal from "@/components/ImportFileModal";

interface TableSummary {
  name: string;
  row_count: number;
  column_count: number;
  size_bytes: number;
  updated_at: string;
  freshness_status: "fresh" | "stale" | "critical";
}

const fallbackTables: TableSummary[] = [
  {
    name: "pesanan_harian",
    row_count: 12,
    column_count: 9,
    size_bytes: 3456,
    updated_at: "2026-03-06 10:15 WIB",
    freshness_status: "fresh",
  },
  {
    name: "stg_sensor",
    row_count: 5,
    column_count: 6,
    size_bytes: 960,
    updated_at: "2026-03-04 18:00 WIB",
    freshness_status: "stale",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TablesListPage() {
  const router = useRouter();
  const [tables, setTables] = useState<TableSummary[]>(fallbackTables);
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadTables = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await fetchApi<TableSummary[]>("/tables");
      setTables(data);
    } catch {
      // pakai fallback
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const filtered = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleImportSuccess = useCallback(
    (tableName: string) => {
      setShowImport(false);
      loadTables(); // refresh daftar tabel
      router.push(`/tables/${tableName}`);
    },
    [loadTables, router]
  );

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-3">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--ink)]">
            Tabel Kerja (Workspace)
          </h1>
          <p className="text-[12px] text-[var(--ink-muted)]">
            Tabel lokal DuckDB yang siap diolah atau dikueri. Impor file untuk membuat tabel baru.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh */}
          <button
            id="refresh-tables-btn"
            onClick={loadTables}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2.5 h-[28px] text-[12px] bg-[var(--surface)] border border-[var(--rule-strong)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px] transition-colors"
            title="Muat ulang daftar tabel"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>

          {/* Search */}
          <div className="flex items-center h-[28px] px-2 bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px]">
            <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] mr-1.5" />
            <input
              type="text"
              placeholder="Cari tabel…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-[12px] outline-none text-[var(--ink)] w-[140px]"
              aria-label="Cari tabel"
            />
          </div>

          {/* Import Button */}
          <button
            id="import-file-btn"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 px-3 h-[28px] text-[12px] font-medium bg-[var(--action)] text-white hover:opacity-90 rounded-[2px] transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor File</span>
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-[12px] text-[var(--ink-muted)] font-mono">
        <span>{tables.length} tabel</span>
        <span>·</span>
        <span>{tables.reduce((s, t) => s + t.row_count, 0).toLocaleString("id-ID")} total baris</span>
        <span>·</span>
        <span>{formatBytes(tables.reduce((s, t) => s + t.size_bytes, 0))}</span>
      </div>

      {/* Table list */}
      <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-12 px-3 py-2 bg-[var(--surface-sunk)] border-b border-[var(--rule)] text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider select-none">
          <div className="col-span-4">Nama Tabel</div>
          <div className="col-span-2 text-right">Baris</div>
          <div className="col-span-1 text-right">Kolom</div>
          <div className="col-span-2 text-right">Ukuran</div>
          <div className="col-span-2">Diperbarui</div>
          <div className="col-span-1 text-right">Aksi</div>
        </div>

        <div className="divide-y divide-[var(--rule)]">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[var(--ink-muted)]">
              {search
                ? `Tidak ada tabel yang cocok dengan "${search}"`
                : "Belum ada tabel. Impor file untuk memulai."}
            </div>
          ) : (
            filtered.map((tbl) => (
              <div
                key={tbl.name}
                className="grid grid-cols-12 px-3 py-2.5 items-center text-[12.5px] hover:bg-[color-mix(in_srgb,var(--ink)_3%,var(--surface))] transition-colors"
              >
                <div className="col-span-4 flex items-center gap-2">
                  <Table className="w-4 h-4 text-[var(--action)] shrink-0" />
                  <span className="font-mono font-semibold text-[var(--ink)]">
                    {tbl.name}
                  </span>
                  {tbl.freshness_status === "stale" && (
                    <span className="px-1 py-0.5 text-[10px] font-mono font-bold bg-[var(--warn)] text-white rounded-[2px]">
                      basi
                    </span>
                  )}
                  {tbl.freshness_status === "critical" && (
                    <span className="px-1 py-0.5 text-[10px] font-mono font-bold bg-[var(--error)] text-white rounded-[2px]">
                      kritis
                    </span>
                  )}
                </div>

                <div className="col-span-2 text-right font-mono text-[var(--ink)]">
                  {tbl.row_count.toLocaleString("id-ID")}
                </div>

                <div className="col-span-1 text-right font-mono text-[var(--ink-muted)]">
                  {tbl.column_count}
                </div>

                <div className="col-span-2 text-right font-mono text-[11px] text-[var(--ink-muted)]">
                  {formatBytes(tbl.size_bytes)}
                </div>

                <div className="col-span-2 text-[11.5px] text-[var(--ink-muted)]">
                  {tbl.updated_at}
                </div>

                <div className="col-span-1 flex justify-end">
                  <Link
                    href={`/tables/${tbl.name}`}
                    className="flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium text-[var(--action)] border border-[var(--rule-strong)] hover:bg-[var(--surface-sunk)] rounded-[2px] transition-colors"
                  >
                    <span>Buka</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Import File Modal */}
      {showImport && (
        <ImportFileModal
          onClose={() => setShowImport(false)}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
}
