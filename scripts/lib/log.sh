# scripts/lib/log.sh — shared logging used by install/update/backup scripts.
# Intended to be sourced, not executed.

if [ -t 1 ]; then
  COLOR_RESET=$'\033[0m'
  COLOR_INFO=$'\033[1;34m'
  COLOR_OK=$'\033[1;32m'
  COLOR_WARN=$'\033[1;33m'
  COLOR_ERR=$'\033[1;31m'
else
  COLOR_RESET=""; COLOR_INFO=""; COLOR_OK=""; COLOR_WARN=""; COLOR_ERR=""
fi

log_info()  { printf "%s[info]%s %s\n" "$COLOR_INFO" "$COLOR_RESET" "$*"; }
log_ok()    { printf "%s[ ok ]%s %s\n" "$COLOR_OK"   "$COLOR_RESET" "$*"; }
log_warn()  { printf "%s[warn]%s %s\n" "$COLOR_WARN" "$COLOR_RESET" "$*"; }
log_error() { printf "%s[err ]%s %s\n" "$COLOR_ERR"  "$COLOR_RESET" "$*" 1>&2; }
log_step()  { printf "\n%s== %s ==%s\n" "$COLOR_INFO" "$*" "$COLOR_RESET"; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log_error "must be run as root (try: sudo $0 $*)"
    exit 1
  fi
}

confirm() {
  local prompt="$1"
  if [ "${ASSUME_YES:-0}" = "1" ]; then
    return 0
  fi
  read -r -p "$prompt [y/N]: " reply
  [ "$reply" = "y" ] || [ "$reply" = "Y" ]
}
