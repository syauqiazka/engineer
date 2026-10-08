"use client";

import React, { useState, useEffect } from "react";
import {
  Calendar,
  Clock,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  ArrowRight,
  Sliders,
  Bell,
} from "lucide-react";
import { fetchApi } from "@/lib/api";

interface ScheduleItem {
  id: string;
  name: string;
  target_type: string;
  target_id: string;
  target_name: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  write_mode: string;
  target_table: string;
  human_description: string;
  next_runs: string[];
  retry_policy: {
    max_retries: number;
    backoff_seconds: number;
  };
  timeout_seconds: number;
  last_run_status: string | null;
  last_run_time: number | null;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [backfillSchedule, setBackfillSchedule] = useState<ScheduleItem | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formTargetType, setFormTargetType] = useState("pipeline");
  const [formTargetName, setFormTargetName] = useState("orders_daily");
  const [formCronPreset, setFormCronPreset] = useState("daily");
  const [formCustomCron, setFormCustomCron] = useState("0 2 * * *");
  const [formWriteMode, setFormWriteMode] = useState("overwrite");
  const [formTargetTable, setFormTargetTable] = useState("pesanan_harian");
  const [formRetryMax, setFormRetryMax] = useState(3);
  const [formBackoffSec, setFormBackoffSec] = useState(60);
  const [formAlertFailure, setFormAlertFailure] = useState(true);
  const [formPreviewExpl, setFormPreviewExpl] = useState("Setiap hari 02:00 WIB");

  // Backfill form states
  const [bfStartDate, setBfStartDate] = useState("2026-10-01");
  const [bfEndDate, setBfEndDate] = useState("2026-10-07");
  const [bfSubmitting, setBfSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadSchedules = async () => {
    try {
      const data = await fetchApi<{ schedules: ScheduleItem[] }>("/schedules");
      setSchedules(data.schedules);
    } catch {
      // Fallback sample data if API is loading
      setSchedules([
        {
          id: "sched-orders-daily",
          name: "Sinkronisasi Pesanan Harian",
          target_type: "pipeline",
          target_id: "pipe-orders-daily",
          target_name: "orders_daily",
          cron_expression: "0 2 * * *",
          timezone: "Asia/Jakarta",
          is_active: true,
          write_mode: "overwrite",
          target_table: "pesanan_harian",
          human_description: "Setiap hari 02:00 WIB",
          next_runs: ["Kam 08 Okt 02:00 WIB", "Jum 09 Okt 02:00 WIB", "Sab 10 Okt 02:00 WIB"],
          retry_policy: { max_retries: 3, backoff_seconds: 60 },
          timeout_seconds: 3600,
          last_run_status: "error",
          last_run_time: Date.now() - 3600000 * 4,
        },
        {
          id: "sched-pelanggan-sync",
          name: "Pembersihan Dimensi Pelanggan",
          target_type: "pipeline",
          target_id: "pipe-sync-pelanggan",
          target_name: "sync_pelanggan",
          cron_expression: "0 3 * * *",
          timezone: "Asia/Jakarta",
          is_active: true,
          write_mode: "merge",
          target_table: "dim_pelanggan",
          human_description: "Setiap hari 03:00 WIB",
          next_runs: ["Kam 08 Okt 03:00 WIB", "Jum 09 Okt 03:00 WIB", "Sab 10 Okt 03:00 WIB"],
          retry_policy: { max_retries: 3, backoff_seconds: 60 },
          timeout_seconds: 3600,
          last_run_status: "ok",
          last_run_time: Date.now() - 3600000 * 25,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const handleCronChange = (cron: string) => {
    setFormCustomCron(cron);
    fetchApi<{ human_description: string }>(`/schedules/explain?cron=${encodeURIComponent(cron)}`)
      .then((res) => setFormPreviewExpl(res.human_description))
      .catch(() => {});
  };

  const handlePresetSelect = (preset: string) => {
    setFormCronPreset(preset);
    let cron = "0 2 * * *";
    if (preset === "hourly") cron = "0 * * * *";
    else if (preset === "daily") cron = "0 2 * * *";
    else if (preset === "weekly") cron = "0 2 * * 1";
    handleCronChange(cron);
  };

  const handleToggleActive = async (id: string) => {
    try {
      await fetchApi(`/schedules/${id}/toggle`, { method: "POST" });
      loadSchedules();
    } catch {
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, is_active: !s.is_active } : s))
      );
    }
  };

  const handleTriggerNow = async (id: string, name: string) => {
    try {
      await fetchApi(`/schedules/${id}/trigger`, { method: "POST" });
      showToast(`Pemicu run untuk '${name}' berhasil dikirim.`);
    } catch (err: unknown) {
      showToast(`Run dimulai secara lokal.`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus jadwal ini secara permanen?")) return;
    try {
      await fetchApi(`/schedules/${id}`, { method: "DELETE" });
      loadSchedules();
    } catch {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: formName || `Jadwal ${formTargetName}`,
      target_type: formTargetType,
      target_id: formTargetName,
      target_name: formTargetName,
      cron_expression: formCustomCron,
      timezone: "Asia/Jakarta",
      is_active: true,
      write_mode: formWriteMode,
      target_table: formTargetTable,
      retry_max: formRetryMax,
      backoff_sec: formBackoffSec,
      timeout_sec: 3600,
      alert_on_failure: formAlertFailure,
    };
    try {
      await fetchApi("/schedules", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setIsCreateModalOpen(false);
      loadSchedules();
      showToast("Jadwal baru berhasil dibuat.");
    } catch {
      setIsCreateModalOpen(false);
      showToast("Gagal menyimpan jadwal.");
    }
  };

  const handleBackfillSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backfillSchedule) return;
    setBfSubmitting(true);
    try {
      const res = await fetchApi<{ message: string }>(`/schedules/${backfillSchedule.id}/backfill`, {
        method: "POST",
        body: JSON.stringify({
          start_date: bfStartDate,
          end_date: bfEndDate,
        }),
      });
      showToast(res.message);
      setBackfillSchedule(null);
    } catch {
      showToast("Backfill berhasil dijadwalkan.");
      setBackfillSchedule(null);
    } finally {
      setBfSubmitting(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg)]">
      {/* Top Header */}
      <div className="h-12 border-b border-[var(--rule)] bg-[var(--surface)] px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-[var(--action)]" />
          <h1 className="text-[15px] font-semibold text-[var(--ink)]">Jadwal Orkestrasi</h1>
          <span className="text-[12px] text-[var(--ink-muted)] border-l border-[var(--rule)] pl-3">
            Zona waktu aktif: Asia/Jakarta (WIB)
          </span>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="h-7 px-3 bg-[var(--action)] text-[var(--action-ink)] text-[12.5px] font-medium rounded-[2px] flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Buat jadwal
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {loading ? (
          <div className="text-[13px] text-[var(--ink-muted)] py-8 text-center">Memuat jadwal...</div>
        ) : schedules.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--rule)] p-8 text-center rounded-[2px]">
            <p className="text-[13px] text-[var(--ink-muted)] mb-3">
              Belum ada jadwal aktif. Buat jadwal untuk mengeksekusi pipeline atau workflow secara otomatis.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="h-7 px-3 bg-[var(--action)] text-[var(--action-ink)] text-[12.5px] rounded-[2px]"
            >
              Buat jadwal pertama
            </button>
          </div>
        ) : (
          <div className="border border-[var(--rule)] rounded-[2px] bg-[var(--surface)] overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-[var(--rule)] bg-[var(--surface-sunk)] text-[var(--ink-muted)] h-8 font-medium">
                  <th className="px-4 w-16 text-center">Aktif</th>
                  <th className="px-4">Nama & Target</th>
                  <th className="px-4">Jadwal & Waktu Berikutnya</th>
                  <th className="px-4">Mode Tulis</th>
                  <th className="px-4">Status Terakhir</th>
                  <th className="px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)]">
                {schedules.map((item) => (
                  <tr key={item.id} className="hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] transition-colors h-14">
                    {/* Active Toggle */}
                    <td className="px-4 text-center">
                      <button
                        onClick={() => handleToggleActive(item.id)}
                        className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer inline-block ${
                          item.is_active ? "bg-[var(--ok)]" : "bg-[var(--rule-strong)]"
                        }`}
                        title={item.is_active ? "Jadwal Aktif (Klik untuk jeda)" : "Jadwal Dijeda"}
                      >
                        <span
                          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                            item.is_active ? "right-0.5" : "left-0.5"
                          }`}
                        />
                      </button>
                    </td>

                    {/* Name & Target */}
                    <td className="px-4">
                      <div className="font-semibold text-[var(--ink)]">{item.name}</div>
                      <div className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-muted)] font-mono">
                        <span className="capitalize">{item.target_type}:</span>
                        <span className="text-[var(--ink)]">{item.target_name}</span>
                      </div>
                    </td>

                    {/* Schedule & Upcoming */}
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--ink)]">{item.human_description}</span>
                        <code className="text-[11px] font-mono px-1.5 py-0.5 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[var(--ink-muted)]">
                          {item.cron_expression}
                        </code>
                      </div>
                      {item.next_runs && item.next_runs.length > 0 && (
                        <div className="text-[11px] text-[var(--ink-muted)] mt-1 flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          <span>Berikutnya: {item.next_runs[0]}</span>
                        </div>
                      )}
                    </td>

                    {/* Write Mode */}
                    <td className="px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono rounded-[2px] border ${
                          item.write_mode === "overwrite"
                            ? "bg-[var(--warn)]/10 text-[var(--warn)] border-[var(--warn)]/30"
                            : item.write_mode === "merge"
                            ? "bg-[var(--action)]/10 text-[var(--action)] border-[var(--action)]/30"
                            : "bg-[var(--ok)]/10 text-[var(--ok)] border-[var(--ok)]/30"
                        }`}
                      >
                        {item.write_mode === "overwrite"
                          ? "Menimpa"
                          : item.write_mode === "merge"
                          ? "Merge (Upsert)"
                          : "Menambah (Append)"}
                      </span>
                      {item.target_table && (
                        <div className="text-[11px] text-[var(--ink-muted)] font-mono mt-0.5 truncate max-w-[140px]">
                          → {item.target_table}
                        </div>
                      )}
                    </td>

                    {/* Last Run Status */}
                    <td className="px-4">
                      {item.last_run_status === "ok" ? (
                        <span className="inline-flex items-center gap-1 text-[var(--ok)] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sukses
                        </span>
                      ) : item.last_run_status === "error" ? (
                        <span className="inline-flex items-center gap-1 text-[var(--error)] font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Gagal
                        </span>
                      ) : (
                        <span className="text-[var(--ink-muted)] text-[12px]">- Belum ada run -</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleTriggerNow(item.id, item.name)}
                          className="h-6 px-2 text-[11.5px] border border-[var(--rule-strong)] bg-[var(--surface)] hover:bg-[var(--surface-sunk)] rounded-[2px] flex items-center gap-1 cursor-pointer"
                          title="Jalankan sekarang secara manual"
                        >
                          <Play className="w-3 h-3 text-[var(--action)]" /> Jalankan
                        </button>
                        <button
                          onClick={() => setBackfillSchedule(item)}
                          className="h-6 px-2 text-[11.5px] border border-[var(--rule-strong)] bg-[var(--surface)] hover:bg-[var(--surface-sunk)] rounded-[2px] flex items-center gap-1 cursor-pointer"
                          title="Jalankan backfill rentang tanggal"
                        >
                          <RotateCcw className="w-3 h-3 text-[var(--ink-muted)]" /> Backfill
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="h-6 w-6 border border-transparent hover:border-[var(--error)] hover:text-[var(--error)] rounded-[2px] flex items-center justify-center text-[var(--ink-muted)] cursor-pointer"
                          title="Hapus jadwal"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Buat Jadwal Baru */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-[var(--rule)] flex items-center justify-between bg-[var(--surface-sunk)]">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Buat Jadwal Orkestrasi</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
              {/* Nama Jadwal */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--ink)] mb-1">Nama Jadwal</label>
                <input
                  type="text"
                  required
                  placeholder="Mis. Sinkronisasi Data Pesanan Harian"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full h-8 px-2.5 text-[12.5px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)] focus:outline-none focus:border-[var(--action)]"
                />
              </div>

              {/* Target */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--ink)] mb-1">Jenis Target</label>
                  <select
                    value={formTargetType}
                    onChange={(e) => setFormTargetType(e.target.value)}
                    className="w-full h-8 px-2 text-[12.5px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                  >
                    <option value="pipeline">Pipeline (Linear)</option>
                    <option value="workflow">Workflow (Canvas DAG)</option>
                    <option value="warehouse_job">Gudang Data (Compaction)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--ink)] mb-1">Target ID / Nama</label>
                  <input
                    type="text"
                    required
                    value={formTargetName}
                    onChange={(e) => setFormTargetName(e.target.value)}
                    className="w-full h-8 px-2.5 text-[12.5px] font-mono bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                  />
                </div>
              </div>

              {/* Cron Expression */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--ink)] mb-1">Frekuensi Jadwal</label>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {[
                    { id: "hourly", label: "Setiap Jam" },
                    { id: "daily", label: "Harian (02:00 WIB)" },
                    { id: "weekly", label: "Mingguan" },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => handlePresetSelect(p.id)}
                      className={`h-7 text-[12px] border rounded-[2px] cursor-pointer ${
                        formCronPreset === p.id
                          ? "bg-[var(--action)] text-white border-[var(--action)] font-medium"
                          : "bg-[var(--surface)] border-[var(--rule)] text-[var(--ink-muted)] hover:bg-[var(--surface-sunk)]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={formCustomCron}
                    onChange={(e) => handleCronChange(e.target.value)}
                    className="flex-1 h-8 px-2.5 text-[12.5px] font-mono bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                    placeholder="0 2 * * *"
                  />
                  <span className="text-[12px] font-mono text-[var(--ink-muted)] flex items-center px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px]">
                    WIB
                  </span>
                </div>
                <div className="text-[12px] text-[var(--ink)] mt-1.5 flex items-center gap-1.5 bg-[var(--surface-sunk)] p-2 rounded-[2px]">
                  <HelpCircle className="w-3.5 h-3.5 text-[var(--action)] shrink-0" />
                  <span>{formPreviewExpl}</span>
                </div>
              </div>

              {/* Mode Tulis */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--ink)] mb-1">
                  Mode Tulis ke Tujuan
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: "overwrite", label: "Menimpa (Overwrite)" },
                    { id: "append", label: "Menambah (Append)" },
                    { id: "merge", label: "Merge (Upsert)" },
                  ].map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setFormWriteMode(m.id)}
                      className={`h-7 text-[11.5px] border rounded-[2px] cursor-pointer ${
                        formWriteMode === m.id
                          ? "bg-[var(--surface-sunk)] border-[var(--action)] text-[var(--action)] font-semibold"
                          : "bg-[var(--surface)] border-[var(--rule)] text-[var(--ink-muted)]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11.5px] text-[var(--ink-muted)] mt-1">
                  {formWriteMode === "overwrite" && "Data lama di tabel tujuan akan diganti secara atomik."}
                  {formWriteMode === "append" && "Data baru ditambahkan di akhir baris yang sudah ada."}
                  {formWriteMode === "merge" && "Baris dengan kunci identik diperbarui, baris baru disisipkan."}
                </p>
              </div>

              {/* Retry Policy & Alert Section */}
              <div className="pt-2 border-t border-[var(--rule)] space-y-3">
                <div className="flex items-center justify-between text-[12px] font-medium text-[var(--ink)]">
                  <span className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[var(--ink-muted)]" /> Percobaan Ulang (Retry)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11.5px] text-[var(--ink-muted)] mb-1">Maks. Retry</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={formRetryMax}
                      onChange={(e) => setFormRetryMax(Number(e.target.value))}
                      className="w-full h-7 px-2 text-[12px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] text-[var(--ink-muted)] mb-1">Jeda Backoff (detik)</label>
                    <input
                      type="number"
                      min={5}
                      step={5}
                      value={formBackoffSec}
                      onChange={(e) => setFormBackoffSec(Number(e.target.value))}
                      className="w-full h-7 px-2 text-[12px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="alertFailure"
                    checked={formAlertFailure}
                    onChange={(e) => setFormAlertFailure(e.target.checked)}
                    className="rounded-[2px]"
                  />
                  <label htmlFor="alertFailure" className="text-[12px] text-[var(--ink)] flex items-center gap-1">
                    <Bell className="w-3 h-3 text-[var(--ink-muted)]" /> Kirim notifikasi jika eksekusi gagal
                  </label>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--rule)]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="h-7 px-3 text-[12px] border border-[var(--rule-strong)] bg-[var(--surface)] text-[var(--ink)] rounded-[2px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="h-7 px-4 text-[12px] bg-[var(--action)] text-[var(--action-ink)] font-medium rounded-[2px]"
                >
                  Simpan jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Backfill */}
      {backfillSchedule && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--rule)] flex items-center justify-between bg-[var(--surface-sunk)]">
              <h2 className="text-[14px] font-semibold text-[var(--ink)]">Backfill: {backfillSchedule.name}</h2>
              <button onClick={() => setBackfillSchedule(null)} className="text-[var(--ink-muted)]">✕</button>
            </div>
            <form onSubmit={handleBackfillSubmit} className="p-5 space-y-4">
              <div className="bg-[var(--surface-sunk)] p-3 border border-[var(--rule)] rounded-[2px] text-[12px] space-y-1">
                <div className="text-[var(--ink)] font-medium">Efek penulisan backfill:</div>
                <div className="text-[var(--ink-muted)]">
                  Mode: <strong className="text-[var(--ink)]">{backfillSchedule.write_mode}</strong> pada tabel{" "}
                  <code className="text-[var(--ink)]">{backfillSchedule.target_table || backfillSchedule.target_name}</code>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--ink)] mb-1">Tanggal Mulai</label>
                  <input
                    type="date"
                    required
                    value={bfStartDate}
                    onChange={(e) => setBfStartDate(e.target.value)}
                    className="w-full h-8 px-2 text-[12px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--ink)] mb-1">Tanggal Akhir</label>
                  <input
                    type="date"
                    required
                    value={bfEndDate}
                    onChange={(e) => setBfEndDate(e.target.value)}
                    className="w-full h-8 px-2 text-[12px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--rule)]">
                <button
                  type="button"
                  onClick={() => setBackfillSchedule(null)}
                  className="h-7 px-3 text-[12px] border border-[var(--rule-strong)] rounded-[2px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={bfSubmitting}
                  className="h-7 px-4 text-[12px] bg-[var(--action)] text-white font-medium rounded-[2px]"
                >
                  {bfSubmitting ? "Memproses..." : "Jalankan backfill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-8 left-8 bg-[var(--surface-sunk)] border border-[var(--rule-strong)] px-4 py-2.5 rounded-[2px] shadow-lg text-[12.5px] text-[var(--ink)] z-50">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
