import React, { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { StatusBar } from "@/components/StatusBar";
import { CommandPalette } from "@/components/CommandPalette";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      {/* Primary Sidebar */}
      <Suspense fallback={<aside className="w-[232px] h-full bg-[var(--surface-sunk)] border-r border-[var(--rule)]" />}>
        <Sidebar />
      </Suspense>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Topbar 40px */}
        <Suspense fallback={<header className="h-[40px] bg-[var(--surface)] border-b border-[var(--rule)]" />}>
          <Topbar />
        </Suspense>

        {/* Workspace Active Zone */}
        <main className="flex-1 overflow-auto bg-[var(--bg)] p-3">
          <Suspense fallback={<div className="p-4 text-[12px] text-[var(--ink-muted)]">Memuat...</div>}>
            {children}
          </Suspense>
        </main>

        {/* Bottom Status Bar 24px */}
        <StatusBar />
      </div>

      {/* Global Command Palette */}
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </div>
  );
}
