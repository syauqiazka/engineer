"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Database,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";

const API = "http://localhost:8000/api";

interface ConnectionDetail {
  id: string;
  name: string;
  kind: string;
  environment: string;
  host: string;
  port?: number;
  database: string;
  username: string;
  read_only: boolean;
  status: string;
  capabilities?: Record<string, boolean>;
}

interface TestResult {
  success: boolean;
  message: string;
  server_version?: string;
  latency_ms?: number;
  read_only?: boolean;
}

const KIND_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL / MariaDB",
  duckdb: "DuckDB (workspace)",
  files: "File lokal",
  kafka: "Kafka",
  mongodb: "MongoDB",
};

const KIND_DEFAULT_PORT: Record<string, number> = {
  postgres: 5432,
  mysql: 3306,
  mongodb: 27017,
};

const ENV_COLORS: Record<string, string> = {
  dev: "var(--ok)",
  staging: "var(--warn)",
  prod: "var(--error)",
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionDetail[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    name: "",
    kind: "postgres",
    environment: "dev",
    host: "",
    port: "",
    database: "",
    username: "",
    password: "",
    read_only: true,
  });
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [adhocTestResult, setAdhocTestResult] = useState<TestResult | null>(null);
  const [isAdhocTesting, setIsAdhocTesting] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch(`${API}/connections`);
      const data = await res.json();
      setConnections(data);
    } catch {
      // pakai data kosong
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleTestSaved = async (connId: string) => {
    setTestingId(connId);
    try {
      const res = await fetch(`${API}/connections/${connId}/test`, { method: "POST" });
      const data: TestResult = await res.json();
      setTestResults((prev) => ({ ...prev, [connId]: data }));
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [connId]: { success: false, message: String(e) },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (connId: string) => {
    if (!confirm("Hapus koneksi ini?")) return;
    setDeletingId(connId);
    try {
      await fetch(`${API}/connections/${connId}`, { method: "DELETE" });
      setConnections((prev) => prev.filter((c) => c.id !== connId));
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const handleAdhocTest = async () => {
    setIsAdhocTesting(true);
    setAdhocTestResult(null);
    try {
      const body = {
        kind: form.kind,
        host: form.host,
        port: form.port ? parseInt(form.port) : KIND_DEFAULT_PORT[form.kind],
        database: form.database,
        username: form.username,
        password: form.password,
        read_only: form.read_only,
      };
      const res = await fetch(`${API}/connections/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data: TestResult = await res.json();
      setAdhocTestResult(data);
    } catch (e) {
      setAdhocTestResult({ success: false, message: String(e) });
    } finally {
      setIsAdhocTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Nama koneksi harus diisi.");
      return;
    }
    if (form.kind !== "duckdb" && !form.host.trim()) {
      setFormError("Host harus diisi.");
      return;
    }
    setFormError("");
    setIsSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        kind: form.kind,
        environment: form.environment,
        host: form.host,
        port: form.port ? parseInt(form.port) : KIND_DEFAULT_PORT[form.kind],
        database: form.database,
        username: form.username,
        password: form.password,
        read_only: form.read_only,
      };
      const res = await fetch(`${API}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Gagal menyimpan koneksi.");
      }
      await loadConnections();
      setShowForm(false);
      setForm({ name: "", kind: "postgres", environment: "dev", host: "", port: "", database: "", username: "", password: "", read_only: true });
      setAdhocTestResult(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold text-[var(--ink)]">Koneksi Data</h1>
          <p className="text-[12px] text-[var(--ink-muted)]">
            Kelola koneksi ke sumber data eksternal. Kredensial tidak pernah dikirim ke frontend setelah disimpan.
          </p>
        </div>
        <button
          id="add-connection-btn"
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 h-[28px] text-[12px] font-medium bg-[var(--action)] text-white hover:opacity-90 rounded-[2px]"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Koneksi
        </button>
      </div>

      {/* Add Connection Form */}
      {showForm && (
        <div className="bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] p-4">
          <h2 className="text-[14px] font-semibold text-[var(--ink)] mb-3">Koneksi Baru</h2>
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              {/* Nama */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Nama</label>
                <input
                  id="conn-name-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="db_produksi"
                  className="h-[30px] px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--action)]"
                />
              </div>

              {/* Jenis */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Jenis</label>
                <select
                  id="conn-kind-select"
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value, port: String(KIND_DEFAULT_PORT[e.target.value] || "") }))}
                  className="h-[30px] px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--action)]"
                >
                  {Object.entries(KIND_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Lingkungan */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Lingkungan</label>
                <select
                  id="conn-env-select"
                  value={form.environment}
                  onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
                  className="h-[30px] px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--action)]"
                >
                  <option value="dev">dev</option>
                  <option value="staging">staging</option>
                  <option value="prod">prod ⚠️</option>
                </select>
              </div>
            </div>

            {form.kind !== "duckdb" && (
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Host</label>
                  <input
                    id="conn-host-input"
                    value={form.host}
                    onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                    placeholder="localhost"
                    className="h-[30px] px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--action)] font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Port</label>
                  <input
                    id="conn-port-input"
                    value={form.port}
                    onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                    placeholder={String(KIND_DEFAULT_PORT[form.kind] || "")}
                    className="h-[30px] px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--action)] font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Database</label>
                  <input
                    id="conn-db-input"
                    value={form.database}
                    onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))}
                    placeholder="mydb"
                    className="h-[30px] px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--action)] font-mono"
                  />
                </div>
              </div>
            )}

            {form.kind !== "duckdb" && (
              <div className="grid grid-cols-3 gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Username</label>
                  <input
                    id="conn-user-input"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="postgres"
                    className="h-[30px] px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--action)] font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <input
                      id="conn-password-input"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder="••••••••"
                      className="w-full h-[30px] px-2 pr-8 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] text-[12.5px] text-[var(--ink)] outline-none focus:border-[var(--action)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink)]"
                      aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    >
                      {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 h-[30px]">
                  <input
                    id="conn-readonly-check"
                    type="checkbox"
                    checked={form.read_only}
                    onChange={(e) => setForm((f) => ({ ...f, read_only: e.target.checked }))}
                    className="grid-checkbox"
                  />
                  <label htmlFor="conn-readonly-check" className="text-[12px] text-[var(--ink)] cursor-pointer select-none">
                    Read-only
                  </label>
                </div>
              </div>
            )}

            {/* Adhoc test result */}
            {adhocTestResult && (
              <div className={`flex items-center gap-2 p-2 rounded-[2px] text-[12px] border ${adhocTestResult.success ? "bg-[color-mix(in_srgb,var(--ok)_10%,var(--surface))] border-[var(--ok)] text-[var(--ok)]" : "bg-[var(--error-wash)] border-[var(--error)] text-[var(--error)]"}`}>
                {adhocTestResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                <span>{adhocTestResult.message}</span>
                {adhocTestResult.latency_ms && (
                  <span className="ml-auto font-mono opacity-70">{adhocTestResult.latency_ms} ms</span>
                )}
              </div>
            )}

            {formError && (
              <p className="text-[12px] text-[var(--error)]">{formError}</p>
            )}

            <div className="flex justify-between items-center pt-1">
              <button
                type="button"
                id="test-connection-btn"
                onClick={handleAdhocTest}
                disabled={isAdhocTesting}
                className="flex items-center gap-1.5 px-3 h-[28px] text-[12px] bg-[var(--surface-sunk)] border border-[var(--rule-strong)] text-[var(--ink)] hover:bg-[var(--rule)] rounded-[2px] disabled:opacity-50"
              >
                {isAdhocTesting ? <Loader2 size={13} className="animate-spin" /> : <Database size={13} />}
                Test Koneksi
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">Batal</button>
                <button type="submit" id="save-connection-btn" disabled={isSaving} className="btn btn-primary">
                  {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Simpan
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Connections list */}
      <div className="flex flex-col gap-2">
        {connections.length === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] py-10 text-center text-[13px] text-[var(--ink-muted)]">
            Belum ada koneksi. Klik &quot;Tambah Koneksi&quot; untuk memulai.
          </div>
        ) : (
          connections.map((conn) => {
            const tr = testResults[conn.id];
            const isTesting = testingId === conn.id;
            return (
              <div
                key={conn.id}
                className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] p-3 flex items-center gap-3"
              >
                {/* Icon + Kind */}
                <div className="flex items-center justify-center w-[36px] h-[36px] bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[2px] shrink-0">
                  <Database className="w-4 h-4 text-[var(--action)]" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-[13px] text-[var(--ink)]">
                      {conn.name}
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--surface-sunk)] text-[var(--ink-muted)] rounded-[2px]">
                      {KIND_LABELS[conn.kind] || conn.kind}
                    </span>
                    <span
                      className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-[2px]"
                      style={{
                        background: `color-mix(in srgb, ${ENV_COLORS[conn.environment] || "var(--ink-muted)"} 15%, var(--surface-sunk))`,
                        color: ENV_COLORS[conn.environment] || "var(--ink-muted)",
                      }}
                    >
                      {conn.environment}
                    </span>
                    {conn.read_only && (
                      <span className="px-1 py-0.5 text-[9px] font-mono text-[var(--ink-muted)] border border-[var(--rule)] rounded-[2px]">
                        read-only
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] font-mono text-[var(--ink-muted)] mt-0.5 truncate">
                    {conn.host}{conn.port ? `:${conn.port}` : ""}{conn.database ? `/${conn.database}` : ""}
                  </p>

                  {/* Test result inline */}
                  {tr && (
                    <div className={`flex items-center gap-1.5 mt-1 text-[11px] ${tr.success ? "text-[var(--ok)]" : "text-[var(--error)]"}`}>
                      {tr.success ? <CheckCircle size={11} /> : <XCircle size={11} />}
                      <span>{tr.message}</span>
                      {tr.latency_ms && <span className="font-mono opacity-70">· {tr.latency_ms} ms</span>}
                      {tr.server_version && <span className="font-mono opacity-50">· {tr.server_version}</span>}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleTestSaved(conn.id)}
                    disabled={isTesting}
                    className="flex items-center gap-1 px-2.5 h-[26px] text-[11.5px] bg-[var(--surface-sunk)] border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--rule)] rounded-[2px] transition-colors disabled:opacity-50"
                    aria-label={`Test koneksi ${conn.name}`}
                  >
                    {isTesting ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                    Test
                  </button>
                  <button
                    onClick={() => handleDelete(conn.id)}
                    disabled={deletingId === conn.id}
                    className="flex items-center justify-center w-[26px] h-[26px] bg-[var(--surface-sunk)] border border-[var(--rule)] text-[var(--ink-muted)] hover:text-[var(--error)] hover:border-[var(--error)] rounded-[2px] transition-colors"
                    aria-label={`Hapus koneksi ${conn.name}`}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
