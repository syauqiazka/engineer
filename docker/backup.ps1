# ─────────────────────────────────────────────────────────────
# backup.ps1 — Cadangan penyimpanan app dan workspace (PowerShell)
# Data Engineer Workbench — Sesuai AGENTS.md 6.7
#
# Penggunaan:
#   .\docker\backup.ps1 [-BackupDir <path>]
#
# Contoh:
#   .\docker\backup.ps1
#   .\docker\backup.ps1 -BackupDir D:\backups\workbench
# ─────────────────────────────────────────────────────────────
param(
    [string]$BackupDir = ".\backups"
)

$ErrorActionPreference = "Stop"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupPath = Join-Path $BackupDir $Timestamp

New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

Write-Host "========================================"  -ForegroundColor Cyan
Write-Host " Data Engineer Workbench — Cadangan Data" -ForegroundColor Cyan
Write-Host " Tujuan: $BackupPath"
Write-Host "========================================"

# ── 1. PostgreSQL dump ──────────────────────────────────────
Write-Host ""
Write-Host "► [1/3] Mencadangkan PostgreSQL (penyimpanan app)..." -ForegroundColor Yellow
$PgDumpPath = Join-Path $BackupPath "postgres_app.dump"
docker compose exec -T postgres pg_dump `
    -U engineer `
    -d engineer_app `
    --clean `
    --if-exists `
    --format=custom | Set-Content -Path $PgDumpPath -Encoding Byte
Write-Host "  ✓ PostgreSQL dump: $PgDumpPath" -ForegroundColor Green

# ── 2. Workspace data ─────────────────────────────────────
Write-Host ""
Write-Host "► [2/3] Mencadangkan workspace_data..." -ForegroundColor Yellow
$ApiContainerId = (docker compose ps -q api | Select-Object -First 1).Trim()
docker run --rm `
    --volumes-from $ApiContainerId `
    -v "${BackupPath}:/backup" `
    alpine `
    sh -c "cd /data/workspace && tar czf /backup/workspace_data.tar.gz ."
Write-Host "  ✓ Workspace: $(Join-Path $BackupPath 'workspace_data.tar.gz')" -ForegroundColor Green

# ── 3. Warehouse manifests ─────────────────────────────────
Write-Host ""
Write-Host "► [3/3] Mencadangkan warehouse_data (manifest Parquet)..." -ForegroundColor Yellow
docker run --rm `
    --volumes-from $ApiContainerId `
    -v "${BackupPath}:/backup" `
    alpine `
    sh -c "cd /data/manifests && tar czf /backup/warehouse_data.tar.gz ."
Write-Host "  ✓ Warehouse: $(Join-Path $BackupPath 'warehouse_data.tar.gz')" -ForegroundColor Green

# ── Ringkasan ─────────────────────────────────────────────
Write-Host ""
Write-Host "========================================"  -ForegroundColor Cyan
Write-Host " Cadangan selesai: $BackupPath"           -ForegroundColor Cyan
Get-ChildItem $BackupPath | Format-Table Name, Length, LastWriteTime
Write-Host "========================================"  -ForegroundColor Cyan

Write-Host ""
Write-Host "Untuk memulihkan PostgreSQL:" -ForegroundColor DarkGray
Write-Host "  Get-Content $BackupPath\postgres_app.dump | docker compose exec -T postgres pg_restore -U engineer -d engineer_app --clean" -ForegroundColor DarkGray
