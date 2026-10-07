"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderInput,
  Table as TableIcon,
  Terminal,
  GitBranch,
  Network,
  Calendar,
  History,
  ShieldCheck,
  Cable,
  Settings,
  ChevronLeft,
  ChevronRight,
  Pin,
  Clock,
} from "lucide-react";
import { useWorkspaceStore } from "@/lib/store";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { text: string; variant: "error" | "warn" | "neutral" };
}

interface NavGroup {
  groupName?: string;
  items: NavItem[];
}

export function Sidebar() {
  const pathname = usePathname();
  const { isSidebarCollapsed, toggleSidebar } = useWorkspaceStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const navGroups: NavGroup[] = [
    {
      items: [
        { name: "Beranda", href: "/", icon: LayoutDashboard },
      ],
    },
    {
      groupName: "Data",
      items: [
        { name: "Sumber", href: "/sources", icon: FolderInput },
        { name: "Tabel", href: "/tables", icon: TableIcon },
        { name: "Kueri", href: "/query", icon: Terminal },
      ],
    },
    {
      groupName: "Olah",
      items: [
        { name: "Pipeline", href: "/pipelines", icon: GitBranch },
        { name: "Workflow", href: "/workflows", icon: Network },
      ],
    },
    {
      groupName: "Operasi",
      items: [
        { name: "Jadwal", href: "/schedules", icon: Calendar },
        {
          name: "Riwayat",
          href: "/runs",
          icon: History,
          badge: { text: "2", variant: "error" },
        },
        { name: "Kualitas", href: "/quality", icon: ShieldCheck },
      ],
    },
    {
      items: [
        { name: "Koneksi", href: "/connections", icon: Cable },
        { name: "Pengaturan", href: "/settings", icon: Settings },
      ],
    },
  ];

  return (
    <aside
      className={`h-[calc(100vh-24px)] flex flex-col justify-between border-r border-[var(--rule)] bg-[var(--surface-sunk)] transition-all duration-150 ease-out select-none ${
        isSidebarCollapsed ? "w-[56px]" : "w-[232px]"
      }`}
    >
      {/* Top Section */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Workspace Brand / Selector */}
        <div className="px-3 pb-2 mb-2 border-b border-[var(--rule)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="w-5 h-5 flex items-center justify-center bg-[var(--action)] text-white text-[10px] font-mono font-bold rounded-[2px] shrink-0">
                DE
              </div>
              {!isSidebarCollapsed && (
                <div className="flex flex-col truncate">
                  <span className="text-[13px] font-semibold text-[var(--ink)] leading-tight truncate">
                    Workspace Lokal
                  </span>
                  <span className="text-[11px] text-[var(--ink-muted)] leading-none truncate">
                    DuckDB Engine
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Groups */}
        <nav className="flex flex-col gap-3 px-1.5" aria-label="Navigasi Utama">
          {navGroups.map((group, gIdx) => (
            <div key={gIdx} className="flex flex-col gap-0.5">
              {group.groupName && !isSidebarCollapsed && (
                <span className="px-2 pt-1 pb-0.5 text-[11px] font-semibold text-[var(--ink-muted)]">
                  {group.groupName}
                </span>
              )}
              {group.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={isSidebarCollapsed ? item.name : undefined}
                    className={`relative flex items-center h-[28px] px-2 text-[13px] rounded-[2px] transition-colors ${
                      isActive
                        ? "bg-[var(--surface)] text-[var(--ink)] font-semibold"
                        : "text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--ink)_6%,transparent)]"
                    }`}
                  >
                    {/* Active left indicator bar */}
                    {isActive && (
                      <span className="absolute left-0 top-1 bottom-1 w-[2px] bg-[var(--action)]" />
                    )}

                    <Icon className="w-4 h-4 shrink-0 text-[var(--ink-muted)]" />

                    {!isSidebarCollapsed && (
                      <span className="ml-2 flex-1 truncate">{item.name}</span>
                    )}

                    {/* Status badge */}
                    {!isSidebarCollapsed && item.badge && (
                      <span
                        className={`ml-auto px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-[2px] ${
                          item.badge.variant === "error"
                            ? "bg-[var(--error-wash)] text-[var(--error)]"
                            : "bg-[var(--surface-sunk)] text-[var(--ink-muted)]"
                        }`}
                      >
                        {item.badge.text}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Recent & Pinned section */}
          {!isSidebarCollapsed && (
            <div className="pt-2 mt-2 border-t border-[var(--rule)] flex flex-col gap-1">
              <span className="px-2 text-[11px] font-semibold text-[var(--ink-muted)] flex items-center gap-1">
                <Clock className="w-3 h-3" /> Tabel terbaru
              </span>
              <Link
                href="/tables/pesanan_harian"
                className="px-2 py-1 text-[12px] font-mono text-[var(--ink)] hover:bg-[var(--surface)] truncate rounded-[2px]"
              >
                pesanan_harian
              </Link>
              <Link
                href="/tables/stg_sensor"
                className="px-2 py-1 text-[12px] font-mono text-[var(--ink)] hover:bg-[var(--surface)] truncate rounded-[2px]"
              >
                stg_sensor
              </Link>

              <span className="px-2 pt-2 text-[11px] font-semibold text-[var(--ink-muted)] flex items-center gap-1">
                <Pin className="w-3 h-3" /> Disematkan
              </span>
              <Link
                href="/tables/pesanan_harian"
                className="px-2 py-1 text-[12px] font-mono text-[var(--ink)] hover:bg-[var(--surface)] truncate rounded-[2px]"
              >
                dim_pelanggan
              </Link>
            </div>
          )}
        </nav>
      </div>

      {/* Footer / Collapse Button */}
      <div className="p-2 border-t border-[var(--rule)]">
        <button
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? "Perluas sidebar (Ctrl+B)" : "Ciutkan sidebar (Ctrl+B)"}
          className="w-full h-[28px] flex items-center justify-center gap-2 px-2 text-[12px] text-[var(--ink-muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] rounded-[2px] transition-colors"
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span className="flex-1 text-left">Ciutkan</span>
              <kbd className="text-[10px] font-mono opacity-70">Ctrl+B</kbd>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
