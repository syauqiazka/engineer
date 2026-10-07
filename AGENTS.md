# AGENTS.md

Panduan untuk agent coding (dan manusia) yang mengerjakan repo ini. Baca seluruhnya sebelum mengubah kode. Untuk keputusan visual dan UX, baca juga `DESIGN.md`.

> Repo ini masih tahap awal. Perintah dan struktur di bawah adalah **target**. Jika kenyataan di repo berbeda, ikuti repo lalu perbarui file ini di PR yang sama.

## 1. Produk

Web workbench untuk data engineer: satu tempat untuk menghubungkan sumber data, melihat dan mengedit data, mengolahnya dengan SQL/Python/Scala/Java, membangun alur ETL, menjadwalkannya, dan memantau hasilnya. **Seluruhnya berjalan di mesin milik sendiri, tanpa layanan berbayar** (lihat bagian 2).

Pengguna: data engineer dan analytics engineer yang sudah paham SQL dan Python. Mereka tidak butuh dijelaskan apa itu JOIN; mereka butuh cepat, tepat, dan tidak kehilangan data. Pemula tetap harus bisa memulai tanpa membaca manual (bagian 10).

### Kemampuan utama

1. **Hubungkan dan impor** dari database relasional, NoSQL, file, penyimpanan objek self-hosted, dan stream.
2. **Lihat dan edit** data di grid (sel, baris, kolom) dengan undo/redo.
3. **Profil dan kualitas data**: tipe, null, distinct, distribusi, aturan kualitas.
4. **Olah data** dengan SQL, Python, Scala, dan Java, lewat editor kode maupun pipeline/workflow visual.
5. **ETL**: engine lokal (DuckDB/Polars) untuk data satu mesin; Spark standalone untuk data lebih besar; Kafka untuk data real-time.
6. **Orkestrasi**: jadwal, dependensi, retry, backfill, notifikasi, riwayat run; ekspor ke Airflow.
7. **Gudang data lokal** (dibuat sendiri di atas DuckDB + Parquet) sebagai tujuan dan sumber hasil olahan.
8. **Dashboard dan sidebar** sebagai pusat navigasi dan pemantauan.
9. **Ekspor dan deploy**: ke file, ke tabel database, sebagai kode mandiri, dan sebagai paket Docker untuk dijalankan di mesin sendiri.

### Prinsip produk

- **Data pengguna tidak boleh rusak diam-diam.** Setiap operasi yang mengubah data punya preview, undo, atau konfirmasi dengan dampak konkret.
- **Semua yang dilakukan lewat UI bisa dikeluarkan sebagai kode** (SQL, Python/Polars/pandas, PySpark, Airflow DAG).
- **Integrasi, bukan penggantian**, untuk mesin besar yang sudah open source dan gratis (Spark, Kafka, Airflow): kita mengirim job, memantau, dan mengekspor, bukan menulis ulang.
- **Dorong komputasi ke tempat data berada** (pushdown) bila sumbernya mendukung SQL.
- **Cepat di data besar** untuk ukuran satu mesin: virtualisasi, sampling, eksekusi di engine, bukan di JavaScript.

## 2. Kebijakan gratis (wajib, mengikat semua keputusan teknis)

Tujuan: produk ini **bisa dibangun, dijalankan, dan dipakai tanpa membayar apa pun** kepada pihak lain: tanpa lisensi, langganan, kuota, kredit trial, atau akun wajib.

### 2.1 Aturan

1. **Tidak ada layanan berbayar, SaaS, atau API key yang diperlukan** agar fitur apa pun berjalan. Aplikasi harus berfungsi penuh tanpa internet setelah instalasi.
2. **Lisensi dependensi harus bebas:** MIT, Apache-2.0, BSD, ISC, MPL-2.0, PostgreSQL License, LGPL (tautan dinamis), OFL (font). Dilarang sebagai dependensi: SSPL, BSL, Elastic License, Commons Clause, dan lisensi *source-available* lain; produk "freemium" yang fitur yang kita butuhkan ada di edisi berbayar; serta edisi gratis berbatas (mis. edisi Express/Free/sandbox milik vendor). GPL/AGPL hanya untuk **proses terpisah** (mis. server database di Docker Compose), tidak ditautkan ke kode kita, dan butuh persetujuan eksplisit di PR.
3. **Tidak ada tier, kuota, trial, "Pro", atau paywall** di produk kita sendiri.
4. **Tidak ada telemetri keluar**, pelacak, atau layanan pihak ketiga (analitik, error tracking SaaS, CDN font). Font di-self-host.
5. **Bila sebuah kebutuhan hanya dipenuhi layanan berbayar, bangun sendiri versi sederhananya** (tabel 2.2), atau dukung lewat jalur generik (2.3). Jangan menambah ketergantungan pada layanan berbayar "sementara".
6. Lisensi diperiksa otomatis di CI (`pip-licenses`, `pnpm licenses list`) dengan daftar izin di repo. Menambah dependensi baru wajib menyebut lisensinya di PR.

