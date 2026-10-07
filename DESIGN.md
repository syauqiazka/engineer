# DESIGN.md

Sistem desain untuk workbench data engineer. Dokumen ini adalah sumber kebenaran visual dan UX. Kalau sebuah komponen butuh keputusan yang belum ada di sini, putuskan, lalu tambahkan ke dokumen ini. Konteks teknis ada di `AGENTS.md`.

## 1. Arah desain

**Subjek:** alat kerja untuk orang yang menghabiskan berjam-jam menatap tabel, skema, log, jadwal, dan kode.
**Tugas utama UI:** menunjukkan data dan status dengan jujur dan padat, membuat perubahan terlihat jelas, membantu pengguna menemukan apa yang perlu diperhatikan, dan tidak pernah menghalangi.

**Konsep: lembar kerja pabrik.** Permukaan seperti panel instrumen dan lembar spesifikasi teknik: abu-abu mineral, garis tipis yang berarti sesuatu, kuning penanda untuk hal yang perlu perhatian. Padat dan tenang. Dua hal yang paling diingat: **grid data** (tipografi, ritme, cara menandai perubahan) dan **papan status operasional** di Beranda (terbaca seperti papan jadwal stasiun: baris demi baris, jelas, tanpa hiasan). Semua yang lain diam.

### Prinsip

1. **Data adalah antarmuka.** Grid dan hasil kueri mendapat ruang terbesar. Chrome (sidebar, toolbar) sehemat mungkin.
2. **Kepadatan tinggi, keterbacaan tetap.** Baris 28 px, bukan 56 px. Angka rata kanan, tabular.
3. **Perubahan dan status selalu terlihat.** Sel diedit, baris akan dihapus, step dimatikan, run gagal: masing-masing punya tanda konsisten, bukan hanya warna.
4. **Struktur membawa informasi.** Garis, border, dan nomor hanya dipakai bila mengkodekan sesuatu (urutan step, batas kolom, status). Tanpa dekorasi.
5. **Mudah dimulai, cepat bagi yang mahir.** Pemula dipandu lewat keadaan kosong, templat, dan bantuan kontekstual; yang mahir dilayani palet perintah dan pintasan keyboard. Keduanya memakai UI yang sama.
6. **Tanpa kejutan.** Posisi kontrol tidak berpindah, tidak ada animasi yang tidak dipicu pengguna, tidak ada modal untuk hal yang bisa inline.

## 2. Daftar larangan (anti "AI slop")

Jangan lakukan ini, kecuali tertulis di dokumen ini:

- Gradien sebagai hiasan (latar, tombol, teks, kartu). Tidak ada sama sekali.
- Glassmorphism, blur latar, glow, bayangan berwarna, neon.
- Ungu/indigo-ke-biru sebagai identitas. Tidak ada "AI sparkle", ikon bintang kecil, atau gambar otak/robot.
- Grid kartu identik dengan radius besar dan bayangan lembut untuk semua konten, termasuk di dashboard.
- Deretan "KPI card" berisi angka besar + label kecil + panah tren hijau/merah. Beranda memakai papan status berbaris (bagian 6.2), bukan kartu metrik.
- Chart dekoratif: donut, gauge, ring skor, "health score" bulat, radar. Chart hanya yang membawa angka terbaca (batang, garis, sparkline, timeline) dengan sumbu dan nilai nyata.
- Logo vendor berwarna-warni (PostgreSQL, MySQL, Kafka, dll.) sebagai hiasan atau grid logo. Vendor ditulis sebagai teks dalam chip netral.
- Ikon emoji sebagai ikon UI. Gunakan satu set ikon garis.
- Hero berisi headline besar + CTA. Layar pertama adalah **ruang kerja**, bukan halaman pemasaran.
- Label ALL CAPS ber-tracking di atas setiap judul atau grup sidebar. Judul grup cukup sentence case.
- Menekankan satu kata di judul dengan warna atau italik.
- String meta dipisah titik tengah ("A · B · C") dan label berbentuk "KATA — fragmen".
- Panah "→" ditempel di setiap tombol dan tautan.
- Animasi masuk fade-and-slide pada setiap bagian; efek hover/transform pada setiap kartu; konfeti, kilau, atau animasi perayaan.
- Placeholder "Lorem ipsum", data contoh generik ("John Doe", "Acme Inc."), atau teks marketing ("Supercharge your data").
- Ilustrasi 3D/orb abstrak, blob, atau garis bergelombang sebagai dekorasi.

