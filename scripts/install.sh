#!/usr/bin/env bash
# scripts/install.sh — idempotent installer for Raspberry Pi OS Bookworm (64-bit).
#
# Usage (as root):
#   sudo scripts/install.sh [--yes] [--repo-dir PATH] [--no-kiosk] \
#     [--google-client-id ID] [--google-client-secret SECRET]
#
# Expects the working tree to live somewhere we can read; copies sources to
# /opt/dashboard, creates a `dashboard` system user with /var/lib/dashboard
# as its data dir, installs Node 22 and pnpm, builds the monorepo, and
# enables systemd units for the Node service, the cage kiosk, and Avahi.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSUME_YES=0
NO_KIOSK=0
GOOGLE_CLIENT_ID_ARG=""
GOOGLE_CLIENT_ID_ARG_SET=0
GOOGLE_CLIENT_SECRET_ARG=""
GOOGLE_CLIENT_SECRET_ARG_SET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1; shift ;;
    --repo-dir) REPO_DIR="$2"; shift 2 ;;
    --no-kiosk) NO_KIOSK=1; shift ;;
    --google-client-id) GOOGLE_CLIENT_ID_ARG="$2"; GOOGLE_CLIENT_ID_ARG_SET=1; shift 2 ;;
    --google-client-secret) GOOGLE_CLIENT_SECRET_ARG="$2"; GOOGLE_CLIENT_SECRET_ARG_SET=1; shift 2 ;;
    -h|--help)
      cat <<EOF