### 2.2 Yang berbayar atau terkunci vendor, dan penggantinya

| Kebutuhan | Biasanya dipenuhi oleh | Di sini |
|---|---|---|
| Gudang data / lakehouse | Snowflake, BigQuery, Redshift, Databricks | **Gudang data lokal buatan sendiri**: DuckDB + Parquet berpartisi + katalog metadata sendiri (5.4). ClickHouse (Apache-2.0) sebagai konektor opsional untuk data lebih besar |
| Infrastruktur cloud | AWS, GCP, Azure | Self-host dengan Docker di mesin sendiri (laptop, PC, atau server yang sudah dimiliki) |
| Penyimpanan objek cloud | S3, GCS, Azure Blob | Folder lokal; atau penyimpanan objek kompatibel S3 yang open source dan dijalankan sendiri, lewat `fsspec` (verifikasi lisensi server saat memilih) |
| Secret manager cloud | AWS/GCP/Azure secret manager | **Secret store buatan sendiri**: enkripsi AES-GCM (`cryptography`), master key dari Docker secret/file/env, rotasi kunci |
| Layanan autentikasi | Auth0, Clerk, dsb. | **Auth buatan sendiri**: `argon2-cffi`, sesi cookie httpOnly, CSRF, rate limit; OIDC generik opsional |
| Email/notifikasi | SendGrid, dsb. | SMTP generik yang diisi pengguna, webhook, dan notifikasi di dalam aplikasi |
| Monitoring dan error tracking | Datadog, Sentry SaaS | Log JSON terstruktur + penampil log dan metrik sumber daya di aplikasi |
| Orkestrasi terkelola | Airflow terkelola, dsb. | **Scheduler buatan sendiri** (5.3); Airflow open source tetap bisa dipakai lewat ekspor/REST |
| Hosting aplikasi | Vercel dan sejenisnya | Next.js `output: 'standalone'` di Docker; tidak memakai fitur khusus platform hosting |
| Komponen UI berbayar | grid/chart/templat berlisensi | TanStack Table (MIT), komponen chart SVG buatan sendiri (boleh `d3-*`), tanpa edisi Enterprise/Pro library apa pun |
| Pencarian | layanan pencarian SaaS | Pencarian sisi klien untuk palet perintah; `LIKE`/FTS di penyimpanan app |

### 2.3 Jalur generik untuk sistem berbayar milik pengguna

Pengguna yang sudah punya sistem berbayar (mis. Snowflake, BigQuery, SQL Server, Oracle) tetap bisa terhubung lewat **konektor generik**: URL SQLAlchemy, ODBC, atau JDBC yang driver-nya mereka pasang sendiri. Kita **tidak** membuat konektor khusus vendor, tidak membundel driver proprietary, tidak mengujinya di CI, dan tidak menjanjikan dukungan. Biaya layanan itu urusan pengguna.

### 2.4 Apa arti "gratis" di sini

Gratis berarti tanpa lisensi, langganan, atau layanan berbayar. Mesin yang menjalankannya (laptop, PC, server), listrik, dan waktu pengembangan tetap ada. Komponen buatan sendiri juga lebih sederhana daripada produk komersialnya, terutama gudang data lokal yang berjalan di **satu mesin**, bukan klaster terdistribusi. Batas itu dinyatakan jujur di UI dan dokumentasi (5.4).

## 3. Cakupan fitur dan fase

**Jangan membangun fase berikutnya sebelum fase saat ini lulus Definition of Done**, tetapi rancang `Connector` agar fase berikutnya bisa ditambahkan tanpa mengubah inti.

