# Pi Install & Ops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the dashboard onto a fresh Raspberry Pi 4 with one command. Deliver `scripts/install.sh` (idempotent, takes a clean Pi OS Bookworm 64-bit through every step), `scripts/update.sh` and `scripts/backup.sh` for ongoing ops, the systemd units the installer drops in place, an Avahi service file that advertises `dashboard.local`, and a working "Disconnect Google account" path that was deferred from Plan 3. End state: tag `v1.0.0`.

**Architecture:** A single `install.sh` performs OS sanity checks, installs OS packages (`avahi-daemon`, `cage`, `chromium-browser`, `libnss3`, `build-essential`, git, curl), installs Node 22 via NodeSource, installs pnpm via corepack, creates a `dashboard` system user with `/var/lib/dashboard` as the data dir, builds the monorepo, copies systemd units, enables Avahi, and prints the OAuth setup URL. A `cage.service` runs the Wayland kiosk pointing at `localhost:3000`. The dashboard runs as `dashboard.service` (Type=simple, Restart=always). Re-running install is safe — every step checks state first.

**Tech Stack:** Bash, systemd, Avahi, cage compositor, Chromium, Node 22 via NodeSource, pnpm via corepack.

---

## File Plan

New files:

- `scripts/install.sh` — one-shot Pi installer
- `scripts/update.sh` — pull + rebuild + restart
- `scripts/backup.sh` — SQLite snapshot
- `scripts/lib/log.sh` — shared logging helpers used by all scripts
- `deploy/dashboard.service` — systemd unit (Node server)
- `deploy/cage.service` — systemd unit (kiosk compositor)
- `deploy/avahi/dashboard.service` — mDNS advertisement for `dashboard.local`
- `docs/dev/install.md` — install + ops procedure for humans
- `docs/dev/upgrades.md` — update procedure

New server code:

- `packages/server/src/auth/google-revoke.ts` — revoke endpoint helper
- `packages/server/src/routes/accounts-write.ts` — `DELETE /api/accounts/:id`

Modified server / admin:

- `packages/server/src/app.ts` — register `accounts-write` routes
- `packages/server/src/db/seed.ts` — seed a `Sleep` scene + schedule rule
- `packages/server/src/db/seed.test.ts` — assert both scenes
- `packages/admin/src/components/AccountsPanel.tsx` — enable Disconnect button
- `packages/admin/src/api.ts` — `deleteAccount` helper

---

## Phase 0: Disconnect Google Account

### Task 1: Token revocation helper + DELETE /api/accounts/:id

**Files:**

- Create: `packages/server/src/auth/google-revoke.ts`
- Create: `packages/server/src/auth/google-revoke.test.ts`
- Create: `packages/server/src/routes/accounts-write.ts`
- Create: `packages/server/src/routes/accounts-write.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write failing test for revokeRefreshToken**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { revokeRefreshToken } from './google-revoke'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))
afterEach(() => fetchMock.mockReset())

describe('revokeRefreshToken', () => {
  it('POSTs the token to Google revoke endpoint', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    await revokeRefreshToken('rt-secret')
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://oauth2.googleapis.com/revoke')
    expect((init as { body: URLSearchParams }).body.toString()).toContain('token=rt-secret')
  })

  it('does not throw on 400 (token already revoked)', async () => {
    fetchMock.mockResolvedValue(new Response('invalid_token', { status: 400 }))
    await expect(revokeRefreshToken('rt')).resolves.toBeUndefined()
  })

  it('throws on 5xx', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    await expect(revokeRefreshToken('rt')).rejects.toThrow(/revoke failed/)
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @dashboard/server test -- src/auth/google-revoke.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `auth/google-revoke.ts`**

```ts
import { fetch } from 'undici'

