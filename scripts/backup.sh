#!/usr/bin/env bash
# scripts/backup.sh — snapshot the SQLite DB.
# Usage:
#   sudo scripts/backup.sh                 # default backup dir
#   sudo scripts/backup.sh /mnt/usb/backups
#   sudo scripts/backup.sh --install-cron  # adds a daily 02:30 cron entry

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/log.sh
. "$SCRIPT_DIR/lib/log.sh"
require_root "$@"

DATA_DIR=/var/lib/dashboard
DEFAULT_BACKUP_DIR="$DATA_DIR/backups"
INSTALL_CRON=0
TARGET_DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --install-cron) INSTALL_CRON=1; shift ;;
    -h|--help)
      echo "Usage: sudo $0 [BACKUP_DIR] [--install-cron]"
      exit 0 ;;
    *) TARGET_DIR="$1"; shift ;;
  esac
done

if [ "$INSTALL_CRON" = "1" ]; then
  cat >/etc/cron.d/dashboard-backup <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * root /opt/dashboard/scripts/backup.sh >>/var/log/dashboard-backup.log 2>&1
EOF
  chmod 0644 /etc/cron.d/dashboard-backup
  log_ok "daily backup at 02:30 installed at /etc/cron.d/dashboard-backup"
  exit 0
fi

BACKUP_DIR="${TARGET_DIR:-$DEFAULT_BACKUP_DIR}"
install -d -o dashboard -g dashboard -m 0750 "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/dashboard-$STAMP.db"

log_step "Snapshotting $DATA_DIR/dashboard.db → $TARGET"
sqlite3 "$DATA_DIR/dashboard.db" ".backup '$TARGET'"
chmod 0640 "$TARGET"
chown dashboard:dashboard "$TARGET"

# Keep last 30 days
find "$BACKUP_DIR" -name 'dashboard-*.db' -mtime +30 -delete

log_ok "backup complete: $TARGET"