| Area | Fitur | Teknologi (semua gratis) | Fase |
|---|---|---|---|
| Bahasa | SQL (DuckDB; dialek lain lewat transpile) | DuckDB, `sqlglot` | 1 |
| Bahasa | Python | Polars, pandas, sandbox runner | 2 |
| Bahasa | Scala / Java (job Spark) | OpenJDK + Scala di image runner | 4 |
| Relasional | PostgreSQL, MySQL/MariaDB | SQLAlchemy, `psycopg`, `pymysql` | 1 |
| Relasional | SQLite | `sqlite3` | 2 |
| Relasional | SQL Server, Oracle, dll. | hanya jalur generik 2.3 | tidak dibundel |
| NoSQL | MongoDB (dokumen jadi tabel via flattening) | `pymongo`; server milik pengguna | 2 |
| NoSQL | Cassandra | `cassandra-driver` | 3 |
| File & storage | CSV/TSV, Excel, JSON, dump SQL, Parquet | `openpyxl`, `python-calamine`, DuckDB | 1 |
| File & storage | Folder lokal dan penyimpanan objek kompatibel S3 self-hosted | `fsspec` | 2 |
| ETL | Pipeline linear + codegen | step registry (5.2) | 1 |
| ETL | Workflow visual berbentuk graf (DAG) | `@xyflow/react` | 2 |
| ETL | Spark standalone (batch dan streaming) | PySpark via Spark Connect, atau submit JAR/skrip | 4 |
| ETL | Kafka (preview, produce, monitor consumer) | `confluent-kafka` | 4 |
| Orkestrasi | Jadwal, dependensi, retry, backfill, alert | scheduler buatan sendiri (5.3) | 3 |
| Orkestrasi | Ekspor DAG Airflow; picu dan pantau Airflow via REST | Airflow REST API | 3 |
| Gudang data | **Gudang data lokal** (tabel Parquet berpartisi + katalog) | DuckDB + Parquet (5.4) | 3 |
| Gudang data | ClickHouse sebagai sumber/tujuan opsional | konektor ClickHouse | 3 |
| Deploy | Docker Compose untuk dev dan produksi kecil | Docker Engine | 1 (dev), 4 (paket) |
| Dashboard | Beranda operasional, kualitas, sumber daya | lihat 10 dan `DESIGN.md` | 1 (dasar), 3 (lengkap) |
| Akses | Autentikasi dan peran (viewer, editor, admin) | buatan sendiri (7) | 2 |

Rincian fase:

- **Fase 1: inti yang bisa dipakai.** Shell Next.js dengan sidebar dan Beranda; impor file; PostgreSQL dan MySQL/MariaDB; grid editable dengan undo; profil kolom; SQL tab; pipeline linear dengan "Lihat sebagai kode"; ekspor; Docker Compose dev.
- **Fase 2: pengolahan dan keamanan.** Python tab dengan sandbox; aturan kualitas; SQLite, MongoDB, penyimpanan objek self-hosted; workflow DAG; autentikasi dan peran; secret store.
- **Fase 3: operasi.** Scheduler, riwayat run, retry, alert, backfill; ekspor/integrasi Airflow; gudang data lokal; ClickHouse; Cassandra; dashboard lengkap.
- **Fase 4: skala dan real-time.** Spark (PySpark, Scala, Java), Kafka, paket deploy produksi kecil.

## 4. Arsitektur target

```
┌───────────────────┐  HTTPS / WS   ┌──────────────────────────┐
│ Next.js (web)     │ ────────────▶ │ API (FastAPI)            │
│ UI + route handler│ ◀──────────── │  routes, auth, katalog   │
│ tipis (proxy)     │               └───────┬──────────────────┘
└───────────────────┘                       │ antrian job
                                            ▼
                                  ┌──────────────────────┐
                                  │ Worker / Job runner  │  tiap job = proses/kontainer
                                  │ Python · Scala · Java│  terisolasi (sandbox)
                                  └───┬──────────────────┘
        ┌─────────────┬──────────────┼───────────────┬──────────────┐
        ▼             ▼              ▼               ▼              ▼
   DB relasional   NoSQL         Gudang data      File & storage   Spark / Kafka /
   PostgreSQL,     MongoDB,      lokal (DuckDB    folder lokal,    Airflow
   MySQL/MariaDB,  Cassandra     + Parquet),      objek S3-compat  (open source,
   SQLite                        ClickHouse       self-hosted      self-hosted)

   Engine kerja lokal: DuckDB + Parquet di workspace
   Penyimpanan app: PostgreSQL/SQLite (proyek, pipeline, jadwal, run, koneksi terenkripsi)
```

Alasan utama:

