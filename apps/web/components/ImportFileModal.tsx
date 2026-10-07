"use client";

/**
 * ImportFileModal: drag-and-drop uploader untuk CSV/TSV/Excel/JSON/Parquet.
 * Menampilkan preview nama file + ukuran, dan memanggil POST /api/files/import.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  File,
  X,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";

const SUPPORTED = new Set([".csv", ".tsv", ".txt", ".xlsx", ".xls", ".json", ".ndjson", ".parquet"]);

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["xlsx", "xls"].includes(ext)) return <FileSpreadsheet size={20} />;
  if (["csv", "tsv", "txt"].includes(ext)) return <FileText size={20} />;
  return <File size={20} />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ImportResult {
  success: boolean;
  table_name: string;
  row_count: number;
  column_count: number;
  message: string;
}

export interface ImportFileModalProps {
  onClose: () => void;
  onSuccess: (tableName: string) => void;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export default function ImportFileModal({
  onClose,
  onSuccess,
}: ImportFileModalProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [tableName, setTableName] = useState("");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() || "");
    if (!SUPPORTED.has(ext)) {
      setErrorMsg(`Format tidak didukung: ${ext}. Gunakan: CSV, TSV, Excel, JSON, NDJSON, atau Parquet.`);
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      setErrorMsg("File terlalu besar. Batas: 200 MB.");
      return;
    }
    setErrorMsg("");
    setSelectedFile(file);
    // Sugesti nama tabel dari nama file
    const stem = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_]/g, "_");
    setTableName(stem);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploadState("uploading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (tableName.trim()) {
      formData.append("table_name", tableName.trim());
    }

    try {
      const res = await fetch("http://localhost:8000/api/files/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Gagal mengimpor file.");
      }
      setResult(data as ImportResult);
      setUploadState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Terjadi kesalahan.");
      setUploadState("error");
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Import File"
    >
      <div className="modal-panel import-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <Upload size={18} />
            <span>Impor File ke Workspace</span>
          </div>
          <button onClick={onClose} className="modal-close" aria-label="Tutup">
            <X size={16} />
          </button>
        </div>

        {/* Success state */}
        {uploadState === "success" && result ? (
          <div className="import-success">
            <div className="import-success-icon">
              <Check size={32} />
            </div>
            <h3>Berhasil diimpor!</h3>
            <p className="import-success-table">{result.table_name}</p>
            <div className="import-success-stats">
              <span>{result.row_count.toLocaleString("id-ID")} baris</span>
              <span>·</span>
              <span>{result.column_count} kolom</span>
            </div>
            <p className="import-success-msg">{result.message}</p>
            <div className="import-success-actions">
              <button
                className="btn btn-primary"
                onClick={() => onSuccess(result.table_name)}
              >
                Lihat Tabel
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setUploadState("idle");
                  setSelectedFile(null);
                  setResult(null);
                  setTableName("");
                }}
              >
                Impor Lagi
              </button>
            </div>
          </div>
        ) : (
          <div className="import-body">
            {/* Drop zone */}
            <div
              className={`import-dropzone ${dragOver ? "drag-over" : ""} ${selectedFile ? "has-file" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !selectedFile && fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Area upload file"
              onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.ndjson,.parquet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                aria-label="Pilih file"
              />
              {selectedFile ? (
                <div className="import-file-preview">
                  <div className="import-file-icon">
                    {getFileIcon(selectedFile.name)}
                  </div>
                  <div className="import-file-info">
                    <span className="import-file-name">{selectedFile.name}</span>
                    <span className="import-file-size">{formatBytes(selectedFile.size)}</span>
                  </div>
                  <button
                    className="import-file-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setUploadState("idle");
                    }}
                    aria-label="Hapus file yang dipilih"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="import-dropzone-content">
                  <div className="import-dropzone-icon">
                    <Upload size={28} />
                  </div>
                  <p className="import-dropzone-text">
                    Seret file ke sini atau{" "}
                    <span className="import-dropzone-link">klik untuk memilih</span>
                  </p>
                  <p className="import-dropzone-hint">
                    CSV · TSV · Excel · JSON · NDJSON · Parquet · Maks. 200 MB
                  </p>
                </div>
              )}
            </div>

            {/* Table name input */}
            {selectedFile && (
              <div className="import-table-name">
                <label htmlFor="import-table-name-input" className="import-label">
                  Nama Tabel
                </label>
                <input
                  id="import-table-name-input"
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="import-input"
                  placeholder="nama_tabel_baru"
                  pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                  aria-describedby="table-name-hint"
                />
                <p id="table-name-hint" className="import-input-hint">
                  Hanya huruf, angka, dan underscore. Otomatis diisi dari nama file.
                </p>
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <div className="import-error" role="alert">
                <AlertCircle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Actions */}
            <div className="import-actions">
              <button className="btn btn-ghost" onClick={onClose}>
                Batal
              </button>
              <button
                id="import-submit-btn"
                className="btn btn-primary"
                disabled={!selectedFile || uploadState === "uploading"}
                onClick={handleUpload}
              >
                {uploadState === "uploading" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Mengimpor…
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    Impor ke Workspace
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