export const revokeRefreshToken = async (refreshToken: string): Promise<void> => {
  const res = await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: refreshToken }),
  })
  // 200 = revoked. 400 with invalid_token = already revoked — both are success for us.
  if (res.status === 200 || res.status === 400) return
  throw new Error(`revoke failed: ${res.status}`)
}
```

- [ ] **Step 4: Re-run revoke test**

Expected: PASS.

- [ ] **Step 5: Write failing test for DELETE /api/accounts/:id**

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../app'
import { createEncryptor, deriveKey } from '../auth/encryption'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))
afterEach(() => fetchMock.mockReset())

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('accounts-write', () => {
  it('DELETE revokes token and removes row', async () => {
    const app = await buildApp({ dataDir: dir })
    app.db.prepare("INSERT INTO kv (key, value) VALUES ('salt', 'S')").run()
    const key = await deriveKey('dev-machine', 'S')
    const enc = await createEncryptor(key)
    app.db
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('a1', 'google', '', ?, 'calendar', ?)`,
      )
      .run(enc.encrypt('rt-secret'), Date.now())

    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    const res = await app.inject({ method: 'DELETE', url: '/api/accounts/a1' })
    expect(res.statusCode).toBe(204)
    expect(fetchMock).toHaveBeenCalled()
    const row = app.db.prepare('SELECT id FROM accounts WHERE id = ?').get('a1')
    expect(row).toBeUndefined()
    await app.close()
  })

  it('DELETE returns 404 for unknown account', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'DELETE', url: '/api/accounts/missing' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
```

- [ ] **Step 6: Run and verify failure**

Expected: FAIL.

- [ ] **Step 7: Implement `routes/accounts-write.ts`**

```ts
import type Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { createEncryptor, deriveKey } from '../auth/encryption'
import { revokeRefreshToken } from '../auth/google-revoke'

export interface AccountsWriteDeps {
  machineId: string
}

export const registerAccountsWriteRoutes = (
  app: FastifyInstance,
  db: Database.Database,
  deps: AccountsWriteDeps,
) => {
  app.delete<{ Params: { id: string } }>('/api/accounts/:id', async (req, reply) => {
    const row = db
      .prepare('SELECT refresh_token_encrypted FROM accounts WHERE id = ?')
      .get(req.params.id) as { refresh_token_encrypted: string } | undefined
    if (!row) {
      reply.code(404)
      return { error: 'not found' }
    }
    const saltRow = db.prepare("SELECT value FROM kv WHERE key='salt'").get() as
      | { value: string }
      | undefined
    if (saltRow) {
      try {
        const key = await deriveKey(deps.machineId, saltRow.value)
        const enc = await createEncryptor(key)
        const refreshToken = enc.decrypt(row.refresh_token_encrypted)
        await revokeRefreshToken(refreshToken)
      } catch (err) {
        app.log.warn({ err }, 'token revocation failed; deleting row anyway')
      }
    }
    db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id)
    reply.code(204)
    return null
  })
}
```

- [ ] **Step 8: Wire into `app.ts`**

```ts
import { registerAccountsWriteRoutes } from './routes/accounts-write'
registerAccountsWriteRoutes(app, db.raw, { machineId })
```

Place after the existing `registerAccountsRoutes(app, db.raw)` call. `machineId` is already defined earlier in app.ts (from Plan 1, Task 33 / Plan 2).

- [ ] **Step 9: Run all server tests**

Expected: 59 passing.

- [ ] **Step 10: Commit**

```bash
git add packages/server
git commit -m "feat(server): DELETE /api/accounts/:id with token revocation"
```

### Task 2: Wire Disconnect button in admin

**Files:**

- Modify: `packages/admin/src/api.ts`
- Modify: `packages/admin/src/components/AccountsPanel.tsx`

- [ ] **Step 1: Add `deleteAccount` helper to `api.ts`**

Append to the `api` object:

```ts
  deleteAccount: async (id: string) => {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) throw new Error('account delete failed')
  },
```

- [ ] **Step 2: Replace `AccountsPanel.tsx`**

```tsx
import { Button, Card } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'

interface Account {
  id: string
  email: string
  provider: string
  created_at: number
}