- **Browser tidak bisa membuka koneksi TCP ke database.** Semua konektor berjalan di backend. Next.js hanya UI; route handler hanya proxy tipis dan tidak memegang kredensial sumber data.
- **DuckDB sebagai engine kerja lokal**: SQL tab dan pipeline berjalan di sana. Jangan mengolah data besar sebagai array objek di JavaScript.
- **Job berjalan di worker terpisah** dengan isolasi per job. Kode pengguna tidak pernah dieksekusi di proses API.

### 4.1 Antarmuka Connector (wajib dipakai semua sumber)

```python
class Connector(Protocol):
    kind: str                       # "postgres", "mysql", "mongodb", "clickhouse", "files", "kafka", ...
    capabilities: Capabilities      # supports_sql, supports_write, supports_pushdown,
                                    # is_streaming, has_schema, supports_explain
    def test(self) -> TestResult: ...
    def catalog(self, path: list[str]) -> list[CatalogNode]: ...      # database > skema > tabel
    def schema(self, ref: TableRef) -> Schema: ...
    def preview(self, ref: TableRef, limit: int = 100) -> Batch: ...
    def read(self, query: Query, chunk_rows: int) -> Iterator[Batch]: ...
    def write(self, ref: TableRef, batches: Iterator[Batch], mode: WriteMode) -> WriteResult: ...
    def estimate_scan(self, query: Query) -> ScanEstimate | None: ...  # EXPLAIN: perkiraan baris/byte
```

- UI menampilkan fitur berdasarkan `capabilities`.
- Konektor streaming (Kafka) memakai `StreamConnector` (`subscribe`, `peek`, `lag`).
- Menambah konektor = satu modul di `connectors/` + test + entri katalog. Tidak ada `if kind == ...` di luar registry.
- Konektor generik (SQLAlchemy URL, ODBC, JDBC) mengimplementasikan antarmuka yang sama dengan `capabilities` konservatif.

## 5. Stack

Semua berlisensi bebas (verifikasi ulang lisensi di repo masing-masing saat menambahkan; CI memeriksanya).

| Lapisan | Pilihan | Lisensi | Catatan |
|---|---|---|---|
| Frontend | **Next.js** (versi stabil terbaru, App Router) + TypeScript | MIT | dibangun di atas React, jadi library komponen React tetap bisa dipakai. Server Component untuk shell; Client Component untuk grid, editor, canvas |
| Styling | Tailwind CSS, token dari `DESIGN.md` | MIT | primitif headless (Radix UI, MIT) boleh; jangan memakai templat/komponen berbayar |
| Font | IBM Plex Sans, JetBrains Mono via `next/font`, self-host | OFL | |
| State | Zustand, TanStack Query | MIT | |
| Grid | TanStack Table + TanStack Virtual | MIT | **tidak** memakai AG Grid (edisi Enterprise berbayar) |
| Canvas workflow | `@xyflow/react` | MIT | hanya fitur edisi bebas |
| Editor kode | CodeMirror 6 | MIT | SQL, Python, Scala, Java |
| Chart | SVG buatan sendiri, boleh `d3-*` | ISC | |
| Backend | Python 3.12 + FastAPI, Pydantic v2 | MIT | async |
| Engine lokal | DuckDB | MIT | |
| Dataframe | Polars (utama), pandas | MIT / BSD | |
| Parsing SQL | `sqlglot` | MIT | |
| Penyimpanan app | PostgreSQL (produksi), SQLite (dev kecil) + Alembic | PostgreSQL License / domain publik / MIT | |
| Job & jadwal | proses worker + antrian di PostgreSQL (`FOR UPDATE SKIP LOCKED`) | n/a | tanpa Redis/Celery sebelum terbukti perlu |
| Kontainer | Docker Engine, Docker Compose | Apache-2.0 | image terpisah: `web`, `api`, `worker`, `runner-jvm` |
| Test | pytest, Vitest, Playwright, `testcontainers` | MIT / Apache-2.0 | |

Jangan menambah dependensi besar tanpa alasan tertulis di PR.

## 6. Panduan per area

### 6.1 Bahasa: SQL, Python, Scala, Java

- **SQL**: eksekusi ke DuckDB (tabel kerja) atau didorong ke sumber (pushdown). Dialek ditampilkan jelas. `sqlglot` untuk transpile antar dialek di codegen, bukan menebak maksud pengguna.
- **Python**: berjalan di worker dengan sandbox. Pengguna mendapat objek `ctx` (akses tabel kerja, parameter, logger) dan boleh memakai Polars/pandas. Dependensi tambahan lewat daftar paket yang disetujui per workspace (di image runner), bukan `pip install` bebas saat runtime.
- **Scala/Java** (Fase 4): tidak dijalankan lokal. Editor mendukung sintaks dan templat; "Jalankan" membangun artefak di `runner-jvm` lalu **mengirimnya ke Spark standalone** milik sendiri (spark-submit atau Livy). Log dan status dialirkan ke UI.