- Elemen paywall atau pembatas buatan: tombol "Upgrade", label "Pro", hitung mundur trial, meteran kuota, fitur terkunci. Produk ini sepenuhnya gratis dan tidak punya tingkatan.

Uji cepat: jika sebuah layar bisa dipasang di produk SaaS apa pun tanpa perubahan, ia gagal.

## 3. Token

Semua nilai berada di `apps/web/src/styles/tokens.css` (atau `apps/web/styles/tokens.css`) sebagai CSS variable dan dipetakan ke konfigurasi Tailwind. Komponen hanya memakai token, tidak pernah hex mentah.

### Warna (tema terang)

| Token | Hex | Peran |
|---|---|---|
| `--bg` | `#E6E9E7` | latar aplikasi (abu mineral) |
| `--surface` | `#F5F6F4` | panel, grid, editor |
| `--surface-sunk` | `#DCE0DD` | header grid, sidebar, area cekung |
| `--ink` | `#1B2A2F` | teks utama (biru-hijau gelap, bukan hitam murni) |
| `--ink-muted` | `#55656A` | teks sekunder, metadata |
| `--rule` | `#C3CAC7` | garis pemisah, border sel |
| `--rule-strong` | `#8E9A98` | border kontrol, handle |
| `--action` | `#2B5C8C` | aksi utama, tautan, seleksi aktif, status "berjalan" |
| `--action-ink` | `#FFFFFF` | teks di atas `--action` |
| `--mark` | `#E2B007` | penanda belum diterapkan/berubah, hasil pencarian |
| `--mark-wash` | `#F6E7A8` | latar sel/baris yang diubah |
| `--ok` | `#3B7A57` | lolos, sukses |
| `--warn` | `#A8691A` | peringatan, terlambat, lingkungan prod |
| `--error` | `#A93A3A` | gagal, pelanggaran aturan |
| `--error-wash` | `#F0D3D1` | latar baris/sel yang melanggar |

Aturan penggunaan:

- `--action` hanya untuk aksi, seleksi, dan status "sedang berjalan". Bukan dekorasi.
- `--mark` (kuning) hanya berarti **"belum final / berubah / ditemukan"**.
- Status tidak pernah dikodekan hanya dengan warna: selalu ada ikon atau teks ("Gagal", "3 pelanggaran").
- Tidak ada warna merek vendor. Semua chip sumber memakai `--surface-sunk` + teks `--ink`.
- Kontras teks minimum 4.5:1 (3:1 untuk teks besar dan komponen UI).

### Warna (tema gelap)

| Token | Hex |
|---|---|
| `--bg` | `#172024` |
| `--surface` | `#1E2A2F` |
| `--surface-sunk` | `#141C1F` |
| `--ink` | `#DCE3E1` |
| `--ink-muted` | `#93A3A6` |
| `--rule` | `#33444A` |
| `--rule-strong` | `#587077` |
| `--action` | `#6FA3D6` |
| `--action-ink` | `#0F1A20` |
| `--mark` | `#E8BE2E` |
| `--mark-wash` | `#4A4018` |
| `--ok` | `#6DBB8F` |
| `--warn` | `#D99A4B` |
| `--error` | `#E0807E` |
| `--error-wash` | `#4A2A2A` |

Ikuti `prefers-color-scheme`, dengan pilihan manual (Terang, Gelap, Ikuti sistem) di Pengaturan.

### Tipografi

- **Antarmuka:** IBM Plex Sans (400, 500, 600) via `next/font`, self-host. Fallback: `system-ui, sans-serif`.
- **Data, kode, ID, nama kolom, cron:** JetBrains Mono (400, 500) via `next/font`. Fallback: `ui-monospace, monospace`. Monospace dipakai karena fungsional (kolom sejajar, karakter ambigu terbedakan), bukan untuk gaya. Aktifkan `font-variant-numeric: tabular-nums`.
- Tidak ada font display terpisah. Hierarki dibangun dari ukuran, bobot, dan jarak.

| Peran | Ukuran / line-height | Bobot |
|---|---|---|
| Judul halaman, dialog | 18 / 24 | 600 |
| Judul panel/bagian | 15 / 20 | 600 |
| Teks UI | 13 / 18 | 400 (label 500) |
| Teks kecil (metadata, status bar) | 12 / 16 | 400 |
| Sel data, kode | 12.5 / 18 | 400 (mono) |