Usage: sudo $0 [--yes] [--repo-dir PATH] [--no-kiosk] [--google-client-id ID] [--google-client-secret SECRET]
  --yes                     Skip prompts.
  --repo-dir PATH           Source repo path (defaults to script's parent).
  --no-kiosk                Don't start cage.service after install.
  --google-client-id ID     Google OAuth client id; written to /etc/dashboard/env
                            (only that line changes, independent of --google-client-secret).
  --google-client-secret S  Google OAuth client secret; written to /etc/dashboard/env
                            (only that line changes, independent of --google-client-id).
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
  cage chromium-browser libnss3 seatd wlr-randr \
  fontconfig fonts-noto-core \
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

# gnome-keyring intercepts secret-service requests and pops up a dialog
# Chromium kiosk can't dismiss. Remove it — nothing on the dashboard
# needs it once we pass --password-store=basic to Chromium.
apt-get purge -y gnome-keyring gnome-keyring-pkcs11 2>/dev/null || true

# Blank xcursor theme so cage doesn't draw a cursor on the touchscreen.
install -d /usr/share/icons/blank/cursors
touch /usr/share/icons/blank/cursors/default
cat >/usr/share/icons/blank/index.theme <<'EOF'
[Icon Theme]
Name=blank
Inherits=core
EOF
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
# `corepack enable` (run as root) only installs the shim binaries to
# /usr/local/bin. The actual pnpm package is downloaded into the running
# user's ~/.cache on first invocation — we prepare it as the dashboard
# user later (Step 7) so the cache ends up owned correctly.
corepack enable
log_ok "corepack shims installed"

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
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0755 "$DATA_DIR/photos"
install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0700 "$DATA_DIR/chromium-profile"
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
# Prime corepack's pnpm cache as the dashboard user so the cache lives at
# /home/dashboard/.cache/node/corepack and is readable when systemd runs
# the service. Belt-and-suspenders: chown the home dir afterward.
sudo -u "$SERVICE_USER" -H bash -lc "corepack prepare pnpm@9.15.0 --activate"
sudo -u "$SERVICE_USER" -H bash -lc "cd $INSTALL_DIR && pnpm install --frozen-lockfile && pnpm -r build"
chown -R "$SERVICE_USER":"$SERVICE_GROUP" "/home/$SERVICE_USER"
log_ok "build complete"

# ---- 8. systemd units --------------------------------------------------------
log_step "8/11 Installing systemd units"
install -m 0644 "$INSTALL_DIR/deploy/dashboard.service" /etc/systemd/system/dashboard.service
install -m 0644 "$INSTALL_DIR/deploy/cage.service" /etc/systemd/system/cage.service
install -m 0755 "$INSTALL_DIR/deploy/cage-rotated" /usr/local/bin/cage-rotated
# Wipe an older OS-level touchscreen calibration if present — CSS rotation
# in the dashboard SPA handles touch translation natively.
rm -f /etc/udev/rules.d/99-touchscreen-rotate.rules
udevadm control --reload 2>/dev/null || true
udevadm trigger 2>/dev/null || true
install -d -m 0755 /etc/dashboard
if [ ! -f /etc/dashboard/env ]; then
  cat >/etc/dashboard/env <<'EOF'
# Place secrets here. After editing run:
#   sudo systemctl restart dashboard
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
EOF
  chmod 0640 /etc/dashboard/env
  chown root:"$SERVICE_GROUP" /etc/dashboard/env
fi

# Google OAuth credentials: take them from flags, prompt for whichever one is
# missing (unless --yes). Each of GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET= is
# rewritten independently and ONLY when its own value is non-empty — a value
# that was never provided (no flag, blank at the prompt, or skipped entirely
# under --yes) leaves that line exactly as it already was (still commented in
# the template, or whatever was set on a previous run). This avoids a footgun
# where updating just one credential would blank out the other.
GOOGLE_CLIENT_ID_VALUE="$GOOGLE_CLIENT_ID_ARG"
GOOGLE_CLIENT_SECRET_VALUE="$GOOGLE_CLIENT_SECRET_ARG"
if [ "$ASSUME_YES" != "1" ]; then
  if [ -t 0 ]; then
    if [ "$GOOGLE_CLIENT_ID_ARG_SET" != "1" ]; then
      read -r -p "Google OAuth client id (leave blank to skip): " GOOGLE_CLIENT_ID_VALUE || true
    fi
    if [ "$GOOGLE_CLIENT_SECRET_ARG_SET" != "1" ]; then
      read -rs -p "Google OAuth client secret (leave blank to skip): " GOOGLE_CLIENT_SECRET_VALUE || true
      echo
    fi
  elif [ "$GOOGLE_CLIENT_ID_ARG_SET" != "1" ] || [ "$GOOGLE_CLIENT_SECRET_ARG_SET" != "1" ]; then
    # stdin isn't a terminal (piped, ssh host cmd, cron) — a bare `read` would
    # hit EOF and, under `set -e`, take the whole installer down with it.
    # Skip the prompt instead of risking that.
    log_warn "stdin is not a terminal; skipping the Google OAuth prompt — add credentials later by editing /etc/dashboard/env"
  fi
fi

ENV_CHANGED=0
if [ -n "$GOOGLE_CLIENT_ID_VALUE" ] || [ -n "$GOOGLE_CLIENT_SECRET_VALUE" ]; then
  HAVE_ID=0
  [ -n "$GOOGLE_CLIENT_ID_VALUE" ] && HAVE_ID=1
  HAVE_SECRET=0
  [ -n "$GOOGLE_CLIENT_SECRET_VALUE" ] && HAVE_SECRET=1
  ENV_TMP="$(mktemp)"
  trap 'rm -f "$ENV_TMP"' EXIT
  # Credential values go through the environment (ENVIRON), not `awk -v`:
  # `-v var=value`/command-line assignments run C-style backslash-escape
  # processing on the string, so a secret containing `\n`, `\t`, or `\\`
  # would come out mangled (split across lines, truncated, or re-escaped).
  # Environment variables are handed to awk unprocessed.
  GOOGLE_ID="$GOOGLE_CLIENT_ID_VALUE" GOOGLE_SECRET="$GOOGLE_CLIENT_SECRET_VALUE" \
    awk -v have_id="$HAVE_ID" -v have_secret="$HAVE_SECRET" '
    have_id == 1 && /^#?[[:space:]]*GOOGLE_CLIENT_ID=/ { print "GOOGLE_CLIENT_ID=" ENVIRON["GOOGLE_ID"]; id_done = 1; next }
    have_secret == 1 && /^#?[[:space:]]*GOOGLE_CLIENT_SECRET=/ { print "GOOGLE_CLIENT_SECRET=" ENVIRON["GOOGLE_SECRET"]; secret_done = 1; next }
    { print }
    END {
      if (have_id == 1 && !id_done) print "GOOGLE_CLIENT_ID=" ENVIRON["GOOGLE_ID"]
      if (have_secret == 1 && !secret_done) print "GOOGLE_CLIENT_SECRET=" ENVIRON["GOOGLE_SECRET"]
    }
  ' /etc/dashboard/env >"$ENV_TMP"
  if cmp -s /etc/dashboard/env "$ENV_TMP"; then
    log_ok "Google OAuth credentials already up to date in /etc/dashboard/env"
  else
    install -m 0640 -o root -g "$SERVICE_GROUP" "$ENV_TMP" /etc/dashboard/env
    ENV_CHANGED=1
    log_ok "Google OAuth credentials written to /etc/dashboard/env"
  fi
  rm -f "$ENV_TMP"
  trap - EXIT
else
  log_warn "Google OAuth credentials skipped — add them later by editing /etc/dashboard/env"
fi

systemctl daemon-reload
systemctl enable dashboard.service cage.service
# dashboard.service always gets restarted here regardless of ENV_CHANGED:
# steps 6-7 just rsynced and rebuilt the app from source, so the running
# process (if any) is already serving stale code and needs a reload on
# every install/re-run — not only when credentials changed. See
# scripts/update.sh, which restarts unconditionally for the same reason.
systemctl restart dashboard.service
if [ "$NO_KIOSK" = "1" ]; then
  log_warn "--no-kiosk passed; not starting cage.service"
else
  systemctl is-active --quiet cage || systemctl start cage
fi
if [ "$ENV_CHANGED" = "1" ]; then
  log_ok "systemd units installed; dashboard.service restarted (new build + updated credentials)"
else
  log_ok "systemd units installed; dashboard.service restarted (new build)"
fi

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
# The server listens on PORT (default 3000) and is not behind a reverse proxy,
# so every printed URL needs the port — the touchscreen shows it too.
ADMIN_PORT="$(sed -n 's/^PORT=//p' /etc/dashboard/env 2>/dev/null | tr -d "\"' " | tail -n1)"
ADMIN_PORT="${ADMIN_PORT:-3000}"
KIOSK_NOTE=""
if [ "$NO_KIOSK" = "1" ]; then
  KIOSK_NOTE="
Kiosk not started (--no-kiosk passed). Start it with:
  sudo systemctl start cage
"
fi
cat <<EOF

${COLOR_OK}Family Dashboard installed.${COLOR_RESET}

Reach the admin UI from any device on this network:
  http://$HOSTNAME_FQDN:$ADMIN_PORT/admin/  (mDNS)
  http://$(hostname -I | awk '{print $1}'):$ADMIN_PORT/admin/  (IP fallback)

Look at the touchscreen: it shows this same address and a QR code.
$KIOSK_NOTE
Service status:   sudo systemctl status dashboard cage avahi-daemon
Logs (Node):      sudo journalctl -u dashboard -f
Logs (kiosk):     sudo journalctl -u cage -f
Data directory:   $DATA_DIR
Source tree:      $INSTALL_DIR
Env file:         /etc/dashboard/env  (put GOOGLE_CLIENT_ID/SECRET here)

After editing /etc/dashboard/env, run:
  sudo systemctl restart dashboard

EOF