### 6.2 ETL, Spark, Kafka, workflow visual

- **Dua bentuk pipeline**: linear (daftar step) dan **workflow graf** (node dan edge). Keduanya memakai step registry yang sama.
- **Node workflow**: sumber, transformasi, kualitas (assert), tujuan, node kode (SQL/Python). Skema masuk/keluar divalidasi sebelum run; edge yang tidak cocok ditolak saat digambar.
- **Spark**: Spark Connect untuk interaktif/pratinjau, submit job untuk pekerjaan besar. Codegen menghasilkan PySpark yang setara.
- **Kafka**: intip pesan (sampel), skema, consumer lag, kirim pesan uji. Preview memakai `group.id` khusus dan tidak meng-commit offset.
- **Tiap node/step wajib punya generator kode** untuk SQL dan Python (Polars dan pandas), dan PySpark bila relevan. Ada test yang menjalankan kode hasil generate dan membandingkannya dengan eksekusi di aplikasi.

### 6.3 Orkestrasi (scheduler buatan sendiri)

- Cron + zona waktu eksplisit (default Asia/Jakarta), dependensi antar job, retry dengan backoff, timeout, concurrency limit, backfill rentang tanggal, dan alert (SMTP/webhook/dalam aplikasi). Semua run tercatat: mulai, durasi, status, parameter, versi pipeline, log.
- Antrian dan penjadwalan memakai PostgreSQL; satu proses scheduler memegang *lease* agar tidak ganda.
- **Airflow** (open source) tetap didukung dalam dua mode: ekspor workflow sebagai file DAG, dan integrasi ke Airflow milik pengguna lewat REST. Ini opsional.
- Run bersifat **idempoten bila memungkinkan**: mode tulis eksplisit (`append`, `overwrite`, `merge/upsert` dengan kunci). UI menampilkan mode itu sebelum menjadwalkan.
- Job bisa dibatalkan dan menampilkan log langsung.

### 6.4 Gudang data lokal (dibuat sendiri)

Pengganti fungsi warehouse/lakehouse berbayar untuk skala satu mesin.

- **Format:** tiap tabel = direktori Parquet (dipartisi gaya Hive bila dipilih) + file manifest yang mencatat versi, skema, dan daftar berkas.
- **Katalog:** metadata tabel (nama, skema, partisi, statistik, riwayat versi) di PostgreSQL/SQLite aplikasi.
- **Tulis:** `append`, `overwrite`, `merge` lewat berkas staging lalu **pergantian manifest atomik**; tidak pernah menimpa berkas yang sedang dibaca. Versi lama disimpan sesuai kebijakan retensi sehingga run yang gagal tidak merusak tabel.
- **Baca:** DuckDB membaca Parquet langsung dengan predicate dan projection pushdown.
- **Perawatan:** job *compaction* menggabungkan berkas kecil; job *vacuum* menghapus versi kedaluwarsa.
- **Batas yang dinyatakan jujur:** satu mesin, bukan klaster; tidak ada kontrol akses per kolom setara produk komersial. Untuk data melebihi satu mesin: Spark standalone (Fase 4) atau konektor ClickHouse.
- Format tabel terbuka seperti Apache Iceberg boleh dipertimbangkan nanti; jangan ditambahkan sebelum ada kebutuhan nyata.

### 6.5 Penjaga sumber daya (pengganti "penjaga biaya")

Tidak ada tagihan yang dilindungi di sini, tetapi mesin pengguna terbatas.

- Preview selalu `LIMIT`. Bila konektor mendukung `estimate_scan` (EXPLAIN), tampilkan perkiraan baris/ukuran sebelum jalan dan minta konfirmasi di atas ambang yang dapat diatur.
- Setiap job punya batas memori, CPU, waktu, dan ruang disk; pelanggaran menghentikan job dengan pesan jelas.
- Dashboard sumber daya menampilkan pemakaian CPU, memori, disk workspace, dan durasi run.

### 6.6 NoSQL