Teks bacaan panjang maksimum 72 karakter per baris. Sentence case di mana pun.

### Jarak, bentuk, elevasi

- Satuan dasar **4 px**. Skala: 4, 8, 12, 16, 24, 32.
- Tinggi baris grid/tabel **28 px** (padat 24, lega 36; dapat dipilih di Pengaturan). Tinggi kontrol **28 px**; target sentuh di layar kecil 40 px.
- **Radius 2 px** untuk kontrol dan panel. Sel grid, node workflow, dan baris tabel: radius 0 atau 2. Pil bulat hanya untuk chip tipe data.
- **Elevasi hampir tidak ada.** Pemisahan memakai garis `--rule` dan perbedaan `--surface`/`--surface-sunk`. Bayangan hanya untuk elemen melayang (menu, popover, dialog): `0 4px 12px rgb(0 0 0 / .18)`.

### Ikon

Satu set ikon garis, stroke 1.5 px, grid 16 px (Lucide atau Phosphor Regular; jangan campur). Ikon selalu punya label teks, tooltip, atau `aria-label`. Ikon tipe data memakai huruf mono kecil dalam chip: `int`, `dec`, `txt`, `bool`, `date`, `ts`, `json`.

## 4. Kerangka aplikasi: sidebar dan bilah atas

Aplikasi adalah ruang kerja satu layar penuh. Tidak ada halaman landing di dalam aplikasi.

```
┌────────────┬────────────────────────────────────────────────────────────┐
│ Workspace▾ │ Beranda / ...breadcrumb              [Ctrl K] Cari…  ◐  ?  │ 40px
├────────────┼────────────────────────────────────────────────────────────┤
│ Beranda    │                                                            │
│            │                                                            │
│ Data       │                  area kerja halaman aktif                  │
│  Sumber    │                                                            │
│  Tabel     │                                                            │
│  Kueri     │                                                            │
│            │                                                            │
│ Olah       │                                                            │
│  Pipeline  │                                                            │
│  Workflow  │                                                            │
│            │                                                            │
│ Operasi    │                                                            │
│  Jadwal    │                                                            │
│  Riwayat   │                                                            │
│  Kualitas  │                                                            │
│            │                                                            │
│ Koneksi    │                                                            │
│ Pengaturan │                                                            │
│ ◂ Ciutkan  ├────────────────────────────────────────────────────────────┤
│            │ status bar 24px                                            │
└────────────┴────────────────────────────────────────────────────────────┘
   232px (rail 56px saat diciutkan)
```

### Sidebar

- Latar `--surface-sunk`, dipisah dari area kerja oleh garis 1 px `--rule`.
- Grup (Data, Olah, Operasi) diberi judul teks 12 px, 600, sentence case, `--ink-muted`. Bukan huruf kapital.
- Item: ikon 16 px + label 13 px. **Aktif:** latar `--surface`, batang 2 px `--action` di tepi kiri, label bobot 600. **Hover:** latar `color-mix(--ink 6%, transparent)`.
- Item dapat membawa **lencana status teks** bila ada yang perlu perhatian: angka di samping label ("Riwayat 3") dengan latar `--error-wash` dan teks `--error`; hanya untuk hal yang menuntut tindakan (run gagal, pelanggaran baru). Tidak ada lencana "baru!" dekoratif.
- Di bawah grup utama: **Tabel terbaru** (maks. 5, bisa dihapus dari daftar) dan **Disematkan** (item yang dipin pengguna).
- Menciut menjadi rail 56 px (ikon saja, tooltip berisi label). Status ciut diingat. Di bawah 760 px sidebar menjadi laci yang dibuka dari tombol menu di bilah atas.
- Pintasan: `Ctrl/Cmd+B` ciut/buka; `g` lalu huruf untuk pindah halaman (mis. `g h` Beranda, `g q` Kueri).

### Bilah atas

- Kiri: pemilih workspace dan **breadcrumb** (Data / orders / Profil). Breadcrumb dapat diklik dan menunjukkan lokasi saat ini.
- Tengah/kanan: pencarian global yang sama dengan **palet perintah** (`Ctrl/Cmd+K`): cari tabel, pipeline, jadwal, koneksi; jalankan aksi ("Impor file", "Buat pipeline", "Jalankan kueri terakhir").
- Kanan: pemilih tema, bantuan (`?` membuka daftar pintasan), menu pengguna.
- **Penanda lingkungan:** bila workspace/koneksi yang aktif adalah produksi, garis 2 px `--warn` di sepanjang bawah bilah atas dan chip "prod" di sebelah nama koneksi. Penanda ini tidak bisa disembunyikan.

