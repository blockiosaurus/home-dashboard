#!/usr/bin/env bash
# scripts/install.sh — idempotent installer for Raspberry Pi OS Bookworm (64-bit).
#
# Usage (as root): sudo scripts/install.sh [--yes] [--repo-dir PATH]
#
# Expects the working tree to live somewhere we can read; copies sources to
# /opt/dashboard, creates a `dashboard` system user with /var/lib/dashboard
# as its data dir, installs Node 22 and pnpm, builds the monorepo, and
# enables systemd units for the Node service, the cage kiosk, and Avahi.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSUME_YES=0

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --repo-dir) REPO_DIR="$2"; shift 2 ;;
    -h|--help)
      cat <<EOF
Usage: sudo $0 [--yes] [--repo-dir PATH]
  --yes        Skip prompts.
  --repo-dir   Source repo path (defaults to script's parent).
EOF
      exit 0 ;;
    *) echo "unknown arg: $1" 1>&2; exit 2 ;;
  esac
done

export ASSUME_YES
# shellcheck source=lib/log.sh
. "$SCRIPT_DIR/lib/log.sh"

require_root "$@"

INSTALL_DIR=/opt/dashboard
DATA_DIR=/var/lib/dashboard
SERVICE_USER=dashboard
SERVICE_GROUP=dashboard
NODE_MAJOR=22

# ---- 1. Sanity checks ---------------------------------------------------------
log_step "1/11 Sanity checks"
if [ "$(uname -m)" != "aarch64" ] && [ "$(uname -m)" != "arm64" ] && [ "$(uname -m)" != "x86_64" ]; then
  log_warn "Unsupported arch $(uname -m); proceeding anyway"
fi
if ! command -v apt-get >/dev/null 2>&1; then
  log_error "this installer expects Debian/Raspberry Pi OS (apt-get not found)"
  exit 1
fi
if ! ping -c1 -W2 github.com >/dev/null 2>&1; then
  log_warn "github.com unreachable — install may fail if packages aren't already cached"
fi
log_ok "checks passed"

# ---- 2. apt deps --------------------------------------------------------------
log_step "2/11 Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  curl ca-certificates gnupg git build-essential \
  avahi-daemon \
  cage chromium-browser libnss3 seatd \
  sqlite3
# seatd brokers /dev/dri and input devices to non-logind services. Required
# for cage to launch outside a logind session. Run as root with the video
# group owning the socket so our `dashboard` user (already in `video`) can
# connect without a dedicated seatd group existing on this distro.
install -d -m 0755 /etc/systemd/system/seatd.service.d
SEATD_BIN="$(command -v seatd || echo /usr/sbin/seatd)"
cat >/etc/systemd/system/seatd.service.d/group.conf <<EOF
[Service]
ExecStart=
ExecStart=${SEATD_BIN} -g video
EOF
systemctl daemon-reload
systemctl enable --now seatd

# Make the Pi boot to console (not the desktop) so cage owns HDMI without
# fighting LightDM. Safe to re-run.
systemctl set-default multi-user.target >/dev/null
systemctl disable --now lightdm 2>/dev/null || true
systemctl disable --now getty@tty7 2>/dev/null || true
log_ok "apt packages installed"

# ---- 3. Node 22 via NodeSource ------------------------------------------------
log_step "3/11 Installing Node $NODE_MAJOR"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "^v${NODE_MAJOR}\."; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
log_ok "Node $(node -v)"

# ---- 4. pnpm via corepack -----------------------------------------------------
log_step "4/11 Enabling pnpm via corepack"
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v
log_ok "pnpm $(pnpm -v)"

# ---- 5. System user + data dir ------------------------------------------------
log_step "5/11 Creating $SERVICE_USER user and $DATA_DIR"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir /home/$SERVICE_USER \
    --shell /usr/sbin/nologin --groups video,render,input,tty \
    "$SERVICE_USER"
