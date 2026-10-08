"use client";

import React, { useState } from "react";
import {
  Settings,
  Sun,
  Moon,
  Monitor,
  Clock,
  HardDrive,
  Cpu,
  Layers,
  Check,
  Send,
} from "lucide-react";
import { fetchApi } from "@/lib/api";

export default function SettingsPage() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");
  const [density, setDensity] = useState<"compact" | "normal" | "spacious">("normal");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [diskThreshold, setDiskThreshold] = useState(85);
  const [maxJobTimeoutSec, setMaxJobTimeoutSec] = useState(3600);
  const [memoryLimitMb, setMemoryLimitMb] = useState(4096);

  // Airflow settings
  const [airflowUrl, setAirflowUrl] = useState("http://localhost:8080");
  const [airflowUser, setAirflowUser] = useState("admin");
  const [airflowPass, setAirflowPass] = useState("");
  const [airflowTesting, setAirflowTesting] = useState(false);
  const [airflowTestResult, setAirflowTestResult] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setToastMessage("Pengaturan preferensi berhasil disimpan.");
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleTestAirflow = async () => {
    setAirflowTesting(true);
    setAirflowTestResult(null);
    try {
      const res = await fetchApi<{ success: boolean; message: string }>("/airflow/test", {
        method: "POST",
        body: JSON.stringify({
          base_url: airflowUrl,
          username: airflowUser,
          password: airflowPass,
        }),
      });
      setAirflowTestResult(res.message);
    } catch {
      setAirflowTestResult("Gagal terhubung ke endpoint Airflow REST.");
    } finally {
      setAirflowTesting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-y-auto bg-[var(--bg)] p-6">
      <div className="max-w-3xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--rule)]">
          <Settings className="w-5 h-5 text-[var(--action)]" />
          <h1 className="text-[17px] font-semibold text-[var(--ink)]">Pengaturan Sistem & Preferensi</h1>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Tampilan & Tema */}
          <div className="bg-[var(--surface)] border border-[var(--rule)] p-5 rounded-[2px] space-y-4">
            <h2 className="text-[14px] font-semibold text-[var(--ink)] flex items-center gap-2">
              <Sun className="w-4 h-4 text-[var(--ink-muted)]" /> Tampilan & Tema
            </h2>

            <div>
              <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-2">Tema Warna</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "light", label: "Terang (Mineral)", icon: Sun },
                  { id: "dark", label: "Gelap (Dark Slate)", icon: Moon },
                  { id: "system", label: "Ikuti Sistem", icon: Monitor },
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setTheme(t.id as "light" | "dark" | "system")}
                      className={`p-3 border rounded-[2px] flex items-center justify-center gap-2 text-[12.5px] cursor-pointer ${
                        theme === t.id
                          ? "bg-[var(--surface-sunk)] border-[var(--action)] text-[var(--action)] font-semibold shadow-xs"
                          : "border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--surface-sunk)]"
                      }`}
                    >
                      <Icon className="w-4 h-4" /> {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-2">Kepadatan Baris Grid</label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "compact", label: "Padat (24 px)" },
                  { id: "normal", label: "Normal (28 px)" },
                  { id: "spacious", label: "Lega (36 px)" },
                ].map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setDensity(d.id as "compact" | "normal" | "spacious")}
                    className={`h-8 border rounded-[2px] text-[12px] cursor-pointer ${
                      density === d.id
                        ? "bg-[var(--surface-sunk)] border-[var(--action)] text-[var(--action)] font-semibold"
                        : "border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--surface-sunk)]"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Zona Waktu & Lokalitas */}
          <div className="bg-[var(--surface)] border border-[var(--rule)] p-5 rounded-[2px] space-y-4">
            <h2 className="text-[14px] font-semibold text-[var(--ink)] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--ink-muted)]" /> Zona Waktu & Waktu Eksekusi
            </h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-1">Zona Waktu Jadwal</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full h-8 px-2.5 text-[12.5px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                >
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB, UTC+7)</option>
                  <option value="Asia/Makassar">Asia/Makassar (WITA, UTC+8)</option>
                  <option value="Asia/Jayapura">Asia/Jayapura (WIT, UTC+9)</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-1">
                  Batas Waktu Maksimal Job (detik)
                </label>
                <input
                  type="number"
                  min={60}
                  step={60}
                  value={maxJobTimeoutSec}
                  onChange={(e) => setMaxJobTimeoutSec(Number(e.target.value))}
                  className="w-full h-8 px-2.5 text-[12.5px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                />
              </div>
            </div>
          </div>

          {/* Penjaga Sumber Daya */}
          <div className="bg-[var(--surface)] border border-[var(--rule)] p-5 rounded-[2px] space-y-4">
            <h2 className="text-[14px] font-semibold text-[var(--ink)] flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[var(--ink-muted)]" /> Penjaga Sumber Daya Komputasi
            </h2>
            <p className="text-[12px] text-[var(--ink-muted)]">
              Membatasi alokasi memori dan mendeteksi ruang penyimpanan mesin lokal agar tidak kehabisan memori secara diam-diam.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-1">
                  Ambang Peringatan Disk (%)
                </label>
                <input
                  type="number"
                  min={50}
                  max={99}
                  value={diskThreshold}
                  onChange={(e) => setDiskThreshold(Number(e.target.value))}
                  className="w-full h-8 px-2.5 text-[12.5px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-1">
                  Batas Memori DuckDB / Runner (MB)
                </label>
                <input
                  type="number"
                  min={1024}
                  step={512}
                  value={memoryLimitMb}
                  onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                  className="w-full h-8 px-2.5 text-[12.5px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                />
              </div>
            </div>
          </div>

          {/* Integrasi Apache Airflow (Self-hosted) */}
          <div className="bg-[var(--surface)] border border-[var(--rule)] p-5 rounded-[2px] space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-[var(--ink)] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[var(--ink-muted)]" /> Integrasi Apache Airflow REST
              </h2>
              <span className="text-[11px] font-mono bg-[var(--surface-sunk)] px-2 py-0.5 border border-[var(--rule)] rounded-[2px] text-[var(--ink-muted)]">
                Opsional
              </span>
            </div>
            <p className="text-[12px] text-[var(--ink-muted)]">
              Hubungkan ke server Apache Airflow open source milik Anda untuk memicu DAG dan memantau status secara langsung dari workbench.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-1">Airflow Base URL</label>
                <input
                  type="url"
                  value={airflowUrl}
                  onChange={(e) => setAirflowUrl(e.target.value)}
                  placeholder="http://localhost:8080"
                  className="w-full h-8 px-2.5 text-[12.5px] font-mono bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-1">Username</label>
                  <input
                    type="text"
                    value={airflowUser}
                    onChange={(e) => setAirflowUser(e.target.value)}
                    className="w-full h-8 px-2.5 text-[12.5px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--ink-muted)] mb-1">Password</label>
                  <input
                    type="password"
                    value={airflowPass}
                    onChange={(e) => setAirflowPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-8 px-2.5 text-[12.5px] bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] text-[var(--ink)]"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleTestAirflow}
                  disabled={airflowTesting}
                  className="h-7 px-3 bg-[var(--surface-sunk)] border border-[var(--rule-strong)] text-[12px] font-medium text-[var(--ink)] rounded-[2px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3 h-3 text-[var(--action)]" />
                  {airflowTesting ? "Menguji..." : "Uji koneksi Airflow"}
                </button>
                {airflowTestResult && (
                  <span className="text-[12px] text-[var(--ink)] font-mono">{airflowTestResult}</span>
                )}
              </div>
            </div>
          </div>

          {/* Action Save Button */}
          <div className="flex items-center justify-end">
            <button
              type="submit"
              className="h-8 px-5 bg-[var(--action)] text-[var(--action-ink)] text-[13px] font-medium rounded-[2px] flex items-center gap-1.5 hover:opacity-90 cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" /> Simpan semua preferensi
            </button>
          </div>
        </form>
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