### Status bar (bawah)

Jumlah baris dan kolom, penanda sampel ("sampel 100.000 dari 8,2 jt"), job yang sedang berjalan (klik untuk membuka log), dan koneksi aktif. Satu baris, 24 px.

## 5. Ruang kerja data (tiga zona)

Halaman tabel, kueri, dan pipeline memakai tiga zona di dalam area kerja:

```
┌──────────────────────────────────────────────────────┬────────────────┐
│ [Data] [Profil] [Kualitas] [Kode]                    │ Inspektur      │
│ ───────────────────────────────────────────────────  │                │
│ toolbar konteks (filter, + baris, undo/redo, ekspor) │ kolom/step     │
│ ┌──────────────────────────────────────────────────┐ │ terpilih:      │
│ │ GRID / EDITOR / HASIL                            │ │ tipe, aturan,  │
│ │                                                  │ │ statistik,     │
│ └──────────────────────────────────────────────────┘ │ kode setara    │
│ panel bawah: hasil kueri / log job                   │                │
└──────────────────────────────────────────────────────┴────────────────┘
                                                          320px, dapat diciutkan
```

- Inspektur (kanan) dapat diciutkan; di bawah 1100 px menjadi laci.
- Panel dipisahkan garis 1 px dan dapat diubah ukurannya dengan handle; ukuran diingat.
- **Rata kiri** untuk teks, label, judul. Angka di grid rata kanan.
- Di layar kecil grid tetap di-scroll horizontal di dalam wadahnya; halaman tidak pernah bergeser ke samping. Mengikuti safe area perangkat.

## 6. Dashboard

### 6.1 Prinsip dashboard

Dashboard menjawab satu pertanyaan: **"apa yang perlu saya perhatikan sekarang?"** Urutan: yang rusak, yang terlambat, yang berubah, baru yang normal. Setiap baris dapat diklik menuju konteksnya (log, tabel, pipeline). Tidak ada elemen yang hanya untuk dilihat.

### 6.2 Beranda (papan status)