export const AccountsPanel = () => {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['accounts'],
    queryFn: async () => {
      const res = await fetch('/api/accounts')
      if (!res.ok) throw new Error('accounts fetch failed')
      return res.json() as Promise<{ accounts: Account[] }>
    },
  })
  const disconnect = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  })
  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Accounts
      </h3>
      <div className="mt-3 space-y-2">
        {(data?.accounts ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-dim)]">No Google account connected.</p>
        ) : (
          (data?.accounts ?? []).map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-lg border border-[var(--text-dim)]/20 p-3"
            >
              <span className="text-sm font-semibold">{a.email || a.provider}</span>
              <Button
                variant="secondary"
                onClick={() => disconnect.mutate(a.id)}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
```

- [ ] **Step 3: Build + commit**

```bash
pnpm --filter @dashboard/admin build
git add packages/admin
git commit -m "feat(admin): enable Disconnect Google account button"
```

---

## Phase 1: Deploy Artifacts

### Task 3: `dashboard.service` systemd unit

**Files:**

- Create: `deploy/dashboard.service`

- [ ] **Step 1: Write `deploy/dashboard.service`**

```ini
[Unit]
Description=Family Dashboard (Node server)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=dashboard
Group=dashboard
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=DATA_DIR=/var/lib/dashboard
EnvironmentFile=-/etc/dashboard/env
WorkingDirectory=/opt/dashboard
ExecStart=/usr/bin/pnpm --filter @dashboard/server start
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/dashboard

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Commit**

```bash
mkdir -p deploy
git add deploy/dashboard.service
git commit -m "feat(deploy): systemd unit for dashboard server"
```

### Task 4: `cage.service` kiosk unit

**Files:**

- Create: `deploy/cage.service`

- [ ] **Step 1: Write `deploy/cage.service`**

```ini
[Unit]
Description=Family Dashboard Kiosk (cage + Chromium)
After=dashboard.service network-online.target
Requires=dashboard.service

[Service]
Type=simple
User=dashboard
Group=dashboard
PAMName=login
TTYPath=/dev/tty7
StandardInput=tty
StandardOutput=journal
StandardError=journal
UtmpIdentifier=tty7
UtmpMode=user

Environment=XDG_RUNTIME_DIR=/run/user/1001
Environment=WLR_LIBINPUT_NO_DEVICES=1
Environment=MOZ_ENABLE_WAYLAND=1

ExecStartPre=/usr/bin/install -d -o dashboard -g dashboard -m 0700 /run/user/1001
ExecStart=/usr/bin/cage -s -- /usr/bin/chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --check-for-update-interval=31536000 \
  --no-first-run \
  --ozone-platform=wayland \
  --enable-features=UseOzonePlatform \
  --start-fullscreen \
  http://localhost:3000/

Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
```

- [ ] **Step 2: Commit**

```bash
git add deploy/cage.service
git commit -m "feat(deploy): systemd unit for cage Wayland kiosk"
```

### Task 5: Avahi mDNS service file

**Files:**

- Create: `deploy/avahi/dashboard.service`

- [ ] **Step 1: Create `deploy/avahi/dashboard.service`**

```bash
mkdir -p deploy/avahi
```

```xml
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">Family Dashboard on %h</name>
  <service>
    <type>_http._tcp</type>
    <port>3000</port>
    <txt-record>path=/admin/</txt-record>
  </service>
</service-group>
```

- [ ] **Step 2: Commit**

```bash
git add deploy/avahi/dashboard.service
git commit -m "feat(deploy): Avahi mDNS advert for dashboard.local"
```

### Task 6: Seed a Sleep scene + schedule

**Files:**

- Modify: `packages/server/src/db/seed.ts`
- Modify: `packages/server/src/db/seed.test.ts`

- [ ] **Step 1: Write failing test**

In `packages/server/src/db/seed.test.ts`, append a third test:

```ts
  it('also seeds a Sleep scene with a schedule rule', () => {
    const { db, close } = openDatabase(dir)
    seedDefaultScene(db.raw)
    const sceneNames = (db.all<{ name: string }>('SELECT name FROM scenes')).map((r) => r.name)
    expect(sceneNames).toEqual(expect.arrayContaining(['Active', 'Sleep']))
    const rules = db.all<{ scene_id: string; cron_expr: string }>(
      'SELECT scene_id, cron_expr FROM scene_schedule',
    )
    expect(rules).toHaveLength(2)
    const sleepRule = rules.find((r) => r.scene_id === 'sleep')
    const wakeRule = rules.find((r) => r.scene_id === 'default')
    expect(sleepRule?.cron_expr).toBe('0 22 * * *')
    expect(wakeRule?.cron_expr).toBe('0 7 * * *')
    close()
  })
```

- [ ] **Step 2: Run and verify failure**

Expected: FAIL.

- [ ] **Step 3: Update `seed.ts`**

Replace the function to also seed Sleep + rules:

```ts
import type Database from 'better-sqlite3'

const sleepCells = [
  { instanceId: 'clock-sleep', widgetId: 'clock', x: 0, y: 0, w: 8, h: 2, config: { format: '12h' } },
  {
    instanceId: 'agenda-sleep',
    widgetId: 'agenda',
    x: 0,
    y: 2,
    w: 8,
    h: 3,
    config: { daysAhead: 1, title: 'Up next' },
  },
  {
    instanceId: 'photos-sleep',
    widgetId: 'slideshow',
    x: 0,
    y: 5,
    w: 8,
    h: 7,
    config: { albumId: 'placeholder' },
  },
]

export const seedDefaultScene = (db: Database.Database) => {
  const existing = db.prepare('SELECT id FROM scenes WHERE is_default = 1').get()
  if (existing) return
  const now = Date.now()
  const activeCells = [
    { instanceId: 'clock-1', widgetId: 'clock', x: 0, y: 0, w: 8, h: 1, config: {} },
    {
      instanceId: 'weather-1',
      widgetId: 'weather',
      x: 5,
      y: 1,
      w: 3,
      h: 2,
      config: { lat: 40.7128, lon: -74.006, unit: 'fahrenheit', label: 'NYC' },
    },
    { instanceId: 'agenda-1', widgetId: 'agenda', x: 0, y: 1, w: 5, h: 2, config: { daysAhead: 1 } },
    {
      instanceId: 'cal-1',
      widgetId: 'calendar',
      x: 0,
      y: 3,
      w: 8,
      h: 4,
      config: { view: 'week' },
    },
    {
      instanceId: 'photos-1',
      widgetId: 'slideshow',
      x: 5,
      y: 7,
      w: 3,
      h: 5,
      config: { albumId: 'placeholder' },
    },
    {
      instanceId: 'chores-1',
      widgetId: 'chores',
      x: 0,
      y: 7,
      w: 3,
      h: 3,
      config: { instanceId: 'chores-1', title: 'Chores', initial: [] },
    },
    {
      instanceId: 'meal-1',
      widgetId: 'meal-plan',
      x: 3,
      y: 7,
      w: 2,
      h: 3,
      config: { instanceId: 'meal-1', title: 'Meals' },
    },
    {
      instanceId: 'notes-1',
      widgetId: 'notes',
      x: 0,
      y: 10,
      w: 5,
      h: 2,
      config: { instanceId: 'notes-1', title: 'Notes' },
    },
    {
      instanceId: 'packages-1',
      widgetId: 'packages',
      x: 5,
      y: 10,
      w: 3,
      h: 2,
      config: { instanceId: 'packages-1', title: 'Packages' },
    },
  ]
  const insert = db.prepare(
    `INSERT INTO scenes (id, name, layout_json, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  insert.run('default', 'Active', JSON.stringify(activeCells), 1, now, now)
  insert.run('sleep', 'Sleep', JSON.stringify(sleepCells), 0, now, now)

  const rule = db.prepare(
    `INSERT INTO scene_schedule (id, scene_id, cron_expr, priority) VALUES (?, ?, ?, ?)`,
  )
  rule.run('sleep-22', 'sleep', '0 22 * * *', 10)
  rule.run('wake-07', 'default', '0 7 * * *', 10)
}
```

- [ ] **Step 4: Run all server tests**

Expected: 60 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/server
git commit -m "feat(server): seed Sleep scene + 22:00/07:00 schedule"
```

---

## Phase 2: Install / Update / Backup Scripts

### Task 7: `scripts/lib/log.sh` shared helpers

**Files:**

- Create: `scripts/lib/log.sh`

- [ ] **Step 1: Write the file**

```bash
mkdir -p scripts/lib
```

```sh
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
```

- [ ] **Step 2: Make executable bit explicit (not needed for sourced files; skip)**

(no chmod needed — sourced files don't need execute bit.)

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/log.sh
git commit -m "feat(scripts): shared logging helpers"
```

### Task 8: `scripts/install.sh` — one-shot Pi installer

**Files:**

- Create: `scripts/install.sh`

- [ ] **Step 1: Write the installer**

```bash
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
  cage chromium-browser libnss3 \
  sqlite3
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
```

- [ ] **Step 2: Make executable + commit**

```bash
chmod +x scripts/install.sh
git add scripts/install.sh
git commit -m "feat(scripts): one-shot Pi installer (install.sh)"
```

### Task 9: `scripts/update.sh`

**Files:**

- Create: `scripts/update.sh`

- [ ] **Step 1: Write the updater**

```bash
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
```

- [ ] **Step 2: Make executable + commit**

```bash
chmod +x scripts/update.sh
git add scripts/update.sh
git commit -m "feat(scripts): update.sh pulls and rebuilds in place"
```

Note: `update.sh` assumes `/opt/dashboard` is a git checkout. The default `install.sh` uses `rsync`, which does **not** copy `.git`. Document this in `docs/dev/upgrades.md` (Task 11) and recommend installing once via `git clone https://… /opt/dashboard` then `cd /opt/dashboard && sudo scripts/install.sh --repo-dir /opt/dashboard`. The rsync exclusion keeps the runtime install clean of build artifacts; for sites that want `update.sh`, install with a real git clone.

### Task 10: `scripts/backup.sh`

**Files:**

- Create: `scripts/backup.sh`

- [ ] **Step 1: Write the backup script**

```bash
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
```

- [ ] **Step 2: Make executable + commit**

```bash
chmod +x scripts/backup.sh
git add scripts/backup.sh
git commit -m "feat(scripts): backup.sh snapshots SQLite + optional cron installer"
```

---

## Phase 3: Documentation + Verification

### Task 11: Install + Operations docs

**Files:**

- Create: `docs/dev/install.md`
- Create: `docs/dev/upgrades.md`

- [ ] **Step 1: Write `docs/dev/install.md`**

```markdown
# Installing on a Raspberry Pi 4

## You need

- Raspberry Pi 4 (4GB or 8GB)
- Raspberry Pi OS Bookworm 64-bit (lite is fine)
- 18.5" touchscreen wired up (HDMI + USB for touch)
- The Pi attached to your home WiFi
- A Google Cloud OAuth 2.0 client of type "TVs and Limited Input devices"

## First boot

After flashing Raspberry Pi OS Bookworm:

1. SSH in (or open a terminal on the Pi).
2. Clone the repo into `/opt/dashboard`:

       sudo install -d -o pi -g pi /opt
       sudo chown pi:pi /opt
       git clone https://github.com/YOU/dashboard.git /opt/dashboard
       cd /opt/dashboard

3. Run the installer:

       sudo scripts/install.sh --repo-dir /opt/dashboard --yes

4. Edit `/etc/dashboard/env` and paste your Google OAuth client id + secret:

       sudo nano /etc/dashboard/env
       sudo systemctl restart dashboard

5. From any phone on your WiFi, open `http://dashboard.local/admin/` (or use the IP printed
   at the end of the installer output). Walk through the wizard.

6. Once the wizard finishes, start the kiosk:

       sudo systemctl start cage

   The dashboard appears on the touchscreen.

## Troubleshooting

- **Kiosk shows a black screen.** Check `journalctl -u cage -f`. Most often this means
  Chromium can't reach `localhost:3000`. Check `systemctl status dashboard`.
- **Can't reach `dashboard.local`.** Some Android devices don't speak mDNS reliably; use
  the IP printed by the installer instead.
- **Calendar doesn't sync.** Verify `/etc/dashboard/env` has both `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET`, and that the wizard completed an OAuth round-trip. Re-run the
  wizard via the admin's Settings page if needed.

## Logs

- Server: `sudo journalctl -u dashboard -f`
- Kiosk:  `sudo journalctl -u cage -f`
- Avahi:  `sudo journalctl -u avahi-daemon -f`

## Backups

`scripts/backup.sh` snapshots the SQLite DB to `/var/lib/dashboard/backups`. Install a
daily 02:30 cron:

    sudo scripts/backup.sh --install-cron
```

- [ ] **Step 2: Write `docs/dev/upgrades.md`**

```markdown
# Upgrading the dashboard

If `/opt/dashboard` is a git checkout (recommended):

    sudo /opt/dashboard/scripts/update.sh

This pulls the latest commit, runs `pnpm install --frozen-lockfile`, rebuilds all
packages, and restarts the dashboard service.

If `/opt/dashboard` was installed via `rsync` (no `.git`), re-run the installer with
the latest sources:

    sudo scripts/install.sh --repo-dir /path/to/fresh/checkout --yes

The DB at `/var/lib/dashboard/dashboard.db` is preserved across upgrades. Drizzle's
migrator applies any new migrations on the next dashboard.service start.
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/install.md docs/dev/upgrades.md
git commit -m "docs: install + upgrade procedures"
```

### Task 12: Final integration check + tag v1.0.0

**Files:** (none — verification only)

- [ ] **Step 1: Build + test + lint**

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm lint
```

Expected: green.

- [ ] **Step 2: Shellcheck the scripts (optional but recommended)**

```bash
if command -v shellcheck >/dev/null 2>&1; then
  shellcheck scripts/install.sh scripts/update.sh scripts/backup.sh scripts/lib/log.sh
else
  echo "shellcheck not installed; skipping"
fi
```

Expected: no errors (warnings about unsourced lib are fine since we use the directive).

- [ ] **Step 3: Local smoke**

```bash
rm -rf packages/server/data
PORT=3070 pnpm --filter @dashboard/server start &
sleep 2
curl -s http://localhost:3070/api/scenes | jq '.scenes | map(.name)' | grep -q Sleep
curl -s http://localhost:3070/api/scene-schedule | jq '.rules | length' # should be 2
kill %1
```

Expected: Sleep scene present, 2 schedule rules.

- [ ] **Step 4: Tag**

```bash
git tag -a v1.0.0 -m "Family Dashboard v1.0 — foundation, widgets, admin UI, Pi installer"
```

- [ ] **Step 5: Done.**

Push tags + main to the remote of your choice when you're ready.

---

## Known follow-ups (intentionally not in v1.0)

- **Display brightness control** — the admin/system endpoint reserves space for it but no UI/route writes to backlight yet. The Pi 4 official touchscreen uses `/sys/class/backlight/10-0045/brightness`. Add a small privileged shim.
- **OTA update UI** — admin can show "update available" badges but the actual `update.sh` runs only via SSH for now.
- **iCloud / Outlook calendar providers** — design accommodates them; v1.1 work.
- **Multi-display** — single screen only in v1.0.
- **Push notifications for Calendar** — polling at 60s remains the default; webhook channel is a future Pi 4 setup option for users with public HTTPS exposed.