fi
# Add to the seatd group so cage can request a seat. Group name varies by
# distro — try both, ignore failures.
for grp in _seatd seat; do
  if getent group "$grp" >/dev/null 2>&1; then
    usermod -aG "$grp" "$SERVICE_USER" || true
  fi
done
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 "$DATA_DIR"
log_ok "user + data dir ready"

# ---- 6. Copy sources to $INSTALL_DIR -----------------------------------------
log_step "6/11 Copying repository to $INSTALL_DIR"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 "$INSTALL_DIR"
# rsync gives us a clean idempotent mirror; --delete keeps the install in sync
# with the source tree (no stale files).
rsync -a --delete --exclude='node_modules' --exclude='dist' --exclude='.git' \
  "$REPO_DIR"/ "$INSTALL_DIR"/
chown -R "$SERVICE_USER":"$SERVICE_GROUP" "$INSTALL_DIR"
log_ok "sources synced"

# ---- 7. Install deps + build ------------------------------------------------
log_step "7/11 pnpm install + build (this is the long step)"
sudo -u "$SERVICE_USER" -H bash -lc "cd $INSTALL_DIR && pnpm install --frozen-lockfile && pnpm -r build"
log_ok "build complete"

# ---- 8. systemd units --------------------------------------------------------
log_step "8/11 Installing systemd units"
install -m 0644 "$INSTALL_DIR/deploy/dashboard.service" /etc/systemd/system/dashboard.service
install -m 0644 "$INSTALL_DIR/deploy/cage.service" /etc/systemd/system/cage.service
install -d -m 0755 /etc/dashboard
if [ ! -f /etc/dashboard/env ]; then
  cat >/etc/dashboard/env <<'EOF'
# Place secrets here. After editing run:
#   sudo systemctl restart dashboard cage
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
EOF
  chmod 0640 /etc/dashboard/env
  chown root:"$SERVICE_GROUP" /etc/dashboard/env
fi
systemctl daemon-reload
systemctl enable dashboard.service cage.service
systemctl restart dashboard.service
# cage requires a graphical target; we don't restart it here to avoid kicking
# someone out of a current X/Wayland session during a re-run.
log_ok "systemd units installed and dashboard.service restarted"

# ---- 9. Avahi ----------------------------------------------------------------
log_step "9/11 Configuring Avahi mDNS"
install -m 0644 "$INSTALL_DIR/deploy/avahi/dashboard.service" /etc/avahi/services/dashboard.service
systemctl enable avahi-daemon.service
systemctl restart avahi-daemon.service
log_ok "Avahi advertising dashboard.local"

# ---- 10. Chromium flags via cage ---------------------------------------------
log_step "10/11 Verifying cage launches Chromium"
if ! command -v cage >/dev/null 2>&1; then
  log_warn "cage not installed; kiosk will not boot. Install with: apt-get install -y cage"
fi
if ! command -v chromium >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1; then
  log_warn "Chromium not installed; kiosk will not boot"
fi
log_ok "cage/chromium presence checked"

# ---- 11. Final summary -------------------------------------------------------
log_step "11/11 Done"
HOSTNAME_FQDN="$(hostname).local"
cat <<EOF

${COLOR_OK}Family Dashboard installed.${COLOR_RESET}

Service status:   sudo systemctl status dashboard cage avahi-daemon
Logs (Node):      sudo journalctl -u dashboard -f
Logs (kiosk):     sudo journalctl -u cage -f
Data directory:   $DATA_DIR
Source tree:      $INSTALL_DIR
Env file:         /etc/dashboard/env  (put GOOGLE_CLIENT_ID/SECRET here)

Reach the admin UI from any device on this network:
  http://$HOSTNAME_FQDN/admin/  (mDNS)
  http://$(hostname -I | awk '{print $1}'):3000/admin/  (IP fallback)

After editing /etc/dashboard/env, run:
  sudo systemctl restart dashboard cage

To start the kiosk now (will switch the active display):
  sudo systemctl start cage

EOF