- MongoDB: sampling dokumen untuk menyimpulkan skema; field bersarang diratakan dengan path (`alamat.kota`), array dapat di-*explode* menjadi baris atau disimpan sebagai JSON. Tampilkan jumlah dokumen yang menyimpang dari skema. Server MongoDB adalah milik pengguna; jangan membundelnya bila lisensinya tidak lolos 2.1 (untuk test, pertimbangkan alternatif kompatibel berlisensi bebas dan verifikasi lisensinya).
- Cassandra: hormati model partisi; peringatkan kueri yang butuh `ALLOW FILTERING`; jangan memindai penuh tanpa konfirmasi.

### 6.7 Docker dan self-hosting

- Konfigurasi 12-factor: environment variable atau Docker secret; tidak ada konfigurasi di image.
- `docker compose` dev menyediakan: `web`, `api`, `worker`, `postgres`; sumber uji lewat profil (`--profile sources`: postgres, mysql/mariadb, penyimpanan objek S3-compat; `--profile stream`: kafka KRaft; `--profile spark`).
- Image multi-stage, user non-root, `HEALTHCHECK`, tanpa rahasia. `runner-jvm` terpisah karena besar.
- Next.js memakai `output: 'standalone'`; tidak memakai fitur yang hanya ada di platform hosting tertentu.
- Cadangan: perintah/skrip bawaan untuk mencadangkan penyimpanan app dan workspace ke folder lokal.

## 7. Keamanan (wajib, tidak dinegosiasikan)

1. **Kredensial**
   - Tidak pernah dikirim balik ke frontend setelah disimpan; tidak ada di log, pesan error, URL, atau variabel `NEXT_PUBLIC_*`.
   - Disimpan di **secret store buatan sendiri**: AES-GCM via `cryptography`, master key dari Docker secret/file/env (bukan dari database yang sama), mendukung rotasi kunci.
   - Koneksi default **read-only**; mode tulis dipilih eksplisit per koneksi dan per job.
2. **Eksekusi kode pengguna** di proses/kontainer terpisah dengan batas waktu, memori/CPU, tanpa jaringan secara default (allow-list host per workspace), filesystem terbatas ke direktori job. Jangan `exec`/`eval` di proses API.
3. **SQL**: semua input dianggap berbahaya. Parameterisasi; nama tabel/kolom diverifikasi terhadap katalog. `sqlglot` mendeteksi statement destruktif sebelum eksekusi.
4. **Operasi destruktif** (DROP, TRUNCATE, DELETE/UPDATE tanpa WHERE, menimpa tabel, tulis ke sumber produksi) wajib: preview dampak konkret, konfirmasi eksplisit, audit log.
5. **Autentikasi dan peran** (Fase 2, buatan sendiri): hash `argon2-cffi`, sesi cookie httpOnly + SameSite, CSRF, rate limit login. Peran: viewer, editor, admin. Setiap endpoint memeriksa peran di backend; menyembunyikan tombol bukan pengamanan. Audit log (siapa, apa, kapan).
6. **Upload file**: batasi ukuran dan tipe, jangan percaya ekstensi, simpan hanya di workspace. Saat ekspor CSV/XLSX, netralkan sel yang diawali `=`, `+`, `-`, `@`.
7. **Lingkungan** (dev/staging/prod) ditandai di koneksi; koneksi prod punya penanda permanen di UI dan konfirmasi ekstra untuk tulis.
8. Tidak ada pengiriman data pengguna ke pihak ketiga; tidak ada telemetri (2.1).
9. Dependensi dan image dipindai, versi di-pin.

## 8. Struktur repo (target)

```
/
├─ AGENTS.md
├─ DESIGN.md
├─ docker-compose.yml
├─ apps/
│  ├─ web/                          # Next.js
│  │  ├─ app/
│  │  │  ├─ (workspace)/            # layout dengan sidebar + bilah atas
│  │  │  │  ├─ layout.tsx
│  │  │  │  ├─ page.tsx             # Beranda (dashboard)
│  │  │  │  ├─ sources/  tables/[id]/  query/  pipelines/  workflows/
│  │  │  │  ├─ schedules/  runs/  quality/  connections/  settings/
│  │  │  └─ api/                    # route handler tipis (proxy ke apps/api)
│  │  ├─ components/  features/  lib/
│  │  ├─ styles/tokens.css          # sumber token dari DESIGN.md
│  │  └─ tests/
│  └─ api/
│     ├─ app/
│     │  ├─ connectors/             # postgres.py, mysql.py, mongodb.py, files.py, kafka.py, generic.py, ...
│     │  ├─ engine/                 # workspace DuckDB, profiling, quality
│     │  ├─ warehouse/              # gudang data lokal: manifest, katalog, compaction
│     │  ├─ pipeline/               # step registry + codegen (SQL/Polars/pandas/PySpark/Airflow)
│     │  ├─ orchestration/          # scheduler, run, retry, backfill, alert
│     │  ├─ runner/                 # worker, sandbox, submit ke Spark
│     │  ├─ security/               # auth, peran, secret store, audit
│     │  └─ routes/
│     └─ tests/
├─ docker/                          # Dockerfile web, api, worker, runner-jvm
├─ docs/
└─ examples/                        # dataset kecil untuk dev dan test
```

