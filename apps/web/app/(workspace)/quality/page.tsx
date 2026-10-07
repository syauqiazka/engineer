"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Play,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ChevronRight,
  Eye,
  Info,
} from "lucide-react";
import { fetchApi } from "@/lib/api";

interface QualityRule {
  id: string;
  table_name: string;
  column_name: string | null;
  rule_type: string;
  params: Record<string, unknown>;
  severity: "error" | "warn";
  description: string;
  created_at: string;
}

interface RuleEvaluationResult {
  rule_id: string;
  table_name: string;
  column_name: string | null;
  rule_type: string;
  passed: boolean;
  total_rows: number;
  failed_rows: number;
  failure_rate: number;
  message: string;
  severity: "error" | "warn";
  sample_violations: Record<string, unknown>[];
  evaluated_at: string;
}

interface TableQualityReport {
  table_name: string;
  health_score: number;
  total_rules: number;
  passed_rules: number;
  failed_rules: number;
  results: RuleEvaluationResult[];
}

interface QualityOverviewResponse {
  global_health_score: number;
  total_rules: number;
  total_passed: number;
  total_failed: number;
  tables: TableQualityReport[];
}

export default function QualityPage() {
  const [overview, setOverview] = useState<QualityOverviewResponse | null>(null);
  const [rules, setRules] = useState<QualityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [selectedViolations, setSelectedViolations] = useState<RuleEvaluationResult | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [formTable, setFormTable] = useState("pesanan_harian");
  const [formColumn, setFormColumn] = useState("");
  const [formType, setFormType] = useState("not_null");
  const [formSeverity, setFormSeverity] = useState<"error" | "warn">("error");
  const [formDescription, setFormDescription] = useState("");
  const [formParamVal, setFormParamVal] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewData, rulesData] = await Promise.all([
        fetchApi<QualityOverviewResponse>("/quality/overview"),
        fetchApi<QualityRule[]>("/quality/rules"),
      ]);
      setOverview(overviewData);
      setRules(rulesData);
    } catch (err) {
      console.error("Gagal memuat aturan kualitas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunAll = async () => {
    try {
      setEvaluating(true);
      const overviewData = await fetchApi<QualityOverviewResponse>("/quality/overview");
      setOverview(overviewData);
    } catch (err) {
      console.error("Gagal menjalankan uji kualitas:", err);
    } finally {
      setEvaluating(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm("Hapus aturan kualitas ini?")) return;
    try {
      await fetchApi(`/quality/rules/${ruleId}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      alert("Gagal menghapus aturan: " + err);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const params: Record<string, unknown> = {};
      if (formType === "range") {
        const parts = formParamVal.split(",");
        if (parts[0]) params["min"] = Number(parts[0]);
        if (parts[1]) params["max"] = Number(parts[1]);
      } else if (formType === "allowed_values") {
        params["values"] = formParamVal.split(",").map((s) => s.trim());
      } else if (formType === "custom_sql") {
        params["sql"] = formParamVal;
      } else if (formType === "row_count_min") {
        params["min_count"] = Number(formParamVal) || 1;
      }

      await fetchApi("/quality/rules", {
        method: "POST",
        body: JSON.stringify({
          table_name: formTable,
          column_name: formColumn || null,
          rule_type: formType,
          severity: formSeverity,
          description: formDescription,
          params,
        }),
      });

      setShowAddModal(false);
      setFormDescription("");
      setFormParamVal("");
      await loadData();
    } catch (err) {
      alert("Gagal membuat aturan: " + err);
    }
  };

  // Peta evaluasi per rule id
  const evaluationMap = React.useMemo(() => {
    const map = new Map<string, RuleEvaluationResult>();
    if (overview) {
      for (const t of overview.tables) {
        for (const r of t.results) {
          map.set(r.rule_id, r);
        }
      }
    }
    return map;
  }, [overview]);

  return (
    <div className="flex flex-col h-full gap-4 max-w-7xl mx-auto overflow-y-auto">
      {/* Header & Global Scorecards */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] pb-3">
        <div>
          <h1 className="text-[18px] font-bold text-[var(--ink)] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[var(--action)]" />
            Kualitas & Validasi Data (Fase 2)
          </h1>
          <p className="text-[12px] text-[var(--ink-muted)]">
            Pengujian integritas data in-engine (DuckDB) tanpa pihak ketiga.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-[var(--surface)] border border-[var(--rule)] text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Aturan
          </button>
          <button
            onClick={handleRunAll}
            disabled={evaluating}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-semibold bg-[var(--action)] text-white hover:bg-[var(--action-hover)] disabled:opacity-50 rounded-[2px]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? "animate-spin" : ""}`} />
            {evaluating ? "Menguji..." : "Jalankan Semua Uji"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 bg-[var(--surface)] border border-[var(--rule)] rounded-[3px] flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-[var(--ink-muted)]">Skor Kesehatan Global</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-[24px] font-bold text-[var(--ink)] font-mono">
              {overview?.global_health_score ?? 100}%
            </span>
            <span className="text-[11px] text-[var(--success)] font-medium">Bebas Pelanggaran Kritis</span>
          </div>
        </div>

        <div className="p-3 bg-[var(--surface)] border border-[var(--rule)] rounded-[3px] flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-[var(--ink-muted)]">Total Aturan Aktif</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-[24px] font-bold text-[var(--ink)] font-mono">
              {rules.length}
            </span>
            <span className="text-[11px] text-[var(--ink-muted)]">di seluruh tabel</span>
          </div>
        </div>

        <div className="p-3 bg-[var(--surface)] border border-[var(--rule)] rounded-[3px] flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-[var(--ink-muted)]">Aturan Lulus</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-[24px] font-bold text-[var(--success)] font-mono">
              {overview?.total_passed ?? 0}
            </span>
            <span className="text-[11px] text-[var(--ink-muted)]">aturan terverifikasi</span>
          </div>
        </div>

        <div className="p-3 bg-[var(--surface)] border border-[var(--rule)] rounded-[3px] flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-[var(--ink-muted)]">Pelanggaran Ditemukan</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className={`text-[24px] font-bold font-mono ${(overview?.total_failed ?? 0) > 0 ? "text-[var(--error)]" : "text-[var(--ink-muted)]"}`}>
              {overview?.total_failed ?? 0}
            </span>
            <span className="text-[11px] text-[var(--ink-muted)]">butuh perbaikan</span>
          </div>
        </div>
      </div>

      {/* Rules Table */}
      <div className="border border-[var(--rule)] rounded-[3px] overflow-hidden bg-[var(--surface)]">
        <div className="px-3 py-2 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[var(--ink)]">Daftar Aturan Kualitas & Status</span>
          <span className="text-[11px] text-[var(--ink-muted)]">{rules.length} aturan terdaftar</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--rule)] bg-[var(--surface-sunk)] text-[var(--ink-muted)] font-mono text-[11px]">
                <th className="py-2 px-3">Tabel / Kolom</th>
                <th className="py-2 px-3">Jenis Aturan</th>
                <th className="py-2 px-3">Deskripsi</th>
                <th className="py-2 px-3">Severity</th>
                <th className="py-2 px-3">Hasil Evaluasi</th>
                <th className="py-2 px-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const evalRes = evaluationMap.get(rule.id);
                return (
                  <tr
                    key={rule.id}
                    className="border-b border-[var(--rule)] hover:bg-[var(--surface-sunk)] transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col">
                        <span className="font-mono font-medium text-[var(--ink)]">{rule.table_name}</span>
                        {rule.column_name && (
                          <span className="font-mono text-[11px] text-[var(--action)]">.{rule.column_name}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded text-[11px] font-mono font-semibold uppercase text-[var(--ink)]">
                        {rule.rule_type.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[var(--ink-muted)]">
                      {rule.description || "-"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          rule.severity === "error"
                            ? "bg-[var(--error-wash)] text-[var(--error)]"
                            : "bg-[var(--surface-sunk)] text-[var(--accent)]"
                        }`}
                      >
                        {rule.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {evalRes ? (
                        evalRes.passed ? (
                          <div className="flex items-center gap-1.5 text-[var(--success)] font-medium">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Lulus (0 pelanggaran)</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 text-[var(--error)] font-medium">
                              <XCircle className="w-4 h-4" />
                              <span>{evalRes.failed_rows} baris ({Math.round(evalRes.failure_rate * 100)}%)</span>
                            </div>
                            {evalRes.sample_violations.length > 0 && (
                              <button
                                onClick={() => setSelectedViolations(evalRes)}
                                className="flex items-center gap-1 text-[11px] text-[var(--action)] underline"
                              >
                                <Eye className="w-3 h-3" /> Lihat Baris
                              </button>
                            )}
                          </div>
                        )
                      ) : (
                        <span className="text-[var(--ink-muted)] italic">Belum diuji</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1 text-[var(--ink-muted)] hover:text-[var(--error)] transition-colors rounded"
                        title="Hapus Aturan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Violation Inspector Modal / Drawer */}
      {selectedViolations && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-3 border-b border-[var(--rule)] bg-[var(--surface-sunk)]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--error)]" />
                <span className="text-[13px] font-bold text-[var(--ink)]">
                  Sampel Baris Melanggar ({selectedViolations.table_name})
                </span>
              </div>
              <button
                onClick={() => setSelectedViolations(null)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-[12px]"
              >
                ✕ Tutup
              </button>
            </div>
            <div className="p-3 text-[12px] text-[var(--ink-muted)] bg-[var(--error-wash)] border-b border-[var(--error)]">
              {selectedViolations.message}
            </div>
            <div className="flex-1 overflow-auto p-3">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-[var(--rule)] text-[var(--ink-muted)]">
                    {Object.keys(selectedViolations.sample_violations[0] || {}).map((col) => (
                      <th key={col} className="p-1.5">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedViolations.sample_violations.map((row, idx) => (
                    <tr key={idx} className="border-b border-[var(--rule)] hover:bg-[var(--surface-sunk)]">
                      {Object.values(row).map((val, cIdx) => (
                        <td key={cIdx} className="p-1.5 text-[var(--ink)]">
                          {val === null ? <span className="text-[var(--error)]">NULL</span> : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateRule}
            className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] max-w-md w-full shadow-2xl p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2">
              <span className="text-[13px] font-bold text-[var(--ink)]">Tambah Aturan Kualitas Baru</span>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)] text-[12px]"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[var(--ink-muted)]">Tabel Target</label>
              <input
                type="text"
                value={formTable}
                onChange={(e) => setFormTable(e.target.value)}
                required
                className="h-8 px-2.5 bg-[var(--surface-sunk)] border border-[var(--rule)] text-[12px] rounded-[2px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[var(--ink-muted)]">Nama Kolom (Opsional jika table-level)</label>
              <input
                type="text"
                value={formColumn}
                onChange={(e) => setFormColumn(e.target.value)}
                placeholder="mis. id, total_harga, status_bayar"
                className="h-8 px-2.5 bg-[var(--surface-sunk)] border border-[var(--rule)] text-[12px] rounded-[2px]"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[var(--ink-muted)]">Jenis Aturan</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="h-8 px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] text-[12px] rounded-[2px]"
              >
                <option value="not_null">NOT NULL (Tidak boleh null)</option>
                <option value="unique">UNIQUE (Harus unik)</option>
                <option value="range">RANGE (Nilai minimum / maksimum)</option>
                <option value="allowed_values">ALLOWED VALUES (Enum daftar nilai)</option>
                <option value="row_count_min">ROW COUNT MIN (Jumlah baris minimum)</option>
                <option value="custom_sql">CUSTOM SQL (Predikat SQL kustom)</option>
              </select>
            </div>

            {/* Dynamic Parameter Input */}
            {formType === "range" && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--ink-muted)]">Rentang (min,max)</label>
                <input
                  type="text"
                  value={formParamVal}
                  onChange={(e) => setFormParamVal(e.target.value)}
                  placeholder="mis. 0,10000000"
                  className="h-8 px-2.5 bg-[var(--surface-sunk)] border border-[var(--rule)] text-[12px] rounded-[2px]"
                />
              </div>
            )}

            {formType === "allowed_values" && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--ink-muted)]">Nilai yang diizinkan (dipisah koma)</label>
                <input
                  type="text"
                  value={formParamVal}
                  onChange={(e) => setFormParamVal(e.target.value)}
                  placeholder="mis. Lunas, Pending, Gagal"
                  className="h-8 px-2.5 bg-[var(--surface-sunk)] border border-[var(--rule)] text-[12px] rounded-[2px]"
                />
              </div>
            )}

            {formType === "custom_sql" && (
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-[var(--ink-muted)]">Kondisi SQL (Harus True)</label>
                <input
                  type="text"
                  value={formParamVal}
                  onChange={(e) => setFormParamVal(e.target.value)}
                  placeholder="mis. jumlah >= 1 AND total_harga > 0"
                  className="h-8 px-2.5 bg-[var(--surface-sunk)] border border-[var(--rule)] text-[12px] rounded-[2px]"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[var(--ink-muted)]">Tingkat Keparahan (Severity)</label>
              <select
                value={formSeverity}
                onChange={(e) => setFormSeverity(e.target.value as "error" | "warn")}
                className="h-8 px-2 bg-[var(--surface-sunk)] border border-[var(--rule)] text-[12px] rounded-[2px]"
              >
                <option value="error">Error (Kritis)</option>
                <option value="warn">Peringatan (Warning)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-[var(--ink-muted)]">Deskripsi / Alasan</label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="mis. Validasi konsistensi pembayaran"
                className="h-8 px-2.5 bg-[var(--surface-sunk)] border border-[var(--rule)] text-[12px] rounded-[2px]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--rule)]">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-[12px] bg-[var(--surface-sunk)] text-[var(--ink)] rounded-[2px]"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-3.5 py-1.5 text-[12px] font-semibold bg-[var(--action)] text-white hover:bg-[var(--action-hover)] rounded-[2px]"
              >
                Simpan Aturan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
