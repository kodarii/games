#!/usr/bin/env bash
# Non-interactive SSH from GitHub Actions does not load .bashrc — bun must be on PATH explicitly.
export PATH="/root/.bun/bin:$PATH"
set -euo pipefail

# Phase 5 BE-01 deploy contract (Q2 + Q3 Mikrus invariants + Q4 rollback hardening + Q6 systemctl injection):
#   1. install deps (bun install — NO --frozen-lockfile; historical drizzle-kit/better-sqlite3 issues on Mikrus)
#   2. save old client dist (mv dist → dist.prev) and build fresh (bunx vite build only; Mikrus 1 GB RAM — full TypeScript compile would OOM)
#   3. STOP apex-api (eliminates concurrent writers — required for safe snapshot + restore)
#   4. VACUUM INTO snapshot apex.db → apps/api/data/backups/apex.db.<ts>.bak
#   5. db:migrate (drizzle-kit). On fail: trap restores DB+code+dist, starts apex-api on old state, exits non-zero.
#   6. START apex-api (new code + new schema + new dist)
#   7. prune backups, retain last 10
#
# The VPS-side wrapper at /root/apex/scripts/deploy.sh does:
#   export DEPLOY_ROLLBACK_REF=$(git rev-parse HEAD) && git pull && exec bash scripts/deploy.sh
# Trap reads DEPLOY_ROLLBACK_REF to git-reset on failure (code + schema roll back together).
#
# Q6: All systemctl invocations route through $SYSTEMCTL_CMD (prod default `sudo systemctl`)
# so the trap path is locally testable without sudo. See SYSTEMCTL_CMD config below.

export NODE_ENV=production

APP_DIR_REPO="${APP_DIR_REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
DB_PATH="${APP_DIR_REPO}/apps/api/data/apex.db"
BACKUP_DIR="${APP_DIR_REPO}/apps/api/data/backups"
BACKUP_FILE="${BACKUP_DIR}/apex.db.$(date -u +%Y%m%dT%H%M%SZ).bak"
SERVICE_NAME="apex-api"
RETAIN_BACKUPS=10
CLIENT_DIST="${APP_DIR_REPO}/apps/client/dist"
CLIENT_DIST_PREV="${APP_DIR_REPO}/apps/client/dist.prev"
# Q6: single injection point for systemctl. Production default = `sudo systemctl`
# (zero behavior change). Locally: SYSTEMCTL_CMD="echo [mock] systemctl" exercises
# the trap path without sudo. SYSTEMCTL_CMD="false" simulates systemctl failure
# → trap fires on stop. Bash function mocking does NOT work because of `sudo
# env_reset` + execve binary semantics.
SYSTEMCTL_CMD="${SYSTEMCTL_CMD:-sudo systemctl}"

cd "${APP_DIR_REPO}"

echo "▶ Installing dependencies..."
bun install

echo "▶ Building client (vite only; Mikrus 1 GB RAM — full TypeScript compile would OOM)..."
rm -rf "${CLIENT_DIST_PREV}"
if [ -d "${CLIENT_DIST}" ]; then
  mv "${CLIENT_DIST}" "${CLIENT_DIST_PREV}"
fi
( cd apps/client && bunx vite build )
test -f "${CLIENT_DIST}/index.html"

echo "▶ Stopping ${SERVICE_NAME} (quiesce window opens)..."
$SYSTEMCTL_CMD stop "${SERVICE_NAME}"

echo "▶ Snapshotting DB before migrate..."
mkdir -p "${BACKUP_DIR}"
bun run --filter=@apex/api db:backup "${BACKUP_FILE}"
echo "[deploy] DB snapshot: ${BACKUP_FILE}"

# Q2 + Q4: trap-based rollback. MUST be installed BEFORE db:migrate so a failure
# during migration triggers the full restore sequence (DB + code + dist + restart).
restore_and_exit() {
  local exit_code=$?
  echo "[deploy] !!! migration failed (exit ${exit_code}), starting rollback"

  # 1. Restore DB from snapshot (SAFE: apex-api stopped, no live fd on DB_PATH).
  cp "${BACKUP_FILE}" "${DB_PATH}"
  rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"
  echo "[deploy] DB restored from ${BACKUP_FILE}"

  # 2. Restore code to pre-pull ref so old code matches restored old schema.
  if [ -n "${DEPLOY_ROLLBACK_REF:-}" ]; then
    git reset --hard "${DEPLOY_ROLLBACK_REF}"
    echo "[deploy] code reset to ${DEPLOY_ROLLBACK_REF}"
  else
    echo "[deploy] WARNING: DEPLOY_ROLLBACK_REF unset — code NOT reset (local invocation?)"
  fi

  # 3. Restore client dist from pre-build snapshot (instant, no rebuild — Mikrus OOM-safe).
  if [ -d "${CLIENT_DIST_PREV}" ]; then
    rm -rf "${CLIENT_DIST}"
    mv "${CLIENT_DIST_PREV}" "${CLIENT_DIST}"
    echo "[deploy] client dist restored from dist.prev"
  fi

  # 4. Bring apex-api back online on the restored (pre-deploy) state.
  # Q6: $SYSTEMCTL_CMD honored here too — trap path locally testable.
  $SYSTEMCTL_CMD start "${SERVICE_NAME}" || echo "[deploy] WARNING: systemctl start failed in trap"

  exit "${exit_code}"
}
trap restore_and_exit ERR

echo "▶ Running migrations..."
bun run --filter=@apex/api db:migrate
trap - ERR

echo "▶ Starting ${SERVICE_NAME} on new code + new schema + new dist..."
$SYSTEMCTL_CMD start "${SERVICE_NAME}"

echo "▶ Pruning backups (retain ${RETAIN_BACKUPS})..."
ls -1t "${BACKUP_DIR}"/apex.db.*.bak 2>/dev/null \
  | tail -n +$((RETAIN_BACKUPS + 1)) \
  | xargs -r rm -f

rm -rf "${CLIENT_DIST_PREV}"
echo "✓ Deploy complete."
