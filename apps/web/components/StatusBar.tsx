"use client";

import React from "react";
import { Database, CheckCircle2 } from "lucide-react";
import { useWorkspaceStore } from "@/lib/store";

export function StatusBar() {
  const { totalRows, totalColumns, sampleStatus, runningJob } = useWorkspaceStore();

  return (
    <footer className="h-[24px] px-3 flex items-center justify-between border-t border-[var(--rule)] bg-[var(--surface-sunk)] text-[12px] text-[var(--ink-muted)] select-none">
      {/* Left: Table metrics & sampling */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[var(--ink)]">
          {totalRows.toLocaleString()} baris, {totalColumns} kolom
        </span>
        <span className="text-[var(--rule-strong)]">|</span>
        <span className="truncate">{sampleStatus}</span>
      </div>

      {/* Center: Running job */}
      <div className="flex items-center gap-2">
        {runningJob ? (
          <div className="flex items-center gap-1.5 text-[var(--action)] font-medium">
            <span className="w-2 h-2 rounded-full bg-[var(--action)] animate-pulse" />
            <span className="font-mono text-[11px]">{runningJob.name}:</span>
            <span className="text-[11px]">{runningJob.progress}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[var(--ok)]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-[11px]">Semua job selesai</span>
          </div>
        )}
      </div>

      {/* Right: Engine context */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 text-[var(--ink)] font-mono text-[11px]">
          <Database className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
          <span>DuckDB in-process</span>
        </div>
      </div>
    </footer>
  );
}
