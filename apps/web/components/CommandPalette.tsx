"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Table, Terminal, GitBranch, Cable, FileText } from "lucide-react";
import { useWorkspaceStore } from "@/lib/store";

interface CommandItem {
  id: string;
  title: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const { isCommandPaletteOpen, setCommandPaletteOpen } = useWorkspaceStore();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items: CommandItem[] = [
    {
      id: "tbl-pesanan",
      title: "Buka tabel pesanan_harian",
      category: "Tabel",
      icon: Table,
      href: "/tables/pesanan_harian",
    },
    {
      id: "tbl-sensor",
      title: "Buka tabel stg_sensor",
      category: "Tabel",
      icon: Table,
      href: "/tables/stg_sensor",
    },
    {
      id: "action-query",
      title: "Tulis Kueri SQL Baru",
      category: "Aksi",
      icon: Terminal,
      href: "/query",
    },
    {
      id: "action-pipeline",
      title: "Buka Pipeline Pembersihan Data",
      category: "Olah",
      icon: GitBranch,
      href: "/pipelines",
    },
    {
      id: "action-import",
      title: "Impor Data File (CSV, Parquet, Excel)",
      category: "Aksi",
      icon: FileText,
      href: "/sources",
    },
    {
      id: "action-conn",
      title: "Kelola Koneksi Database",
      category: "Koneksi",
      icon: Cable,
      href: "/connections",
    },
  ];

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      } else if (e.key === "Escape" && isCommandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      inputRef.current?.focus();
    }
  }, [isCommandPaletteOpen]);

  const handleSelect = (item: CommandItem) => {
    setCommandPaletteOpen(false);
    if (item.href) {
      router.push(item.href);
    } else if (item.action) {
      item.action();
    }
  };

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
      e.preventDefault();
      handleSelect(filteredItems[selectedIndex]);
    }
  };

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/40"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-[520px] bg-[var(--surface)] border border-[var(--rule-strong)] shadow-xl rounded-[2px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleListKeyDown}
      >
        {/* Search Input */}
        <div className="flex items-center px-3 border-b border-[var(--rule)] h-[36px]">
          <Search className="w-4 h-4 text-[var(--ink-muted)] shrink-0 mr-2" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Cari tabel, kueri, atau jalankan perintah..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-[13px] text-[var(--ink)] placeholder-[var(--ink-muted)] outline-none"
          />
          <kbd className="text-[10px] font-mono text-[var(--ink-muted)] px-1 py-0.5 bg-[var(--surface-sunk)] rounded-[2px]">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[300px] overflow-y-auto p-1">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-[var(--ink-muted)]">
              Tidak ada hasil yang cocok dengan &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className={`flex items-center justify-between px-3 h-[32px] text-[13px] rounded-[2px] cursor-pointer ${
                    isSelected
                      ? "bg-[var(--action)] text-white"
                      : "text-[var(--ink)] hover:bg-[var(--surface-sunk)]"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Icon className="w-4 h-4 shrink-0 opacity-80" />
                    <span className="truncate">{item.title}</span>
                  </div>
                  <span
                    className={`text-[11px] font-mono uppercase opacity-70 ${
                      isSelected ? "text-white" : "text-[var(--ink-muted)]"
                    }`}
                  >
                    {item.category}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
