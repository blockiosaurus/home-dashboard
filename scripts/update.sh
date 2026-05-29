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

log_step "Restarting dashboard service"
systemctl restart dashboard.service

log_ok "Update complete."