## 9. Perintah

Target perintah (sesuaikan dengan `package.json` / `pyproject.toml` yang sebenarnya):

```bash
# semua layanan untuk pengembangan
docker compose up --build
docker compose --profile sources up      # + postgres, mysql/mariadb, penyimpanan objek contoh
docker compose --profile stream up       # + kafka

# backend
cd apps/api
uv sync
uv run fastapi dev app/main.py
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run mypy app
uv run pip-licenses                      # periksa lisensi (CI memakai daftar izin)

# frontend (Next.js)
cd apps/web
pnpm install
pnpm dev
pnpm test
pnpm lint && pnpm typecheck
pnpm test:e2e
pnpm build
pnpm licenses list                       # periksa lisensi
```

Sebelum menyatakan pekerjaan selesai, jalankan lint, typecheck, dan test untuk bagian yang kamu ubah. Jika tidak bisa menjalankannya, katakan secara eksplisit.

## 10. UX: dashboard, sidebar, dan "user friendly"

Detail visual ada di `DESIGN.md`. Kewajiban perilaku:

- **Sidebar** adalah navigasi utama, konsisten di semua halaman (Beranda, Sumber, Data, Kueri, Pipeline, Workflow, Jadwal, Riwayat run, Kualitas, Koneksi, Pengaturan). Dapat diciutkan; status ciut diingat.
- **Beranda (dashboard)** menjawab "apa yang perlu saya perhatikan sekarang": run gagal, pipeline terlambat, data basi, pelanggaran kualitas, status koneksi, pemakaian sumber daya. Semua item bisa diklik menuju konteksnya.
- **Mulai cepat:** keadaan kosong menawarkan aksi nyata (impor file contoh, hubungkan database, buka pipeline dari templat). Daftar tugas awal singkat dan bisa ditutup.
- **Palet perintah** (`Ctrl/Cmd+K`) untuk berpindah halaman, membuka tabel, menjalankan aksi.
- **Templat** pipeline untuk pekerjaan umum (bersihkan CSV, dedupe, gabung dua sumber, tarik bertahap).
- **Mode Visual dan Kode** pada pipeline; pengguna diperingatkan bila kode tidak bisa dipetakan kembali ke visual.
- **Bantuan kontekstual** di tempat (popover singkat dengan contoh).
- Pesan galat menyebut apa yang terjadi, di mana, dan cara memperbaikinya.
- Preferensi (tema, kepadatan baris, bahasa Indonesia/Inggris, zona waktu) disimpan.
- Semua alur utama dapat diselesaikan dengan keyboard.
- **Tidak ada elemen paywall, "Upgrade", "Pro", hitung mundur trial, atau kuota buatan** di UI (2.1).

## 11. Konvensi kode

**Umum**

- Perubahan kecil dan terfokus. Satu PR, satu tujuan. Jangan refactor di luar tugas.
- Nama dalam bahasa Inggris untuk kode; teks UI dalam bahasa Indonesia lewat sistem i18n (bahasa Inggris bisa ditambahkan).
- Tidak ada `TODO` tanpa nomor issue. Tidak ada kode mati.
- Komentar menjelaskan *kenapa*, bukan *apa*.

**Python**

- Type hints wajib di fungsi publik; `ruff` + `mypy` bersih.
- Pydantic untuk semua payload API; tidak ada `dict` bebas bentuk di batas API.
- Pilih SQL di DuckDB atau Polars lazy dibanding loop Python per baris.
- Konektor membaca **streaming/chunk**; tidak ada `SELECT *` tanpa `LIMIT` untuk preview.

**TypeScript / Next.js**

