"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Activity,
  Play,
  Pause,
  RefreshCw,
  Send,
  Radio,
  AlertCircle,
  Database,
  Layers,
  Clock,
  Key,
  Code2,
  X,
  CheckCircle2,
} from "lucide-react";

interface StreamMessage {
  offset: number;
  partition: number;
  timestamp: string;
  key: string;
  value: Record<string, unknown> | string;
  headers?: Record<string, string>;
}

interface PartitionLag {
  partition: number;
  current_offset: number;
  high_watermark: number;
  lag: number;
}

interface TopicInfo {
  name: string;
  partitions: number;
  replication_factor: number;
}

export default function StreamPage() {
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>("stream_pesanan_realtime");
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [lags, setLags] = useState<PartitionLag[]>([]);
  const [totalLag, setTotalLag] = useState<number>(0);
  const [selectedPartition, setSelectedPartition] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [brokerStatus, setBrokerStatus] = useState<{
    server_version: string;
    latency_ms: number;
    bootstrap_servers: string;
  }>({
    server_version: "Apache Kafka (KRaft mode v3.7)",
    latency_ms: 0.8,
    bootstrap_servers: "localhost:9092",
  });

  // Modal Kirim Pesan
  const [isProduceOpen, setIsProduceOpen] = useState<boolean>(false);
  const [produceKey, setProduceKey] = useState<string>("dev-custom-99");
  const [produceValue, setProduceValue] = useState<string>(
    JSON.stringify(
      {
        id_pesanan: "TRX-MANUAL-888",
        nama_pelanggan: "Klien Langsung",
        total_bayar: 275000,
        status: "Lunas",
      },
      null,
      2
    )
  );
  const [producePartition, setProducePartition] = useState<number>(0);
  const [produceStatus, setProduceStatus] = useState<string | null>(null);

  // Detail Modal Message Inspector
  const [inspectMessage, setInspectMessage] = useState<StreamMessage | null>(null);

  // Fetch topics and initial broker status
  const fetchMetadata = async () => {
    try {
      const stRes = await fetch("http://localhost:8000/api/stream/status");
      if (stRes.ok) {
        const stData = await stRes.json();
        setBrokerStatus(stData);
      }

      const tpRes = await fetch("http://localhost:8000/api/stream/topics");
      if (tpRes.ok) {
        const tpData = await tpRes.json();
        setTopics(tpData.topics || []);
        if (tpData.topics?.length && !selectedTopic) {
          setSelectedTopic(tpData.topics[0].name);
        }
      }
    } catch {
      // Fallback local defaults
      setTopics([
        { name: "stream_pesanan_realtime", partitions: 3, replication_factor: 1 },
        { name: "telemetri_iot_sensor", partitions: 3, replication_factor: 1 },
        { name: "log_autentikasi", partitions: 3, replication_factor: 1 },
      ]);
    }
  };

  // Fetch messages and consumer lag
  const fetchStreamData = useCallback(async () => {
    if (!selectedTopic) return;
    try {
      const [msgRes, lagRes] = await Promise.all([
        fetch(
          `http://localhost:8000/api/stream/topics/${selectedTopic}/messages?partition=${selectedPartition}&limit=20`
        ),
        fetch(`http://localhost:8000/api/stream/topics/${selectedTopic}/lag`),
      ]);

      if (msgRes.ok) {
        const msgData = await msgRes.json();
        setMessages(msgData.messages || []);
      }
      if (lagRes.ok) {
        const lagData = await lagRes.json();
        setLags(lagData.partitions || []);
        setTotalLag(lagData.total_lag || 0);
      }
    } catch {
      // Offline fallback
    }
  }, [selectedTopic, selectedPartition]);

  useEffect(() => {
    fetchMetadata();
  }, []);

  useEffect(() => {
    fetchStreamData();
  }, [fetchStreamData]);

  // Polling simulation when streaming is active
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isStreaming) {
      timerRef.current = setInterval(() => {
        fetchStreamData();
      }, 3000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStreaming, fetchStreamData]);

  const handleSendProduce = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setProduceStatus(null);
    try {
      let parsedVal: unknown;
      try {
        parsedVal = JSON.parse(produceValue);
      } catch {
        parsedVal = produceValue;
      }

      const res = await fetch(`http://localhost:8000/api/stream/topics/${selectedTopic}/produce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: produceKey,
          value: parsedVal,
          partition: producePartition,
        }),
      });

      if (res.ok) {
        setProduceStatus("Pesan berhasil diproduksi ke cluster Kafka!");
        setTimeout(() => {
          setIsProduceOpen(false);
          setProduceStatus(null);
          fetchStreamData();
        }, 1200);
      } else {
        const err = await res.json();
        setProduceStatus(`Gagal: ${err.detail || "Terjadi kesalahan"}`);
      }
    } catch {
      setProduceStatus("Gagal menghubungkan ke backend.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--surface-canvas)] overflow-hidden">
      {/* Top Header */}
      <header className="px-6 py-4 bg-[var(--surface)] border-b border-[var(--rule)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-[var(--action)]" />
            <h1 className="text-[18px] font-semibold text-[var(--ink)]">
              Kafka Stream Real-time
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-[3px] bg-[var(--action-wash)] text-[var(--action)] border border-[var(--action-subtle)]">
              {brokerStatus.server_version}
            </span>
          </div>
          <p className="text-[12px] text-[var(--ink-muted)] mt-1 flex items-center gap-2">
            <span>Broker: <code className="font-mono">{brokerStatus.bootstrap_servers}</code></span>
            <span>•</span>
            <span>Latensi: <code className="font-mono">{brokerStatus.latency_ms} ms</code></span>
            <span>•</span>
            <span className="text-[var(--success)] font-medium">Mode KRaft Mandiri</span>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-[3px] flex items-center gap-1.5 border transition-colors ${
              isStreaming
                ? "bg-[var(--surface-sunk)] text-[var(--ink)] border-[var(--rule)] hover:bg-[var(--surface)]"
                : "bg-[var(--action)] text-white border-transparent hover:opacity-90"
            }`}
          >
            {isStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5 text-[var(--warn)]" />
                <span>Jeda</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Lanjut</span>
              </>
            )}
          </button>

          <button
            onClick={() => fetchStreamData()}
            className="px-3 py-1.5 text-[12px] font-medium rounded-[3px] bg-[var(--surface-sunk)] text-[var(--ink)] border border-[var(--rule)] hover:bg-[var(--surface)] flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
            <span>Segarkan</span>
          </button>

          <button
            onClick={() => setIsProduceOpen(true)}
            className="px-3 py-1.5 text-[12px] font-medium rounded-[3px] bg-[var(--action)] text-white hover:opacity-90 flex items-center gap-1.5 shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Kirim Pesan Uji</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Metric Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                Topik Aktif
              </p>
              <p className="text-[16px] font-mono font-bold text-[var(--ink)] mt-0.5">
                {selectedTopic}
              </p>
            </div>
            <Database className="w-5 h-5 text-[var(--ink-muted)] opacity-60" />
          </div>

          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                Sampel Terbaca
              </p>
              <p className="text-[16px] font-mono font-bold text-[var(--action)] mt-0.5">
                {messages.length} baris
              </p>
            </div>
            <Activity className="w-5 h-5 text-[var(--action)] opacity-60" />
          </div>

          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                Total Lag Consumer
              </p>
              <p className={`text-[16px] font-mono font-bold mt-0.5 ${totalLag > 0 ? "text-[var(--warn)]" : "text-[var(--success)]"}`}>
                {totalLag} offset
              </p>
            </div>
            <Clock className="w-5 h-5 text-[var(--ink-muted)] opacity-60" />
          </div>

          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] p-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-[var(--ink-muted)] uppercase tracking-wide">
                Partisi Terdaftar
              </p>
              <p className="text-[16px] font-mono font-bold text-[var(--ink)] mt-0.5">
                {lags.length || 3} Partisi
              </p>
            </div>
            <Layers className="w-5 h-5 text-[var(--ink-muted)] opacity-60" />
          </div>
        </div>

        {/* Notice Eksplisit Non-Destruktif */}
        <div className="bg-[var(--surface)] border border-[var(--action-subtle)] bg-[var(--action-wash)] rounded-[4px] px-4 py-2.5 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-[var(--action)] shrink-0" />
          <p className="text-[12px] text-[var(--ink)] font-medium">
            <span className="font-semibold text-[var(--action)]">Pratinjau tidak mengubah offset consumer.</span>{" "}
            Sistem menggunakan consumer group efemeral terisolasi agar progres pembacaan worker tidak terganggu.
          </p>
        </div>

        {/* Topic Selector & Partition Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] p-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[var(--ink-muted)]">Pilih Topik:</span>
            <div className="flex flex-wrap gap-1.5">
              {topics.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setSelectedTopic(t.name)}
                  className={`px-2.5 py-1 text-[12px] font-mono rounded-[3px] transition-colors ${
                    selectedTopic === t.name
                      ? "bg-[var(--action)] text-white font-semibold"
                      : "bg-[var(--surface-sunk)] text-[var(--ink)] hover:bg-[var(--surface)] border border-[var(--rule)]"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[12px] font-semibold text-[var(--ink-muted)]">Partisi:</span>
            <div className="flex gap-1">
              {[0, 1, 2].map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPartition(p)}
                  className={`px-2 py-0.5 text-[11px] font-mono rounded-[2px] border ${
                    selectedPartition === p
                      ? "bg-[var(--ink)] text-[var(--surface)] border-[var(--ink)] font-bold"
                      : "bg-[var(--surface)] text-[var(--ink-muted)] border-[var(--rule)] hover:text-[var(--ink)]"
                  }`}
                >
                  P-{p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Consumer Lag Table */}
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--rule)] bg-[var(--surface-sunk)] flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-[var(--ink)] flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-[var(--ink-muted)]" />
              <span>Status Consumer Lag per Partisi (Group: workbench-group)</span>
            </h2>
            <span className="text-[11px] font-mono text-[var(--ink-muted)]">
              {lags.length} Partisi Terpantau
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[var(--surface)] border-b border-[var(--rule)] text-[var(--ink-muted)] font-mono text-[11px]">
                <tr>
                  <th className="px-4 py-2">Partisi</th>
                  <th className="px-4 py-2">Current Offset</th>
                  <th className="px-4 py-2">High Watermark</th>
                  <th className="px-4 py-2">Consumer Lag</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)] font-mono">
                {lags.map((l) => (
                  <tr key={l.partition} className="hover:bg-[var(--surface-sunk)]">
                    <td className="px-4 py-2 font-bold text-[var(--ink)]">Partisi {l.partition}</td>
                    <td className="px-4 py-2 text-[var(--ink-muted)]">{l.current_offset.toLocaleString()}</td>
                    <td className="px-4 py-2 text-[var(--ink-muted)]">{l.high_watermark.toLocaleString()}</td>
                    <td className="px-4 py-2 font-bold">
                      <span className={l.lag > 0 ? "text-[var(--warn)]" : "text-[var(--success)]"}>
                        {l.lag} pesan
                      </span>
                    </td>
                    <td className="px-4 py-2 font-sans">
                      {l.lag === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--success)]">
                          <CheckCircle2 className="w-3 h-3" /> Sinkron
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[var(--warn)]">
                          <Clock className="w-3 h-3" /> Memproses
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real-time Message Peek Stream Table */}
        <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[4px] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--rule)] bg-[var(--surface-sunk)] flex items-center justify-between">
            <h2 className="text-[12px] font-semibold text-[var(--ink)] flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-[var(--action)]" />
              <span>Aliran Pesan Real-time (Partisi {selectedPartition})</span>
            </h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse" />
              <span className="text-[11px] text-[var(--ink-muted)]">Polling aktif</span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[380px]">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[var(--surface)] border-b border-[var(--rule)] text-[var(--ink-muted)] font-mono text-[11px] sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2">Offset</th>
                  <th className="px-4 py-2">Partisi</th>
                  <th className="px-4 py-2">Timestamp</th>
                  <th className="px-4 py-2">Key</th>
                  <th className="px-4 py-2">Payload (JSON)</th>
                  <th className="px-4 py-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--rule)] font-mono">
                {messages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-muted)] font-sans">
                      Belum ada pesan yang diterima pada partisi ini.
                    </td>
                  </tr>
                ) : (
                  messages.map((m) => (
                    <tr key={`${m.partition}-${m.offset}`} className="hover:bg-[var(--surface-sunk)] transition-colors">
                      <td className="px-4 py-2 text-[var(--action)] font-bold">{m.offset}</td>
                      <td className="px-4 py-2 text-[var(--ink-muted)]">P-{m.partition}</td>
                      <td className="px-4 py-2 text-[var(--ink-muted)] whitespace-nowrap">{m.timestamp}</td>
                      <td className="px-4 py-2 font-semibold text-[var(--ink)]">
                        <span className="flex items-center gap-1">
                          <Key className="w-3 h-3 text-[var(--ink-muted)]" />
                          {m.key || "(null)"}
                        </span>
                      </td>
                      <td className="px-4 py-2 max-w-[320px] truncate text-[var(--ink)]">
                        {typeof m.value === "object" ? JSON.stringify(m.value) : String(m.value)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setInspectMessage(m)}
                          className="px-2 py-0.5 text-[11px] font-sans font-medium text-[var(--action)] hover:bg-[var(--action-wash)] rounded-[2px]"
                        >
                          Inspeksi
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Dialog: Kirim Pesan Uji */}
      {isProduceOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[6px] shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="px-5 py-3.5 border-b border-[var(--rule)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-[var(--action)]" />
                <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                  Kirim Pesan Uji ke Topik {selectedTopic}
                </h3>
              </div>
              <button
                onClick={() => setIsProduceOpen(false)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendProduce} className="p-5 space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink)] mb-1">
                  Kunci Pesan (Message Key)
                </label>
                <input
                  type="text"
                  value={produceKey}
                  onChange={(e) => setProduceKey(e.target.value)}
                  placeholder="mis. order-12345"
                  className="w-full px-3 py-1.5 text-[13px] font-mono bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--action)]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink)] mb-1">
                  Target Partisi
                </label>
                <select
                  value={producePartition}
                  onChange={(e) => setProducePartition(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-[13px] font-mono bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--action)]"
                >
                  <option value={0}>Partisi 0</option>
                  <option value={1}>Partisi 1</option>
                  <option value={2}>Partisi 2</option>
                </select>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[var(--ink)] mb-1">
                  Payload JSON
                </label>
                <textarea
                  rows={6}
                  value={produceValue}
                  onChange={(e) => setProduceValue(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] font-mono bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[3px] text-[var(--ink)] focus:outline-none focus:border-[var(--action)]"
                />
              </div>

              {produceStatus && (
                <div
                  className={`p-2.5 text-[12px] rounded-[3px] ${
                    produceStatus.startsWith("Gagal")
                      ? "bg-[var(--error-wash)] text-[var(--error)]"
                      : "bg-[var(--success-wash)] text-[var(--success)]"
                  }`}
                >
                  {produceStatus}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--rule)]">
                <button
                  type="button"
                  onClick={() => setIsProduceOpen(false)}
                  className="px-3 py-1.5 text-[12px] font-medium rounded-[3px] text-[var(--ink-muted)] hover:bg-[var(--surface-sunk)]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-4 py-1.5 text-[12px] font-medium rounded-[3px] bg-[var(--action)] text-white hover:opacity-90 disabled:opacity-50"
                >
                  {isLoading ? "Mengirim..." : "Kirim ke Broker"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Inspector: Detail Pesan */}
      {inspectMessage && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--rule)] rounded-[6px] shadow-xl w-full max-w-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--rule)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[var(--action)]" />
                <h3 className="text-[14px] font-semibold text-[var(--ink)]">
                  Inspeksi Pesan (Offset #{inspectMessage.offset})
                </h3>
              </div>
              <button
                onClick={() => setInspectMessage(null)}
                className="text-[var(--ink-muted)] hover:text-[var(--ink)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 font-mono text-[12px]">
              <div className="grid grid-cols-2 gap-2 pb-2 border-b border-[var(--rule)] font-sans">
                <div>
                  <span className="text-[var(--ink-muted)] text-[11px]">Partisi:</span>
                  <p className="font-semibold">{inspectMessage.partition}</p>
                </div>
                <div>
                  <span className="text-[var(--ink-muted)] text-[11px]">Timestamp:</span>
                  <p className="font-semibold">{inspectMessage.timestamp}</p>
                </div>
                <div>
                  <span className="text-[var(--ink-muted)] text-[11px]">Kunci (Key):</span>
                  <p className="font-semibold">{inspectMessage.key || "(null)"}</p>
                </div>
                <div>
                  <span className="text-[var(--ink-muted)] text-[11px]">Topik:</span>
                  <p className="font-semibold">{selectedTopic}</p>
                </div>
              </div>

              <div>
                <span className="text-[var(--ink-muted)] text-[11px] font-sans font-semibold">
                  Payload JSON Terformat:
                </span>
                <pre className="mt-1 p-3 bg-[var(--surface-sunk)] border border-[var(--rule)] rounded-[4px] overflow-x-auto text-[12px] leading-relaxed">
                  {JSON.stringify(inspectMessage.value, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-[var(--rule)] flex justify-end">
              <button
                onClick={() => setInspectMessage(null)}
                className="px-4 py-1.5 text-[12px] font-medium rounded-[3px] bg-[var(--surface-sunk)] text-[var(--ink)] hover:bg-[var(--surface)] border border-[var(--rule)]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
