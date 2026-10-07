"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Search, Moon, Sun, HelpCircle, Layers, Shield, Lock } from "lucide-react";
import { useWorkspaceStore } from "@/lib/store";

export function Topbar() {
  const pathname = usePathname();
  const { setCommandPaletteOpen, activeEnv, setActiveEnv } = useWorkspaceStore();
  const [isDark, setIsDark] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [activeRole, setActiveRole] = useState<"admin" | "editor" | "viewer">("admin");

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
    }
  };

  // Breadcrumbs builder
  const getBreadcrumbs = () => {
    if (pathname === "/") return ["Beranda"];
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((s) => s.replace("_", " "));
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <>
      <header
        className={`h-[40px] px-3 flex items-center justify-between border-b border-[var(--rule)] bg-[var(--surface)] text-[var(--ink)] select-none relative ${
          activeEnv === "prod" ? "border-b-2 border-b-[var(--warn)]" : ""
        }`}
      >
        {/* Left: Breadcrumbs */}
        <div className="flex items-center gap-2 text-[13px] font-medium min-w-0">
          <Layers className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
          <div className="flex items-center gap-1.5 truncate">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-[var(--ink-muted)]">/</span>}
                <span
                  className={
                    idx === breadcrumbs.length - 1
                      ? "text-[var(--ink)] font-semibold truncate"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)] cursor-pointer truncate"
                  }
                >
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Center: Command Palette Trigger */}
        <div className="flex-1 max-w-[360px] mx-4">
          <button
            onClick={() => setCommandPaletteOpen(true)}
            className="w-full h-[28px] px-2 flex items-center justify-between text-[12px] bg-[var(--surface-sunk)] border border-[var(--rule-strong)] text-[var(--ink-muted)] hover:text-[var(--ink)] rounded-[2px] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5" />
              <span>Cari tabel, aksi, kueri...</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--surface)] border border-[var(--rule)] rounded-[2px]">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Secret Store Lock Indicator */}
          <div
            title="Secret Store Mandiri: AES-GCM 256-bit Aktif"
            className="hidden md:flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-[var(--surface-sunk)] border border-[var(--rule)] text-[var(--success)] rounded-[2px]"
          >
            <Lock className="w-3 h-3" />
            <span>AES-GCM</span>
          </div>

          {/* User Role Selector (Fase 2 RBAC) */}
          <div className="flex items-center border border-[var(--rule)] rounded-[2px] overflow-hidden text-[11px] font-mono">
            <span className="px-1.5 bg-[var(--surface-sunk)] text-[var(--ink-muted)] flex items-center gap-1">
              <Shield className="w-3 h-3" /> Peran:
            </span>
            {(["admin", "editor", "viewer"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setActiveRole(r)}
                className={`px-1.5 h-[22px] transition-colors uppercase font-bold text-[10px] ${
                  activeRole === r
                    ? r === "admin"
                      ? "bg-[var(--action)] text-white"
                      : r === "editor"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[#64748b] text-white"
                    : "bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Environment Selector Chip */}
          <div className="flex items-center border border-[var(--rule)] rounded-[2px] overflow-hidden text-[11px] font-mono">
            {(["dev", "staging", "prod"] as const).map((env) => (
              <button
                key={env}
                onClick={() => setActiveEnv(env)}
                className={`px-1.5 h-[22px] transition-colors ${
                  activeEnv === env
                    ? env === "prod"
                      ? "bg-[var(--warn)] text-white font-bold"
                      : "bg-[var(--action)] text-white font-bold"
                    : "bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {env}
              </button>
            ))}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title="Ganti tema terang/gelap"
            className="w-7 h-7 flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Keyboard Shortcuts Help */}
          <button
            onClick={() => setShowHelpModal(true)}
            title="Daftar pintasan keyboard (?)"
            className="w-7 h-7 flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px]"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[420px] bg-[var(--surface)] border border-[var(--rule-strong)] p-4 shadow-lg rounded-[2px]">
            <div className="flex justify-between items-center pb-2 border-b border-[var(--rule)]">
              <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                Pintasan Keyboard
              </h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                Tutup (Esc)
              </button>
            </div>
            <div className="py-3 flex flex-col gap-2 text-[12px]">
              <div className="flex justify-between">
                <span>Palet Perintah</span>
                <kbd className="font-mono bg-[var(--surface-sunk)] px-1 rounded-[2px]">Ctrl + K</kbd>
              </div>
              <div className="flex justify-between">
                <span>Ciutkan / Perluas Sidebar</span>
                <kbd className="font-mono bg-[var(--surface-sunk)] px-1 rounded-[2px]">Ctrl + B</kbd>
              </div>
              <div className="flex justify-between">
                <span>Jalankan Kueri</span>
                <kbd className="font-mono bg-[var(--surface-sunk)] px-1 rounded-[2px]">Ctrl + Enter</kbd>
              </div>
              <div className="flex justify-between">
                <span>Urungkan Perubahan Sel (Undo)</span>
                <kbd className="font-mono bg-[var(--surface-sunk)] px-1 rounded-[2px]">Ctrl + Z</kbd>
              </div>
              <div className="flex justify-between">
                <span>Ulangi Perubahan Sel (Redo)</span>
                <kbd className="font-mono bg-[var(--surface-sunk)] px-1 rounded-[2px]">Ctrl + Shift + Z</kbd>
              </div>
              <div className="flex justify-between">
                <span>Navigasi Pintas</span>
                <span className="font-mono text-[var(--ink-muted)]">g lalu h (Beranda), g lalu q (Kueri)</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