- `strict: true`. Tidak ada `any` tanpa komentar alasan.
- Default ke Server Component; `"use client"` hanya untuk yang interaktif (grid, editor, canvas).
- Data tabel besar tidak disimpan penuh di state; frontend hanya memegang jendela baris yang terlihat plus ringkasan.
- Komponen memakai token dari `styles/tokens.css`; tidak ada warna, ukuran font, atau radius hardcode.
- Rahasia hanya di server. Tidak ada kredensial di bundel klien.

**Pipeline dan codegen**

- Setiap step terdaftar di registry dengan: skema parameter, validasi, eksekusi, generator kode.
- Ekspresi turunan memakai satu bahasa yang terdefinisi jelas (SQL DuckDB); jangan mencampur sintaks JS dan Python.

## 12. Testing

- Setiap step pipeline dan konektor punya test dengan data kecil di `examples/`.
- Test konektor memakai container (`testcontainers`) untuk PostgreSQL, MySQL/MariaDB, penyimpanan objek S3-compat, Kafka. Tidak ada test yang membutuhkan akun, kunci API, atau layanan cloud.
- Test gudang data lokal: tulis atomik, kegagalan di tengah penulisan, baca bersamaan dengan tulis, compaction, vacuum, merge dengan kunci.
- Regresi untuk data berantakan: encoding aneh, kutip tidak seimbang, tanggal ambigu, angka berkoma desimal, sel Excel berformula, nama kolom duplikat/kosong, dokumen NoSQL berskema campuran.
- Test orkestrasi: retry, timeout, backfill, pembatalan, idempotensi tulis, lease scheduler.
- E2E (Playwright) minimal: impor CSV, edit sel, jalankan SQL, bangun pipeline, jadwalkan, lihat di Beranda.
- Bug diperbaiki dengan test yang gagal dulu.

## 13. Definition of done

- [ ] Fitur bekerja untuk alur utama dan kasus tepi yang relevan
- [ ] Test baru ditambahkan dan seluruh test terkait lulus
- [ ] Lint, format, typecheck bersih; `pnpm build` berhasil bila menyentuh web
- [ ] **Pemeriksaan lisensi lulus; tidak ada dependensi atau layanan berbayar baru (bagian 2)**
- [ ] Tidak ada pelanggaran bagian Keamanan
- [ ] UI mengikuti `DESIGN.md` (token, tipografi, copy, state kosong/error/loading, fokus keyboard, sidebar konsisten)
- [ ] Konektor baru mengimplementasikan `Connector` penuh dan mendeklarasikan `capabilities` dengan benar
- [ ] Dokumentasi/contoh diperbarui bila perilaku berubah
- [ ] Ringkasan PR menjelaskan apa yang berubah, kenapa, dan apa yang **tidak** dicakup

## 14. Cara bekerja sebagai agent

- Baca kode di sekitar perubahan dan ikuti pola yang ada sebelum menulis pola baru.
- Jika permintaan ambigu, ajukan satu pertanyaan klarifikasi yang paling menentukan, atau pilih asumsi paling aman dan tulis asumsinya.
- Jangan mengarang API, nama paket, atau perintah. Verifikasi di dokumentasi resmi atau di kode. **Periksa lisensi dan model harga setiap dependensi baru sebelum menambahkannya.**
- Bila sebuah solusi menuntut layanan berbayar, berhenti dan usulkan versi buatan sendiri atau jalur generik (bagian 2); jangan menambahkan layanan itu.
- Kerjakan sesuai fase di bagian 3; jangan melompat ke fase berikutnya tanpa diminta.
- Jangan menyentuh: `.env*`, berkas kredensial, migrasi yang sudah dirilis (buat migrasi baru), dan `examples/` yang dipakai test (kecuali menambah).
- Jika menemukan bug atau risiko keamanan di luar tugas, laporkan; jangan diam-diam memperbaikinya dalam PR yang sama.
- Saat gagal atau tidak yakin, katakan apa yang sudah dicoba dan apa yang belum terverifikasi.

## 15. Di luar cakupan (untuk sekarang)

- Konektor khusus layanan berbayar (Snowflake, BigQuery, Redshift, Databricks, layanan cloud terkelola); hanya jalur generik 2.3.
- Menggantikan Spark, Kafka, atau Airflow. Kita mengintegrasikan, bukan menulis ulang.
- Klaster gudang data terdistribusi buatan sendiri, kolaborasi real-time pada sel yang sama, CDC/replikasi (mis. Debezium), katalog data dan lineage tingkat enterprise.
- Fitur berbasis AI generatif.

Boleh didesain agar bisa ditambahkan nanti; jangan dibangun sekarang.
