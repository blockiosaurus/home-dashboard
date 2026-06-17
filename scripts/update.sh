#!/usr/bin/env bash
# scripts/update.sh — pull latest sources, rebuild, restart the service.
# Run as root on the Pi: sudo scripts/update.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/log.sh
. "$SCRIPT_DIR/lib/log.sh"
require_root "$@"

INSTALL_DIR=/opt/dashboard
SERVICE_USER=dashboard

if [ ! -d "$INSTALL_DIR/.git" ]; then
  log_error "$INSTALL_DIR is not a git checkout; re-run install.sh first."
  exit 1
fi

log_step "Pulling latest"
sudo -u "$SERVICE_USER" -H bash -lc "cd $INSTALL_DIR && git pull --ff-only"

log_step "Installing dependencies"
sudo -u "$SERVICE_USER" -H bash -lc "cd $INSTALL_DIR && pnpm install --frozen-lockfile"

log_step "Building"
sudo -u "$SERVICE_USER" -H bash -lc "cd $INSTALL_DIR && pnpm -r build"

# Refresh deploy artifacts that may have changed (systemd units, helper
# scripts, Avahi advert, xcursor theme). These are idempotent installs.
log_step "Refreshing deploy artifacts"
install -m 0644 "$INSTALL_DIR/deploy/dashboard.service" /etc/systemd/system/dashboard.service
install -m 0644 "$INSTALL_DIR/deploy/cage.service" /etc/systemd/system/cage.service
install -m 0755 "$INSTALL_DIR/deploy/cage-rotated" /usr/local/bin/cage-rotated
install -m 0644 "$INSTALL_DIR/deploy/avahi/dashboard.service" /etc/avahi/services/dashboard.service
install -d /usr/share/icons/blank/cursors
touch /usr/share/icons/blank/cursors/default
cat >/usr/share/icons/blank/index.theme <<'EOF'
[Icon Theme]
Name=blank
Inherits=core
EOF
systemctl daemon-reload

log_step "Restarting services"
systemctl restart dashboard.service
# cage may not be running yet (e.g. during initial setup); ignore failure.
systemctl restart cage.service 2>/dev/null || true

log_ok "Update complete."
