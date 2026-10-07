"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Table, Search, ArrowRight } from "lucide-react";
import { fetchApi } from "@/lib/api";

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

export default function TablesListPage() {
  const [tables, setTables] = useState<TableSummary[]>(fallbackTables);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchApi<TableSummary[]>("/tables")
      .then((data) => setTables(data))
      .catch(() => {});
  }, []);

  const filtered = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
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
            Tabel lokal DuckDB dan partisi Parquet yang siap diolah atau dikueri.
          </p>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="flex items-center h-[28px] px-2 bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px]">
            <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] mr-1.5" />
            <input
              type="text"
              placeholder="Cari nama tabel..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-[12px] outline-none text-[var(--ink)]"
            />
          </div>
        </div>
      </div>

      {/* Table List (Industrial Status Board style) */}
      <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden">
        <div className="grid grid-cols-12 px-3 py-2 bg-[var(--surface-sunk)] border-b border-[var(--rule)] text-[12px] font-semibold text-[var(--ink-muted)]">
          <div className="col-span-4">Nama Tabel</div>
          <div className="col-span-2 text-right">Jumlah Baris</div>
          <div className="col-span-2 text-right">Kolom</div>
          <div className="col-span-2">Pembaruan</div>
          <div className="col-span-2 text-right">Aksi</div>
        </div>

        <div className="divide-y divide-[var(--rule)]">
          {filtered.map((tbl) => (
            <div
              key={tbl.name}
              className="grid grid-cols-12 px-3 py-2.5 items-center text-[12.5px] hover:bg-[color-mix(in_srgb,var(--ink)_3%,var(--surface))]"
            >
              <div className="col-span-4 flex items-center gap-2">
                <Table className="w-4 h-4 text-[var(--action)] shrink-0" />
                <span className="font-mono font-semibold text-[var(--ink)]">
                  {tbl.name}
                </span>
                {tbl.freshness_status === "stale" && (
                  <span className="px-1 py-0.2 text-[10px] font-mono font-bold bg-[var(--warn)] text-white rounded-[2px]">
                    basi
                  </span>
                )}
              </div>

              <div className="col-span-2 text-right font-mono text-[var(--ink)]">
                {tbl.row_count.toLocaleString()}
              </div>

              <div className="col-span-2 text-right font-mono text-[var(--ink-muted)]">
                {tbl.column_count}
              </div>

              <div className="col-span-2 text-[12px] text-[var(--ink-muted)]">
                {tbl.updated_at}
              </div>

              <div className="col-span-2 flex justify-end">
                <Link
                  href={`/tables/${tbl.name}`}
                  className="flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium text-[var(--action)] border border-[var(--rule-strong)] hover:bg-[var(--surface-sunk)] rounded-[2px] transition-colors"
                >
                  <span>Buka Grid</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
