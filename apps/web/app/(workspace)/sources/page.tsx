"use client";

import React, { useState } from "react";
import { FolderInput, Upload, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SourcesPage() {
  const router = useRouter();
  const [selectedFormat, setSelectedFormat] = useState<"csv" | "parquet" | "excel" | "json">("csv");
  const [targetTableName, setTargetTableName] = useState("raw_transaksi_baru");
  const previewRows = [
    { id: 1, kode: "TRX-001", nominal: 150000, tgl: "2026-03-01", status: "OK" },
    { id: 2, kode: "TRX-002", nominal: 220000, tgl: "2026-03-01", status: "OK" },
    { id: 3, kode: "TRX-003", nominal: 85000, tgl: "2026-03-02", status: "PENDING" },
  ];

  const handleImport = () => {
    alert(`File berhasil diimpor ke tabel '${targetTableName}' di DuckDB lokal!`);
    router.push(`/tables/${targetTableName}`);
  };

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 select-none">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--ink)] flex items-center gap-2">
            <FolderInput className="w-4 h-4 text-[var(--action)]" />
            <span>Impor Sumber Data &amp; Berkas</span>
          </h1>
          <p className="text-[12px] text-[var(--ink-muted)]">
            Unggah berkas lokal (CSV, Parquet, Excel, JSON) langsung ke engine DuckDB workspace.
          </p>
        </div>
      </div>

      {/* 2-Column Import Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Left: Upload and Settings */}
        <div className="md:col-span-5 bg-[var(--surface)] border border-[var(--rule)] p-3 rounded-[2px] flex flex-col gap-3">
          <span className="text-[12px] font-semibold text-[var(--ink)]">
            Format Berkas
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { id: "csv", label: "CSV / TSV" },
                { id: "parquet", label: "Apache Parquet" },
                { id: "excel", label: "Excel (.xlsx)" },
                { id: "json", label: "JSON Lines" },
              ] as const
            ).map((fmt) => (
              <button
                key={fmt.id}
                onClick={() => setSelectedFormat(fmt.id)}
                className={`px-3 py-2 text-[12px] font-medium border rounded-[2px] text-left transition-colors ${
                  selectedFormat === fmt.id
                    ? "border-[var(--action)] bg-[color-mix(in_srgb,var(--action)_8%,var(--surface))] text-[var(--action)] font-semibold"
                    : "border-[var(--rule-strong)] text-[var(--ink)] hover:bg-[var(--surface-sunk)]"
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>

          {/* Drag & Drop Area */}
          <div className="border-2 border-dashed border-[var(--rule-strong)] p-6 rounded-[2px] flex flex-col items-center justify-center text-center bg-[var(--surface-sunk)] hover:border-[var(--action)] cursor-pointer transition-colors">
            <Upload className="w-6 h-6 text-[var(--action)] mb-2" />
            <span className="text-[12px] font-medium text-[var(--ink)]">
              Tarik berkas ke sini atau klik untuk memilih
            </span>
            <span className="text-[11px] text-[var(--ink-muted)] mt-1">
              Maksimum 500 MB (diproses lokal di mesin Anda)
            </span>
          </div>

          {/* Target Table Name Input */}
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-[var(--ink)]">
              Nama Tabel Tujuan di Workspace
            </label>
            <input
              type="text"
              value={targetTableName}
              onChange={(e) => setTargetTableName(e.target.value)}
              className="h-[28px] px-2 bg-[var(--surface)] border border-[var(--rule-strong)] rounded-[2px] font-mono text-[12px] text-[var(--ink)] outline-none"
            />
          </div>

          <button
            onClick={handleImport}
            className="w-full h-[30px] flex items-center justify-center gap-1.5 text-[12px] font-semibold bg-[var(--action)] text-white hover:opacity-90 rounded-[2px] transition-colors mt-2"
          >
            <span>Impor ke DuckDB</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Detected Schema & 50-row Preview */}
        <div className="md:col-span-7 bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] flex flex-col overflow-hidden">
          <div className="px-3 py-2 bg-[var(--surface-sunk)] border-b border-[var(--rule)] flex justify-between items-center text-[12px]">
            <span className="font-semibold text-[var(--ink)]">
              Pratinjau Data &amp; Skema Terdeteksi
            </span>
            <span className="text-[11px] font-mono text-[var(--ink-muted)]">
              Sampel 3 baris
            </span>
          </div>

          <div className="flex-1 overflow-auto p-2">
            <table className="w-full text-[12px] border-collapse">
              <thead className="bg-[var(--surface-sunk)] border-b border-[var(--rule)]">
                <tr className="h-[26px]">
                  <th className="px-2 text-left font-mono">id (int)</th>
                  <th className="px-2 text-left font-mono">kode (txt)</th>
                  <th className="px-2 text-right font-mono">nominal (dec)</th>
                  <th className="px-2 text-left font-mono">tgl (date)</th>
                  <th className="px-2 text-left font-mono">status (txt)</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r) => (
                  <tr key={r.id} className="h-[26px] border-b border-[var(--rule)]">
                    <td className="px-2 font-mono">{r.id}</td>
                    <td className="px-2 font-mono">{r.kode}</td>
                    <td className="px-2 font-mono text-right">{r.nominal.toLocaleString()}</td>
                    <td className="px-2 font-mono">{r.tgl}</td>
                    <td className="px-2 font-mono">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
