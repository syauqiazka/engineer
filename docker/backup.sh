#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# backup.sh — Cadangan penyimpanan app dan workspace
# Data Engineer Workbench — Sesuai AGENTS.md 6.7
#
# Penggunaan:
#   ./docker/backup.sh [output_dir]
#
# Contoh:
#   ./docker/backup.sh ./backups
#   ./docker/backup.sh /mnt/external-drive/backups
#
# Yang dicadangkan:
#   1. PostgreSQL dump (penyimpanan app: jadwal, run, koneksi, katalog)
#   2. Volume workspace_data (file DuckDB + data workspace)
#   3. Volume warehouse_data (manifest Parquet gudang data lokal)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

BACKUP_DIR="${1:-./backups}"
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "${BACKUP_PATH}"

echo "========================================"
echo " Data Engineer Workbench — Cadangan Data"
echo " Tujuan: ${BACKUP_PATH}"
echo "========================================"

# ── 1. PostgreSQL dump ──────────────────────────────────────
echo ""
echo "► [1/3] Mencadangkan PostgreSQL (penyimpanan app)..."
docker compose exec -T postgres pg_dump \
  -U engineer \
  -d engineer_app \
  --clean \
  --if-exists \
  --format=custom \
  > "${BACKUP_PATH}/postgres_app.dump"
echo "  ✓ PostgreSQL dump: ${BACKUP_PATH}/postgres_app.dump"

# ── 2. Workspace data (DuckDB + Parquet workspace) ───────────
echo ""
echo "► [2/3] Mencadangkan workspace_data..."
docker run --rm \
  --volumes-from "$(docker compose ps -q api | head -1)" \
  -v "${BACKUP_PATH}:/backup" \
  alpine \
  sh -c "cd /data/workspace && tar czf /backup/workspace_data.tar.gz ."
echo "  ✓ Workspace: ${BACKUP_PATH}/workspace_data.tar.gz"

# ── 3. Warehouse manifests (gudang data lokal) ─────────────
echo ""
echo "► [3/3] Mencadangkan warehouse_data (manifest Parquet)..."
docker run --rm \
  --volumes-from "$(docker compose ps -q api | head -1)" \
  -v "${BACKUP_PATH}:/backup" \
  alpine \
  sh -c "cd /data/manifests && tar czf /backup/warehouse_data.tar.gz ."
echo "  ✓ Warehouse: ${BACKUP_PATH}/warehouse_data.tar.gz"

# ── Ringkasan ─────────────────────────────────────────────
echo ""
echo "========================================"
echo " Cadangan selesai: ${BACKUP_PATH}"
ls -lh "${BACKUP_PATH}"
echo ""
echo " Untuk memulihkan:"
echo "   cat ./docker/backup.sh | grep restore -A 20"
echo "========================================"

# ── Restore instructions (as comments) ────────────────────
# Untuk memulihkan PostgreSQL:
#   docker compose exec -T postgres pg_restore \
#     -U engineer -d engineer_app --clean \
#     < backups/TIMESTAMP/postgres_app.dump
#
# Untuk memulihkan workspace:
#   docker run --rm -v engineer_workspace_data:/data/workspace \
#     -v ./backups/TIMESTAMP:/backup alpine \
#     sh -c "cd /data/workspace && tar xzf /backup/workspace_data.tar.gz"
#
# Untuk memulihkan warehouse:
#   docker run --rm -v engineer_warehouse_data:/data/manifests \
#     -v ./backups/TIMESTAMP:/backup alpine \
#     sh -c "cd /data/manifests && tar xzf /backup/warehouse_data.tar.gz"
