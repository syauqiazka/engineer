"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Database,
  ShieldAlert,
  Server,
  HardDrive,
  X,
  CheckCircle,
} from "lucide-react";
import { fetchApi } from "@/lib/api";

interface AttentionItem {
  id: string;
  status: "error" | "warn" | "info";
  status_label: string;
  name: string;
  time: string;
  reason: string;
  target_link: string;
}

interface TimelineRunBlock {
  run_id: string;
  status: "ok" | "error" | "action" | "muted";
  duration_sec: number;
  rows_processed: number;
  started_at: string;
}

interface PipelineTimeline {
  pipeline_name: string;
  runs: TimelineRunBlock[];
}

interface FreshnessItem {
  table_name: string;
  last_updated: string;
  threshold: string;
  is_stale: boolean;
}

interface QualityBreachItem {
  rule_name: string;
  table_name: string;
  breach_count: number;
  sparkline: number[];
}

interface ConnectionItem {
  name: string;
  kind: string;
  environment: string;
  status: string;
  latency_ms: number;
}

interface ResourceMetrics {
  cpu_pct: number;
  memory_pct: number;
  disk_pct: number;
  disk_used_gb: number;
  disk_total_gb: number;
}

interface OverviewData {
  summary_sentence: string;
  attention_items: AttentionItem[];
  timelines: PipelineTimeline[];
  freshness: FreshnessItem[];
  quality_breaches: QualityBreachItem[];
  connections: ConnectionItem[];
  resources: ResourceMetrics;
}

// Fallback data if backend is offline during client dev
const defaultOverview: OverviewData = {
  summary_sentence:
    "Hari ini: 42 run berhasil, 2 gagal, 1 berjalan. 1 tabel basi. Disk 62%.",
  attention_items: [
    {
      id: "att-1",
      status: "error",
      status_label: "✕ Gagal",
      name: "orders_daily",
      time: "02:00 WIB",
      reason:
        "Kolom `tanggal` gagal diubah ke date: 31 baris berformat DD/MM/YYYY",
      target_link: "/tables/pesanan_harian",
    },
    {
      id: "att-2",
      status: "warn",
      status_label: "! Terlambat",
      name: "sync_pelanggan",
      time: "seharusnya 03:00 WIB",
      reason: "Jadwal terlewat, dependensi upstream belum selesai",
      target_link: "/schedules",
    },
    {
      id: "att-3",
      status: "warn",
      status_label: "! Basi",
      name: "stg_sensor",
      time: "terakhir 2 hari lalu",
      reason: "Melewati ambang batas kesegaran 24 jam",
      target_link: "/tables/stg_sensor",
    },
  ],
  timelines: [
    {
      pipeline_name: "orders_daily",
      runs: [
        { run_id: "r1", status: "ok", duration_sec: 42, rows_processed: 12400, started_at: "00:00" },
        { run_id: "r2", status: "ok", duration_sec: 45, rows_processed: 12550, started_at: "01:00" },
        { run_id: "r3", status: "error", duration_sec: 12, rows_processed: 0, started_at: "02:00" },
        { run_id: "r4", status: "ok", duration_sec: 44, rows_processed: 12600, started_at: "03:00" },
        { run_id: "r5", status: "ok", duration_sec: 43, rows_processed: 12580, started_at: "04:00" },
        { run_id: "r6", status: "action", duration_sec: 20, rows_processed: 8200, started_at: "05:00" },
      ],
    },
    {
      pipeline_name: "sync_pelanggan",
      runs: [
        { run_id: "r7", status: "ok", duration_sec: 18, rows_processed: 420, started_at: "00:00" },
        { run_id: "r8", status: "ok", duration_sec: 17, rows_processed: 430, started_at: "01:00" },
        { run_id: "r9", status: "ok", duration_sec: 19, rows_processed: 425, started_at: "02:00" },
        { run_id: "r10", status: "muted", duration_sec: 0, rows_processed: 0, started_at: "03:00" },
      ],
    },
  ],
  freshness: [
    { table_name: "pesanan_harian", last_updated: "10 menit lalu", threshold: "1 jam", is_stale: false },
    { table_name: "stg_sensor", last_updated: "2 hari lalu", threshold: "24 jam", is_stale: true },
    { table_name: "dim_pelanggan", last_updated: "5 jam lalu", threshold: "12 jam", is_stale: false },
  ],
  quality_breaches: [
    {
      rule_name: "tanggal NOT NULL",
      table_name: "pesanan_harian",
      breach_count: 1,
      sparkline: [0, 0, 1, 0, 2, 1, 1],
    },
    {
      rule_name: "jumlah > 0",
      table_name: "pesanan_harian",
      breach_count: 1,
      sparkline: [0, 1, 0, 0, 0, 1, 1],
    },
  ],
  connections: [
    { name: "db_produksi_pg", kind: "postgres", environment: "prod", status: "online", latency_ms: 4.2 },
    { name: "dw_lokal_duckdb", kind: "duckdb", environment: "dev", status: "online", latency_ms: 0.3 },
    { name: "stream_events", kind: "kafka", environment: "staging", status: "online", latency_ms: 12.1 },
  ],
  resources: {
    cpu_pct: 18.4,
    memory_pct: 34.2,
    disk_pct: 62.0,
    disk_used_gb: 124.0,
    disk_total_gb: 200.0,
  },
};

