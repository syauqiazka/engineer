"use client";

import React, { useState, useEffect } from "react";
import {
  History,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Ban,
  Clock,
  Terminal,
  Filter,
  Copy,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { fetchApi } from "@/lib/api";

interface StepTimeline {
  step_id: string;
  step_name: string;
  status: string;
  duration_sec: number;
  rows_in: number;
  rows_out: number;
  error_message?: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

interface RunRecord {
  id: string;
  schedule_id: string | null;
  target_type: string;
  target_id: string;
  target_name: string;
  trigger: string; // schedule, manual, backfill
  status: string; // pending, running, success, failed, cancelled
  write_mode: string;
  started_at: string;
  finished_at: string | null;
  duration_sec: number;
  rows_processed: number;
  error_message: string | null;
  step_timelines: StepTimeline[];
  logs: LogEntry[];
  pipeline_version: number;
  attempt: number;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadRuns = async () => {
    try {
      const data = await fetchApi<{ runs: RunRecord[] }>(
        `/runs${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`
      );
      setRuns(data.runs);
      if (selectedRun) {
        const refreshed = data.runs.find((r) => r.id === selectedRun.id);
        if (refreshed) setSelectedRun(refreshed);
      } else if (data.runs.length > 0) {
        setSelectedRun(data.runs[0]);
      }
    } catch {
      // Fallback sample data matching DESIGN.md
      const sampleRuns: RunRecord[] = [
        {
          id: "run-9482",
          schedule_id: "sched-orders-daily",
          target_type: "pipeline",
          target_id: "pipe-orders-daily",
          target_name: "orders_daily",
          trigger: "schedule",
          status: "failed",
          write_mode: "overwrite",
          started_at: "2026-10-08 02:00:00",
          finished_at: "2026-10-08 02:00:12",
          duration_sec: 12,
          rows_processed: 12400,
          error_message:
            "Kolom `tanggal` gagal diubah ke date: 31 baris berformat DD/MM/YYYY. Pilih format tanggal atau lewati baris tersebut.",
          step_timelines: [
            {
              step_id: "s1",
              step_name: "1. Impor dari Postgres",
              status: "ok",
              duration_sec: 4.2,
              rows_in: 0,
              rows_out: 12400,
            },
            {
              step_id: "s2",
              step_name: "2. Cast Kolom tanggal",
              status: "error",
              duration_sec: 7.8,
              rows_in: 12400,
              rows_out: 0,
              error_message: "Format mismatch: nilai '31/12/2025' tidak sesuai format ISO",
            },
          ],
          logs: [
            { timestamp: "02:00:00", level: "INFO", message: "Memulai eksekusi terjadwal pipeline 'orders_daily'" },
            { timestamp: "02:00:01", level: "INFO", message: "Menghubungkan ke sumber db_produksi_pg (Postgres)" },
            { timestamp: "02:00:04", level: "INFO", message: "Membaca 12.400 baris ke workspace staging DuckDB" },
            { timestamp: "02:00:05", level: "INFO", message: "Menjalankan step 'Cast Kolom tanggal'" },
            { timestamp: "02:00:11", level: "ERROR", message: "Cast error pada baris 1042: '31/12/2025' tidak valid untuk ISO date" },
            { timestamp: "02:00:12", level: "ERROR", message: "Eksekusi dihentikan dengan status gagal." },
          ],
          pipeline_version: 3,
          attempt: 1,
        },
        {
          id: "run-9481",
          schedule_id: "sched-pelanggan-sync",
          target_type: "pipeline",
          target_id: "pipe-sync-pelanggan",
          target_name: "sync_pelanggan",
          trigger: "schedule",
          status: "success",
          write_mode: "merge",
          started_at: "2026-10-08 01:00:00",
          finished_at: "2026-10-08 01:00:18",
          duration_sec: 18,
          rows_processed: 430,
          error_message: null,
          step_timelines: [
            { step_id: "s1", step_name: "1. Tarik Data Pelanggan Baru", status: "ok", duration_sec: 5.0, rows_in: 0, rows_out: 430 },
            { step_id: "s2", step_name: "2. Standarisasi No Telepon", status: "ok", duration_sec: 6.2, rows_in: 430, rows_out: 430 },
            { step_id: "s3", step_name: "3. Upsert ke dim_pelanggan", status: "ok", duration_sec: 6.8, rows_in: 430, rows_out: 430 },
          ],
          logs: [
            { timestamp: "01:00:00", level: "INFO", message: "Memulai sinkronisasi harian dim_pelanggan" },
            { timestamp: "01:00:06", level: "INFO", message: "Menyaring 430 data pelanggan termodifikasi" },
            { timestamp: "01:00:18", level: "INFO", message: "Berhasil merge 430 baris ke dim_pelanggan" },
          ],
          pipeline_version: 1,
          attempt: 1,
        },
        {
          id: "run-9480",
          schedule_id: null,
          target_type: "workflow",
          target_id: "wf-sensor-telemetry",
          target_name: "sensor_telemetry_clean",
          trigger: "manual",
          status: "running",
          write_mode: "append",
          started_at: "2026-10-08 05:00:00",
          finished_at: null,
          duration_sec: 45,
          rows_processed: 182000,
          error_message: null,
          step_timelines: [
            { step_id: "n1", step_name: "Source: IoT Stream", status: "ok", duration_sec: 12.0, rows_in: 0, rows_out: 182000 },
            { step_id: "n2", step_name: "Transform: Filter Outliers", status: "running", duration_sec: 33.0, rows_in: 182000, rows_out: 180400 },
          ],
          logs: [
            { timestamp: "05:00:00", level: "INFO", message: "Pemicu manual oleh user 'admin'" },
            { timestamp: "05:00:25", level: "INFO", message: "Memfilter outlier suhu (> 100 C)..." },
          ],
          pipeline_version: 2,
          attempt: 1,
        },
      ];
      setRuns(sampleRuns);
      if (!selectedRun && sampleRuns.length > 0) setSelectedRun(sampleRuns[0]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
  }, [statusFilter]);

  const handleRetry = async (runId: string) => {
    try {
      const res = await fetchApi<{ new_run: RunRecord }>(`/runs/${runId}/retry`, { method: "POST" });
      showToast(`Jalankan ulang dimulai: ${res.new_run.id}`);
      loadRuns();
    } catch {
      showToast("Menjalankan ulang run...");
    }
  };

  const handleCancel = async (runId: string) => {
    try {
      await fetchApi(`/runs/${runId}/cancel`, { method: "POST" });
      showToast(`Run ${runId} dibatalkan.`);
      loadRuns();
    } catch {
      showToast("Membatalkan run...");
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const copyLogs = () => {
    if (!selectedRun) return;
    const logText = selectedRun.logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(logText);
    showToast("Log berhasil disalin ke clipboard.");
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg)]">
      {/* Top Header */}
      <div className="h-12 border-b border-[var(--rule)] bg-[var(--surface)] px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-4 h-4 text-[var(--action)]" />
          <h1 className="text-[15px] font-semibold text-[var(--ink)]">Riwayat Run</h1>
          <span className="text-[12px] text-[var(--ink-muted)] border-l border-[var(--rule)] pl-3">
            Semua eksekusi pipeline, workflow, dan backfill
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex items-center text-[12px] bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] p-0.5">
            {[
              { id: "all", label: "Semua" },
              { id: "success", label: "Berhasil" },
              { id: "failed", label: "Gagal" },
              { id: "running", label: "Berjalan" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-0.5 rounded-[2px] text-[11.5px] cursor-pointer ${
                  statusFilter === f.id
                    ? "bg-[var(--surface)] text-[var(--ink)] font-semibold shadow-xs"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={loadRuns}
            className="h-7 w-7 border border-[var(--rule)] bg-[var(--surface)] rounded-[2px] flex items-center justify-center hover:bg-[var(--surface-sunk)] text-[var(--ink-muted)] cursor-pointer"
            title="Muat ulang riwayat"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main 2-Zone Workspace (List + Details) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Runs Table (55% width) */}
        <div className="w-[55%] border-r border-[var(--rule)] flex flex-col bg-[var(--surface)] overflow-y-auto">
          {loading ? (
            <div className="text-[13px] text-[var(--ink-muted)] py-12 text-center">Memuat riwayat run...</div>
          ) : (
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-[var(--rule)] bg-[var(--surface-sunk)] text-[var(--ink-muted)] h-8 font-medium sticky top-0 z-10">
                  <th className="px-4">Status</th>
                  <th className="px-3">Target</th>
                  <th className="px-3">Pemicu</th>
                  <th className="px-3">Mulai</th>
                  <th className="px-3 text-right">Durasi</th>
                  <th className="px-4 text-right">Baris</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)]">
                {runs.map((r) => {
                  const isSelected = selectedRun?.id === r.id;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelectedRun(r)}
                      className={`h-12 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[color-mix(in_srgb,var(--action)_10%,transparent)] font-medium"
                          : "hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)]"
                      }`}
                    >
                      {/* Status */}
                      <td className="px-4">
                        {r.status === "success" ? (
                          <span className="inline-flex items-center gap-1.5 text-[var(--ok)] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Berhasil
                          </span>
                        ) : r.status === "failed" ? (
                          <span className="inline-flex items-center gap-1.5 text-[var(--error)] font-medium">
                            <XCircle className="w-3.5 h-3.5" /> Gagal
                          </span>
                        ) : r.status === "running" ? (
                          <span className="inline-flex items-center gap-1.5 text-[var(--action)] font-medium">
                            <span className="w-2 h-2 rounded-full bg-[var(--action)] animate-pulse" /> Berjalan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[var(--ink-muted)]">
                            <Ban className="w-3.5 h-3.5" /> Batal
                          </span>
                        )}
                      </td>

                      {/* Target */}
                      <td className="px-3">
                        <div className="font-semibold text-[var(--ink)] truncate max-w-[170px]">{r.target_name}</div>
                        <div className="text-[11px] font-mono text-[var(--ink-muted)]">{r.id}</div>
                      </td>

                      {/* Trigger */}
                      <td className="px-3">
                        <span className="inline-block px-1.5 py-0.5 text-[10.5px] font-mono rounded-[2px] bg-[var(--surface-sunk)] border border-[var(--rule)] text-[var(--ink-muted)] capitalize">
                          {r.trigger === "schedule" ? "Jadwal" : r.trigger === "backfill" ? "Backfill" : "Manual"}
                        </span>
                      </td>

                      {/* Started at */}
                      <td className="px-3 font-mono text-[11px] text-[var(--ink-muted)]">
                        {r.started_at.split(" ")[1] || r.started_at}
                      </td>

                      {/* Duration */}
                      <td className="px-3 text-right font-mono text-[11px] text-[var(--ink)]">
                        {r.duration_sec} dtk
                      </td>

                      {/* Rows Processed */}
                      <td className="px-4 text-right font-mono text-[11px] text-[var(--ink)]">
                        {r.rows_processed.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right: Selected Run Inspector & Live Log Console (45% width) */}
        <div className="w-[45%] flex flex-col bg-[var(--surface)] overflow-y-auto">
          {selectedRun ? (
            <div className="flex-1 flex flex-col">
              {/* Detail Header Toolbar */}
              <div className="p-4 border-b border-[var(--rule)] bg-[var(--surface-sunk)] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold text-[var(--ink)]">{selectedRun.target_name}</span>
                    <code className="text-[11.5px] font-mono text-[var(--ink-muted)]">({selectedRun.id})</code>
                  </div>
                  <div className="text-[12px] text-[var(--ink-muted)] mt-0.5 flex items-center gap-2">
                    <span>Mulai: {selectedRun.started_at}</span>
                    {selectedRun.attempt > 1 && <span>• Percobaan ke-{selectedRun.attempt}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedRun.status === "failed" && (
                    <button
                      onClick={() => handleRetry(selectedRun.id)}
                      className="h-7 px-3 bg-[var(--action)] text-white text-[12px] font-medium rounded-[2px] flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Jalankan ulang
                    </button>
                  )}
                  {selectedRun.status === "running" && (
                    <button
                      onClick={() => handleCancel(selectedRun.id)}
                      className="h-7 px-3 border border-[var(--error)] text-[var(--error)] text-[12px] font-medium rounded-[2px] flex items-center gap-1.5 hover:bg-[var(--error-wash)] cursor-pointer"
                    >
                      <Ban className="w-3.5 h-3.5" /> Batalkan
                    </button>
                  )}
                  <button
                    onClick={copyLogs}
                    className="h-7 px-2.5 border border-[var(--rule-strong)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)] text-[12px] rounded-[2px] flex items-center gap-1"
                    title="Salin semua log"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Error Callout Banner if failed */}
              {selectedRun.error_message && (
                <div className="m-4 p-3 bg-[var(--error-wash)] border border-[var(--error)] rounded-[2px] flex items-start gap-2.5 text-[12px] text-[var(--error)]">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold mb-0.5">Penyebab kegagalan:</div>
                    <div className="font-mono leading-relaxed">{selectedRun.error_message}</div>
                  </div>
                </div>
              )}

              {/* Step Timeline Breakdown */}
              {selectedRun.step_timelines.length > 0 && (
                <div className="px-4 py-3 border-b border-[var(--rule)]">
                  <div className="text-[12px] font-semibold text-[var(--ink)] mb-2 flex items-center justify-between">
                    <span>Progres Eksekusi per Step / Node</span>
                    <span className="text-[11px] text-[var(--ink-muted)] font-normal font-mono">
                      Mode tulis: {selectedRun.write_mode}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {selectedRun.step_timelines.map((st) => (
                      <div
                        key={st.step_id}
                        className="flex items-center justify-between p-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12px]"
                      >
                        <div className="flex items-center gap-2">
                          {st.status === "ok" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--ok)] shrink-0" />
                          ) : st.status === "error" ? (
                            <XCircle className="w-3.5 h-3.5 text-[var(--error)] shrink-0" />
                          ) : st.status === "running" ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-[var(--action)] animate-pulse shrink-0" />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full bg-[var(--rule-strong)] shrink-0" />
                          )}
                          <span className="font-medium text-[var(--ink)]">{st.step_name}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[11px] text-[var(--ink-muted)]">
                          {st.rows_out > 0 && <span>{st.rows_out.toLocaleString()} baris</span>}
                          <span>{st.duration_sec}s</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Live Log Stream Console */}
              <div className="flex-1 flex flex-col p-4">
                <div className="text-[12px] font-semibold text-[var(--ink)] mb-2 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[var(--action)]" />
                  <span>Log Eksekusi Langsung</span>
                </div>
                <div className="flex-1 bg-[#11181c] text-[#dce3e1] p-3 rounded-[2px] font-mono text-[11.5px] overflow-y-auto max-h-[360px] space-y-1 shadow-inner select-text">
                  {selectedRun.logs.length === 0 ? (
                    <div className="text-[#6c7d82]">Tidak ada log tercatat.</div>
                  ) : (
                    selectedRun.logs.map((log, idx) => (
                      <div key={idx} className="flex items-start gap-2 leading-relaxed">
                        <span className="text-[#6c7d82] shrink-0 select-none">{log.timestamp}</span>
                        <span
                          className={`font-semibold shrink-0 select-none ${
                            log.level === "ERROR"
                              ? "text-[#e0807e]"
                              : log.level === "WARN"
                              ? "text-[#d99a4b]"
                              : "text-[#6dbb8f]"
                          }`}
                        >
                          [{log.level}]
                        </span>
                        <span className="break-all">{log.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[13px] text-[var(--ink-muted)]">
              Pilih baris run di sebelah kiri untuk melihat detail eksekusi & log.
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