```
┌─ Beranda ───────────────────────────────────────────────────────────────┐
│ Hari ini: 42 run berhasil, 2 gagal, 1 berjalan. 1 tabel basi. Disk 62%.     │  kalimat ringkasan
│ ─────────────────────────────────────────────────────────────────────── │
│ Perlu perhatian                                              (3)        │
│  ✕ Gagal   orders_daily      02:00  Kolom `tanggal` ... 31 baris   Lihat │
│  ! Terlambat  sync_pelanggan  seharusnya 03:00, belum jalan        Lihat │
│  ! Basi    stg_sensor        terakhir diperbarui 2 hari lalu       Lihat │
│ ─────────────────────────────────────────────────────────────────────── │
│ Run terbaru            timeline 24 jam (batang per run, sumbu jam)       │
│  orders_daily    ▮▮▯▮▮▮▮▮▮▮                                             │
│  sync_pelanggan  ▮▮▮▮▮▮▮▮▮▮▮                                            │
│ ─────────────────────────────────────────────────────────────────────── │
│ Kesegaran data │ Kualitas │ Koneksi │ Sumber daya (bagian, bukan kartu) │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Kalimat ringkasan** di atas menggantikan deretan kartu angka. Angka di dalam kalimat dapat diklik untuk memfilter daftar di bawahnya.
- **Perlu perhatian:** tabel berbaris, diurutkan menurut tingkat keparahan. Kolom: status (ikon + teks), nama, waktu, penyebab satu baris, tautan "Lihat". Kosong berarti tidak ada masalah: tampilkan teks "Tidak ada yang perlu ditangani." dan tidak ada hiasan.
- **Timeline run:** satu baris per pipeline, batang per run menurut waktu mulai dan durasi sebenarnya. Warna: `--ok`, `--error`, `--action` (berjalan), `--ink-muted` (dilewati). Sumbu jam dan tooltip berisi durasi dan jumlah baris.
- **Kesegaran data:** tabel/dataset dengan waktu pembaruan terakhir dan ambang kesegaran; yang melewati ambang ditandai `--warn` + teks "basi".
- **Kualitas:** daftar aturan yang dilanggar dengan jumlah pelanggaran dan tren 14 hari berupa sparkline satu warna. Tidak ada skor bulat.
- **Koneksi:** daftar koneksi, status (ikon + teks), latensi uji terakhir, chip lingkungan.
- **Sumber daya:** pemakaian CPU, memori, dan disk workspace (garis waktu satu warna dengan sumbu nyata), serta tabel run terlama dan terberat (durasi, memori puncak, baris diproses). Ambang peringatan (mis. disk di atas 85%) ditandai `--warn` dengan teks.
- Filter rentang waktu (24 jam, 7 hari, 30 hari) dan filter lingkungan di kanan atas. Pembaruan otomatis dengan penanda "diperbarui 12 detik lalu"; dapat dijeda.

### 6.3 Dashboard kualitas

Halaman Kualitas menampilkan aturan per tabel dengan status terakhir, jumlah pelanggaran, tren, dan tombol "Lihat baris" yang membuka grid dengan baris pelanggar ditandai. Pengguna dapat membuat aturan dari profil kolom (satu klik dari "Kolom ini 2,4% null" menjadi aturan "tidak boleh null").

### 6.4 Aturan visual chart

- Satu warna per chart kecuali status. Sumbu berlabel dengan satuan; angka tabular.
- Tooltip menampilkan nilai persis. Tidak ada animasi masuk pada chart.
- Selalu ada padanan tabel/teks (tombol "Lihat sebagai tabel") untuk aksesibilitas.

## 7. Komponen

### Grid data (elemen utama)

- Header kolom: nama (mono, 500), chip tipe, indikator urutan, handle ubah-lebar. Header dan kolom nomor baris lengket (sticky).
- Border sel 1 px `--rule`; tanpa zebra. Baris dengan kursor: `color-mix(--action 8%, --surface)`.
- **Sel aktif:** outline 2 px `--action`, tanpa radius. **Rentang seleksi:** latar `--action` 12% dengan outline di tepi.
- **Null** tampil sebagai `NULL` miring `--ink-muted`; string kosong sebagai `""`. Selalu dibedakan.
- Sel berubah (belum diterapkan): latar `--mark-wash` + segitiga kecil `--mark` di sudut kiri atas. Sel melanggar aturan: `--error-wash` + garis bawah putus-putus `--error`. Baris ditandai hapus: teks dicoret + ikon tempat sampah di gutter.
- Edit inline: Enter/F2/klik ganda mulai; Esc batal; Tab/Enter geser sel. Validasi tipe tampil di sel.
- Virtualisasi wajib. Jumlah baris dan status sampel selalu tampil di status bar.
- Angka rata kanan; teks/tanggal rata kiri; boolean di tengah. Dokumen NoSQL: kolom bersarang tampil sebagai `alamat.kota` dengan tombol buka/tutup perataan.

### Tombol dan kontrol

- **Primer** (`--action` solid): maksimum satu per area ("Jalankan", "Terapkan 12 perubahan").
- **Sekunder:** latar `--surface`, border `--rule-strong`. **Tersier/ikon:** tanpa border; hover `--surface-sunk`.
- **Destruktif:** border dan teks `--error`; solid hanya di dialog konfirmasi.
- Label tombol berupa kata kerja spesifik: "Jalankan kueri", "Simpan sebagai tabel", "Jadwalkan pipeline". Bukan "Kirim", "OK", "Lanjut". Nama aksi yang sama dipakai di tombol, toast, dan log.
- Fokus keyboard selalu terlihat: outline 2 px `--action`, offset 1 px.
- Pintasan tampil di tooltip dan menu: `Ctrl/Cmd+Enter` jalankan, `Ctrl/Cmd+Z / Shift+Z` undo/redo, `Ctrl/Cmd+K` palet perintah, `Ctrl/Cmd+S` simpan, `?` daftar pintasan.

### Editor kode (SQL, Python, Scala, Java)

- Latar `--surface`, font mono, nomor baris, penanda error di gutter, selektor bahasa/dialek dan **konteks eksekusi** di atas editor ("Jalankan di: workspace (DuckDB)" atau nama koneksi). Konteks selalu terlihat sebelum menekan Jalankan.
- Sintaks diwarnai dengan palet tenang turunan token (`--action`, `--ok`, `--warn`), bukan skema pelangi.
- Di bawah editor: durasi, jumlah baris, tombol "Simpan sebagai tabel" dan "Ekspor". Untuk sumber yang mendukung EXPLAIN: perkiraan baris dan ukuran sebelum jalan (lihat Penjaga sumber daya).
- Scala/Java: tombol utama "Kirim ke Spark"; log dan status dialirkan ke panel bawah.

### Pipeline (linear)

Pipeline adalah urutan nyata, jadi **penomoran di sini sah**.

- Daftar step vertikal; tiap baris ringkas: nomor, jenis, parameter ringkas, jumlah baris masuk lalu keluar (`12.480 → 11.902`), tombol aktif/nonaktif, menu.
- Step dapat diseret untuk mengurutkan. Step nonaktif: teks `--ink-muted` dan nomor dicoret, bukan disembunyikan.
- Klik step membuka parameternya di inspektur dan pratinjau data pada titik itu.
- Pemilih **Visual / Kode** selalu ada; tab Kode menampilkan SQL / Polars / pandas / PySpark yang setara dan dapat disalin.
- Step gagal: garis kiri `--error` + pesan yang menyebut kolom dan nilai bermasalah.

### Workflow (canvas graf)

- Kanvas latar `--surface` dengan titik grid sangat halus (`--rule`), tidak ada gradien. Zoom, pan, minimap kecil (`--surface-sunk`).
- **Node:** persegi panjang radius 2 px, latar `--surface`, border 1 px `--rule-strong`. Isi: ikon jenis, nama, satu baris ringkasan, dan jumlah baris keluar setelah run. Garis status 3 px di tepi kiri: `--ink-muted` (belum jalan), `--action` (berjalan), `--ok`, `--error`.
- **Jenis node** dibedakan oleh ikon dan teks jenis, bukan warna: Sumber, Transformasi, Kualitas, Tujuan, Kode.
- **Port** berupa kotak 8 px di tepi kiri (masuk) dan kanan (keluar). **Edge** garis ortogonal 1.5 px `--rule-strong`; saat dipilih `--action`. Edge yang tidak valid (skema tidak cocok) ditolak saat digambar dengan pesan di dekat kursor yang menyebut kolom yang tidak cocok.
- Panel kiri: palet node yang dapat dicari. Inspektur kanan: parameter node, skema masuk/keluar, pratinjau.
- Tombol "Rapikan susunan" otomatis; node dapat diselaraskan ke grid 8 px.
- Pintasan: `Delete` hapus, `Ctrl/Cmd+D` duplikat, `Ctrl/Cmd+Enter` jalankan sampai node terpilih.

### Koneksi dan impor

- **Katalog koneksi:** daftar dengan pencarian, dikelompokkan menurut jenis dengan judul teks sentence case: Relasional, NoSQL, Gudang data, Penyimpanan objek, Stream, File, Generik (URL SQLAlchemy/ODBC/JDBC). Tiap entri berupa baris (nama, chip teks `postgres`, `mysql`, `mongodb`, `clickhouse`, `kafka`, dst., status). Tidak ada grid logo.
- **Form koneksi:** satu layar; bagian "Uji koneksi" langsung menampilkan hasil (versi server, latensi, izin yang terdeteksi: hanya-baca atau tulis). Pilih lingkungan (dev/staging/prod). Sandi: tampil/sembunyi; setelah tersimpan tampil `••••••••` dan tidak dapat dibaca kembali. Kredensial disimpan terenkripsi di aplikasi; tidak ada ketergantungan pada layanan rahasia eksternal.
- **Dialog impor:** sumber di kiri, **pratinjau 50 baris + tipe terdeteksi** di kanan, tipe dapat dikoreksi sebelum "Impor tabel". Drag-and-drop di seluruh area. Excel multi-sheet: daftar sheet dengan kotak centang.
- **Penjelajah katalog sumber:** pohon database > skema > tabel dengan pencarian dan jumlah baris perkiraan; klik untuk pratinjau, tombol "Impor" atau "Gunakan di kueri".

### Jadwal dan riwayat run

- **Editor jadwal:** pilihan umum (Setiap jam, Harian, Mingguan) dan mode cron untuk yang mahir. Selalu menampilkan **terjemahan manusia dan 3 waktu berikutnya** dengan zona waktu eksplisit ("Setiap hari 02:00 WIB. Berikutnya: Kam 08 Okt 02:00, Jum 09 Okt 02:00, Sab 10 Okt 02:00").
- Pengaturan retry, timeout, concurrency, dan alert (email/webhook) dalam satu bagian yang dapat dilipat. Mode tulis ditampilkan jelas ("Menimpa tabel `orders_daily`" / "Menambah baris") sebelum menyimpan.
- **Riwayat run:** tabel dengan filter (status, pipeline, rentang waktu); kolom: status, pipeline, mulai, durasi, baris, pemicu. Klik membuka detail: timeline per step/node, log langsung (dapat diikuti `tail`), parameter, versi pipeline, tombol "Jalankan ulang" dan "Backfill…".
- **Backfill:** pilih rentang tanggal; dialog menyebut jumlah run yang akan dibuat dan efek tulisnya.
- Airflow: tombol "Ekspor sebagai DAG Airflow" menampilkan kode DAG dengan tombol salin/unduh. Untuk Airflow terhubung: daftar DAG dan status run dalam tabel yang sama dengan penanda sumber "Airflow".

### Stream (Kafka)

- Tabel pesan langsung dengan tombol Jeda/Lanjut; kolom: offset, partisi, waktu, kunci, nilai (ringkas, dapat dibuka sebagai JSON). Pesan baru muncul di bawah tanpa menggeser baris yang sedang dibaca saat dijeda.
- Strip metrik satu baris: throughput (sparkline), lag per partisi (tabel kecil), jumlah pesan tersampel. Label tegas: "Pratinjau tidak mengubah offset consumer."

### Penjaga sumber daya dan operasi berisiko

- Kueri ke sumber yang mendukung EXPLAIN menampilkan perkiraan sebelum jalan: "Kueri ini akan memindai ± 38 juta baris (≈ 4,2 GB)." Di atas ambang yang dapat diatur: dialog konfirmasi dengan angka itu dan tombol "Jalankan kueri" bersama "Batal". Tidak ada angka uang karena tidak ada tagihan.
- Job yang melewati batas memori, waktu, atau disk berhenti dengan pesan yang menyebut batas mana yang terlampaui dan cara menaikkannya di Pengaturan.
- Gudang data lokal menyatakan batasnya di UI: "Berjalan di satu mesin. Untuk data lebih besar dari memori/disk mesin ini, gunakan Spark atau ClickHouse."
- Operasi destruktif: dialog menyebut dampak konkret ("Menghapus 1.204 baris dari `orders` di koneksi prod-pg"). Tombol konfirmasi memakai kata kerja yang sama dengan aksinya. Pada koneksi prod, pengguna mengetik nama tabel untuk mengonfirmasi.

### Profil dan kualitas (komponen)

- Satu baris per kolom: nama, chip tipe, batang null (penuh = 100%, label "2,4% null"), distinct, min/max, sparkline histogram satu warna (`--action` 60%), tombol "Buat aturan".
- Aturan kualitas: kondisi, jumlah pelanggaran, "Lihat baris". Tanpa lingkaran skor.

### Status, umpan balik, dan keadaan

- **Kosong:** satu kalimat tentang apa yang bisa dilakukan, plus aksi nyata. Contoh: "Belum ada data. Impor file, hubungkan database, atau coba dataset contoh." Tanpa ilustrasi.
- **Mulai cepat:** di Beranda workspace baru, daftar tiga tugas ("Hubungkan sumber data", "Impor atau buka tabel", "Buat pipeline pertama") dengan tanda selesai dan tombol "Tutup panduan". Bukan hero; ia berada di atas papan status dan hilang setelah selesai atau ditutup.
- **Templat:** galeri templat pipeline berupa daftar (nama, deskripsi satu kalimat, jumlah step), pratinjau langsung step-nya di inspektur, tombol "Gunakan templat".
- **Bantuan kontekstual:** ikon `?` kecil di samping istilah yang rumit membuka popover pendek dengan contoh nyata dan tautan ke dokumentasi. Tidak ada tur otomatis yang menutupi layar.
- **Memuat:** skeleton berbentuk baris grid; indikator progres dengan angka untuk impor dan job ("48.000 dari 120.000 baris"). Spinner polos hanya untuk di bawah satu detik.
- **Galat:** apa yang terjadi, di mana, cara memperbaiki. Tanpa permintaan maaf atau pesan samar. Contoh: "Kolom `tanggal` gagal diubah ke date: 31 baris berformat DD/MM/YYYY. Pilih format tanggal atau lewati baris tersebut."
- **Toast:** kecil, kiri bawah, hilang dalam 4 detik, dengan "Urungkan" bila aksinya bisa dibatalkan. Galat tidak memakai toast yang hilang sendiri.
- **Job panjang:** bisa dibatalkan, menampilkan log langsung, dan tetap terlihat di status bar saat pengguna berpindah halaman.

## 8. Gerak

- Tidak ada animasi yang dipicu sendiri; tidak ada animasi masuk halaman.
- Gerak hanya menjawab aksi dan memperlihatkan apa yang berubah: panel/sidebar membuka-menutup (120 ms, ease-out), sel yang baru diubah berkedip sekali di `--mark` (240 ms), baris dihapus memudar sambil tinggi menciut (160 ms), baris baru di daftar run muncul tanpa efek kecuali penanda `--mark-wash` yang memudar.
- Hormati `prefers-reduced-motion`: semua gerak menjadi perubahan instan.

## 9. Copy dan bahasa

- Bahasa Indonesia untuk UI, dengan i18n sehingga bahasa Inggris bisa ditambahkan. Istilah teknis baku tetap Inggris: pipeline, workflow, schema, null, join, ETL, commit, cron, backfill. Konsisten satu pilihan per istilah.
- Sentence case. Kata kerja aktif. Satu kalimat per pesan bila memungkinkan.
- Pakai nama kolom, tabel, dan angka nyata dalam pesan; jangan "terjadi kesalahan".
- Tidak ada bahasa promosi, tanda seru, atau emoji.
- **Data contoh** realistis dan berkonteks: pesanan, pengiriman, transaksi, sensor; kota dan produk Indonesia; sengaja sedikit berantakan (null, spasi sisa, huruf besar-kecil tidak konsisten, duplikat) agar pembersihan bisa diperlihatkan.

Glosarium: *Beranda*, *Sumber*, *Tabel kerja*, *Kueri*, *Pipeline*, *Workflow*, *Step*, *Node*, *Jadwal*, *Run*, *Riwayat*, *Kualitas*, *Aturan kualitas*, *Koneksi*, *Impor*, *Ekspor*, *Terapkan*, *Urungkan*, *Jalankan ulang*, *Backfill*.

## 10. Aksesibilitas (batas minimum)

- Seluruh fitur dapat dipakai dengan keyboard; urutan fokus mengikuti urutan visual. Sidebar mengikuti pola navigasi (`nav` dengan `aria-current="page"`); tersedia tautan "Lewati ke konten utama".
- Grid mengikuti pola WAI-ARIA `grid` (`aria-rowindex`/`colindex`, `aria-selected`), tetap mengumumkan jumlah total saat divirtualisasi.
- Canvas workflow: node dan edge dapat dijangkau dan dioperasikan dengan keyboard (Tab antar node, panah untuk memindah, Enter untuk membuka parameter) dan punya padanan daftar (tab "Daftar node").
- Kontras sesuai bagian Warna. Informasi tidak hanya lewat warna. Chart punya padanan tabel.
- Target sentuh minimal 40 px pada layar sentuh. Dukung zoom hingga 200% tanpa kehilangan fungsi.
- Dialog menjebak fokus dan mengembalikannya saat ditutup. Toast dan perubahan status run memakai `aria-live="polite"`; galat kritis `assertive`.

## 11. Checklist tinjauan desain

- [ ] Hanya token yang dipakai; tidak ada hex, radius, atau ukuran font mentah
- [ ] Tidak ada item dari Daftar larangan (terutama: kartu KPI, donut/gauge, logo vendor, label huruf kapital, elemen paywall)
- [ ] Kuning (`--mark`) hanya berarti "berubah/ditemukan"; biru (`--action`) hanya untuk aksi, seleksi, dan "berjalan"
- [ ] Sidebar konsisten di semua halaman dan breadcrumb benar
- [ ] Ada keadaan kosong, memuat, dan galat, dengan teks spesifik
- [ ] Fokus keyboard terlihat; alur utama selesai tanpa mouse
- [ ] Angka rata kanan dan tabular; null dibedakan dari string kosong
- [ ] Konteks eksekusi (di mana kode berjalan) dan lingkungan (dev/prod) terlihat sebelum aksi berisiko
- [ ] Tema terang dan gelap diperiksa
- [ ] Layar 1280 px dan 390 px diperiksa; halaman tidak bergeser ke samping
- [ ] Copy memakai kata kerja spesifik dan sesuai glosarium
- [ ] Uji cepat: layar ini tidak bisa ditempel ke produk SaaS lain tanpa perubahan