export default function OverviewPage() {
  const [data, setData] = useState<OverviewData>(defaultOverview);
  const [showQuickStart, setShowQuickStart] = useState(true);

  useEffect(() => {
    fetchApi<OverviewData>("/overview")
      .then((res) => setData(res))
      .catch(() => {
        // Fallback already assigned
      });
  }, []);

  return (
    <div className="max-w-[1280px] mx-auto flex flex-col gap-3">
      {/* Quickstart checklist if new workspace (can be dismissed) */}
      {showQuickStart && (
        <div className="bg-[var(--surface)] border border-[var(--rule)] p-2.5 rounded-[2px] flex items-center justify-between text-[12px]">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-[var(--ink)]">Mulai Cepat:</span>
            <div className="flex items-center gap-1.5 text-[var(--ok)]">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Workspace DuckDB aktif</span>
            </div>
            <Link
              href="/tables/pesanan_harian"
              className="flex items-center gap-1 text-[var(--action)] hover:underline"
            >
              <span>Buka tabel sampel pesanan</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
            <Link
              href="/query"
              className="flex items-center gap-1 text-[var(--action)] hover:underline"
            >
              <span>Jalankan kueri SQL pertama</span>
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </div>
          <button
            onClick={() => setShowQuickStart(false)}
            className="text-[var(--ink-muted)] hover:text-[var(--ink)] p-1 rounded-[2px]"
            title="Tutup panduan"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary Sentence Box (Industrial Header - DESIGN.md Section 6.2) */}
      <div className="bg-[var(--surface)] border border-[var(--rule-strong)] px-3 py-2.5 rounded-[2px]">
        <div className="text-[13px] font-medium text-[var(--ink)] flex items-center gap-2">
          <span>{data.summary_sentence}</span>
          <span className="ml-auto text-[11px] text-[var(--ink-muted)] font-mono">
            Pembaruan otomatis: 12 detik lalu
          </span>
        </div>
      </div>

      {/* Perlu Perhatian Section */}
      <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden">
        <div className="px-3 py-1.5 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex justify-between items-center">
          <span className="text-[12px] font-semibold text-[var(--ink)]">
            Perlu perhatian ({data.attention_items.length})
          </span>
        </div>
        <div className="divide-y divide-[var(--rule)]">
          {data.attention_items.map((item) => (
            <div
              key={item.id}
              className={`px-3 py-2 flex items-center justify-between text-[12.5px] hover:bg-[color-mix(in_srgb,var(--ink)_3%,var(--surface))] ${
                item.status === "error" ? "bg-[color-mix(in_srgb,var(--error)_3%,var(--surface))]" : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded-[2px] shrink-0 ${
                    item.status === "error"
                      ? "bg-[var(--error-wash)] text-[var(--error)]"
                      : "bg-[var(--mark-wash)] text-[var(--warn)]"
                  }`}
                >
                  {item.status_label}
                </span>
                <span className="font-mono font-semibold text-[var(--ink)] shrink-0">
                  {item.name}
                </span>
                <span className="text-[var(--ink-muted)] text-[12px] shrink-0">
                  {item.time}
                </span>
                <span className="text-[var(--ink-muted)] truncate">
                  {item.reason}
                </span>
              </div>
              <Link
                href={item.target_link}
                className="ml-3 shrink-0 px-2 py-0.5 text-[12px] font-medium text-[var(--action)] border border-[var(--rule-strong)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
              >
                Lihat
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Run Terbaru - 24 Hours Timeline */}
      <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden">
        <div className="px-3 py-1.5 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex justify-between items-center">
          <span className="text-[12px] font-semibold text-[var(--ink)]">
            Run terbaru (timeline 24 jam)
          </span>
          <span className="text-[11px] font-mono text-[var(--ink-muted)]">
            00:00 — 23:59 WIB
          </span>
        </div>
        <div className="p-3 flex flex-col gap-2.5">
          {data.timelines.map((tl) => (
            <div key={tl.pipeline_name} className="flex items-center gap-4 text-[12.5px]">
              <span className="w-[180px] font-mono font-semibold text-[var(--ink)] truncate">
                {tl.pipeline_name}
              </span>
              <div className="flex-1 flex items-center gap-1.5 h-[20px] bg-[var(--surface-sunk)] px-2 rounded-[2px]">
                {tl.runs.map((r) => {
                  let bg = "bg-[var(--ok)]";
                  if (r.status === "error") bg = "bg-[var(--error)]";
                  else if (r.status === "action") bg = "bg-[var(--action)] animate-pulse";
                  else if (r.status === "muted") bg = "bg-[var(--rule-strong)]";

                  return (
                    <div
                      key={r.run_id}
                      title={`${r.started_at}: ${r.status} (${r.duration_sec}s, ${r.rows_processed} baris)`}
                      className={`h-[12px] w-[14px] rounded-[1px] cursor-pointer ${bg}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Grid 4 Kolom: Kesegaran Data, Kualitas, Koneksi, Sumber Daya */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Kesegaran Data */}
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] flex flex-col">
          <div className="px-3 py-1.5 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" /> Kesegaran data
            </span>
          </div>
          <div className="p-2.5 flex flex-col gap-2 text-[12px] flex-1">
            {data.freshness.map((f) => (
              <div key={f.table_name} className="flex justify-between items-center">
                <span className="font-mono text-[var(--ink)] truncate">{f.table_name}</span>
                <span
                  className={`text-[11px] font-mono px-1 py-0.5 rounded-[2px] ${
                    f.is_stale
                      ? "bg-[var(--warn)] text-white font-bold"
                      : "text-[var(--ink-muted)]"
                  }`}
                >
                  {f.last_updated}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Kualitas Aturan */}
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] flex flex-col">
          <div className="px-3 py-1.5 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Kualitas data
            </span>
          </div>
          <div className="p-2.5 flex flex-col gap-2 text-[12px] flex-1">
            {data.quality_breaches.map((q) => (
              <div key={q.rule_name} className="flex flex-col gap-0.5">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[11.5px] text-[var(--ink)] truncate">
                    {q.rule_name}
                  </span>
                  <span
                    className={`font-mono text-[11px] px-1 rounded-[2px] ${
                      q.breach_count > 0
                        ? "text-[var(--error)] bg-[var(--error-wash)] font-bold"
                        : "text-[var(--ok)]"
                    }`}
                  >
                    {q.breach_count} gagal
                  </span>
                </div>
                <div className="flex items-center gap-1 h-2 mt-0.5">
                  {q.sparkline.map((val, idx) => (
                    <div
                      key={idx}
                      className={`h-full flex-1 rounded-[1px] ${
                        val > 0 ? "bg-[var(--error)]" : "bg-[var(--ok)] opacity-60"
                      }`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Koneksi */}
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] flex flex-col">
          <div className="px-3 py-1.5 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" /> Koneksi
            </span>
          </div>
          <div className="p-2.5 flex flex-col gap-2 text-[12px] flex-1">
            {data.connections.map((c) => (
              <div key={c.name} className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] shrink-0" />
                  <span className="font-mono text-[11.5px] text-[var(--ink)] truncate">
                    {c.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono text-[var(--ink-muted)]">
                    {c.latency_ms}ms
                  </span>
                  <span
                    className={`text-[9px] font-mono uppercase px-1 py-0.2 rounded-[2px] ${
                      c.environment === "prod"
                        ? "bg-[var(--warn)] text-white"
                        : "bg-[var(--surface-sunk)] text-[var(--ink-muted)]"
                    }`}
                  >
                    {c.environment}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sumber Daya Mesin */}
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] flex flex-col">
          <div className="px-3 py-1.5 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[var(--ink)] flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" /> Sumber daya
            </span>
          </div>
          <div className="p-2.5 flex flex-col gap-2 text-[12px] flex-1 font-mono">
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">CPU</span>
              <span className="text-[var(--ink)]">{data.resources.cpu_pct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">Memori</span>
              <span className="text-[var(--ink)]">{data.resources.memory_pct}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--ink-muted)]">Disk Workspace</span>
              <span className="text-[var(--ink)]">
                {data.resources.disk_used_gb} GB / {data.resources.disk_total_gb} GB ({data.resources.disk_pct}%)
              </span>
            </div>
            <div className="w-full bg-[var(--surface-sunk)] h-1.5 rounded-[1px] overflow-hidden mt-1">
              <div
                className="bg-[var(--action)] h-full"
                style={{ width: `${data.resources.disk_pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
