"use client";

import React, { useState, useEffect } from "react";
import { Cable, Plus, Server } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface ConnectionItem {
  id: string;
  name: string;
  kind: string;
  environment: string;
  host: string;
  database: string;
  read_only: boolean;
  status: string;
}

interface TestConnectionResponse {
  message: string;
  latency_ms: number;
  read_only: boolean;
  success: boolean;
}

const fallbackConnections: ConnectionItem[] = [
  {
    id: "conn-1",
    name: "db_produksi_pg",
    kind: "postgres",
    environment: "prod",
    host: "pg.internal.corp:5432",
    database: "analytics_prod",
    read_only: true,
    status: "online",
  },
  {
    id: "conn-2",
    name: "dw_lokal_duckdb",
    kind: "duckdb",
    environment: "dev",
    host: "localhost (workspace)",
    database: "workspace.duckdb",
    read_only: false,
    status: "online",
  },
  {
    id: "conn-3",
    name: "stream_events",
    kind: "kafka",
    environment: "staging",
    host: "kafka-broker:9092",
    database: "topics/raw_events",
    read_only: true,
    status: "online",
  },
];

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionItem[]>(fallbackConnections);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; msg: string; success: boolean } | null>(null);

  useEffect(() => {
    fetchApi<ConnectionItem[]>("/connections")
      .then((data) => setConnections(data))
      .catch(() => {});
  }, []);

  const handleTestConnection = async (conn: ConnectionItem) => {
    setTestingId(conn.id);
    setTestResult(null);
    try {
      const res = await fetchApi<TestConnectionResponse>("/connections/test", {
        method: "POST",
        body: JSON.stringify({
          kind: conn.kind,
          host: conn.host,
        }),
      });
      setTestResult({
        id: conn.id,
        msg: `${res.message} (${res.latency_ms} ms, ${res.read_only ? "Hanya-Baca" : "Baca/Tulis"})`,
        success: res.success,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({
        id: conn.id,
        msg: `Gagal menghubungkan: ${msg}`,
        success: false,
      });
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--rule)] pb-2 select-none">
        <div>
          <h1 className="text-[16px] font-semibold text-[var(--ink)] flex items-center gap-2">
            <Cable className="w-4 h-4 text-[var(--action)]" />
            <span>Katalog Koneksi Sumber Data</span>
          </h1>
          <p className="text-[12px] text-[var(--ink-muted)]">
            Koneksi backend terenkripsi mandiri tanpa pengiriman data ke layanan pihak ketiga.
          </p>
        </div>

        <button
          onClick={() => alert("Formulir tambah koneksi baru (PostgreSQL / MySQL / DuckDB / Kafka)")}
          className="flex items-center gap-1.5 px-3 h-[28px] text-[12px] font-semibold bg-[var(--action)] text-white hover:opacity-90 rounded-[2px]"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Tambah koneksi</span>
        </button>
      </div>

      {/* Connection List */}
      <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[2px] overflow-hidden">
        <div className="grid grid-cols-12 px-3 py-2 bg-[var(--surface-sunk)] border-b border-[var(--rule)] text-[12px] font-semibold text-[var(--ink-muted)]">
          <div className="col-span-4">Nama &amp; Jenis</div>
          <div className="col-span-3">Host / Endpoint</div>
          <div className="col-span-2">Mode Akses</div>
          <div className="col-span-3 text-right">Uji Koneksi</div>
        </div>

        <div className="divide-y divide-[var(--rule)]">
          {connections.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-12 px-3 py-3 items-center text-[12.5px] hover:bg-[color-mix(in_srgb,var(--ink)_2%,var(--surface))]"
            >
              <div className="col-span-4 flex items-center gap-2.5">
                <Server className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
                <div className="flex flex-col truncate">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-[var(--ink)]">
                      {c.name}
                    </span>
                    <span
                      className={`text-[9px] font-mono uppercase px-1 py-0.2 rounded-[2px] ${
                        c.environment === "prod"
                          ? "bg-[var(--warn)] text-white font-bold"
                          : "bg-[var(--surface-sunk)] text-[var(--ink-muted)]"
                      }`}
                    >
                      {c.environment}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                    Jenis: {c.kind}
                  </span>
                </div>
              </div>

              <div className="col-span-3 font-mono text-[12px] text-[var(--ink-muted)] truncate">
                {c.host} ({c.database})
              </div>

              <div className="col-span-2">
                <span
                  className={`px-1.5 py-0.5 text-[11px] font-mono rounded-[2px] ${
                    c.read_only
                      ? "bg-[var(--surface-sunk)] text-[var(--ink-muted)]"
                      : "bg-[var(--ok)] text-white font-bold"
                  }`}
                >
                  {c.read_only ? "Hanya-Baca" : "Baca/Tulis"}
                </span>
              </div>

              <div className="col-span-3 flex items-center justify-end gap-2">
                {testResult?.id === c.id && (
                  <span
                    className={`text-[11px] font-mono truncate max-w-[200px] ${
                      testResult.success ? "text-[var(--ok)]" : "text-[var(--error)]"
                    }`}
                  >
                    {testResult.msg}
                  </span>
                )}
                <button
                  onClick={() => handleTestConnection(c)}
                  disabled={testingId === c.id}
                  className="px-2.5 py-1 text-[12px] border border-[var(--rule-strong)] text-[var(--ink)] hover:bg-[var(--surface-sunk)] rounded-[2px] transition-colors"
                >
                  {testingId === c.id ? "Menguji..." : "Uji"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
