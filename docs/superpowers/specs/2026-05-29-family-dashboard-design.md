# Family Dashboard — Design Spec

**Date:** 2026-05-29
**Target hardware:** Raspberry Pi 4 (4GB+) + 18.5" touchscreen, 1080×1920 portrait orientation
**Status:** Approved design, pre-implementation

## 1. Goals & Non-Goals

### Goals

- Self-hosted, free alternative to DAKboard / Skylight Calendar for a family of four.
- Modular widget system: calendar is required, all other modules optional and rearrangeable.
- WYSIWYG layout editor usable on the touchscreen and from any phone/laptop on the same WiFi.
- Two-way Google Calendar sync.
- Multiple "scenes" (e.g. Active + Sleep) that switch on a schedule or by manual button.
- Single-command install on a clean Pi.

### Non-Goals (v1)

- Multi-household or cloud-hosted deployment.
- Remote-from-anywhere admin access (LAN only; users can layer Tailscale themselves).
- Non-Google calendar providers (Apple/Outlook/CalDAV) — design leaves room, not delivered.
- Smart home control, news, traffic, package tracking widgets — design leaves a clean SDK; these are post-v1.
- User accounts / permissions inside the dashboard (anyone on the LAN can edit).

## 2. High-Level Architecture

```text
┌─────────────────────── Raspberry Pi 4 ────────────────────────┐
│                                                               │
│   Chromium kiosk (cage compositor)                            │
│       └── loads http://localhost:3000  (dashboard SPA)        │
│                                                               │
│   systemd unit: dashboard.service                             │
│       └── Fastify (Node 22, TypeScript)                       │
│              ├── GET /            → dashboard SPA bundle      │
│              ├── GET /admin       → admin SPA bundle          │
│              ├── REST /api/*      → JSON                      │
│              ├── WS  /ws          → live updates              │
│              ├── OAuth callback   → Google                    │
│              └── widget backends  → cron jobs                 │
│                                                               │
│   SQLite (better-sqlite3) — single file at /var/lib/dashboard │
│   Avahi → publishes dashboard.local                           │
│                                                               │
└───────────────────────────────────────────────────────────────┘
        ▲                                          ▲
        │ WebSocket + REST                         │ HTTPS
        │ on home LAN                              │
        │                                          ▼
   📱 phones / laptops                       ☁ Google Calendar
   (admin UI at                              ☁ Google Photos
    dashboard.local:3000/admin)              🌤 Open-Meteo
```

One Node process. One SQLite database. Two SPA bundles (dashboard + admin) served from the same Fastify instance.

## 3. Repository Structure

pnpm workspaces monorepo:

```text
dashboard/
├── package.json                (root, workspace)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── core/                   shared types, zod schemas, widget contract
│   ├── server/                 Fastify app, OAuth, sync, WebSocket
│   ├── dashboard/              React SPA (kiosk view)
│   ├── admin/                  React SPA (editor view)
│   ├── widgets/                first-party widget modules
│   │   ├── clock/
│   │   ├── calendar/
│   │   ├── agenda/
│   │   ├── weather/
│   │   ├── slideshow/
│   │   ├── chores/
│   │   ├── meal-plan/
│   │   ├── notes/
│   │   └── packages/
│   └── ui/                     shared React components, tokens, Tailwind preset
├── scripts/
│   ├── install.sh              one-shot Pi installer
│   ├── update.sh
│   └── backup.sh
├── deploy/
│   ├── dashboard.service       systemd unit
│   ├── cage.service            kiosk compositor
│   └── avahi/                  mDNS config
└── docs/
    └── superpowers/specs/      this file lives here
```

**Why this layout:** each package is small, single-purpose, independently testable. Widgets are dropped-in folders the registry picks up at build time. `core` is the only package every other one depends on.

## 4. Tech Stack

| Concern         | Choice                                      |
| --------------- | ------------------------------------------- |
| Language        | TypeScript (strict mode, ESM)               |
| Package manager | pnpm with workspaces                        |
| Server          | Fastify 5                                   |
| DB              | SQLite via `better-sqlite3` + `drizzle-orm` |
| Validation      | Zod                                         |
| Web UIs         | React 19 + Vite + Tailwind v4               |
| Grid editor     | `react-grid-layout`                         |
| State (client)  | Zustand + TanStack Query                    |
| Real-time       | Native WebSocket via Fastify ws plugin      |
| Auth            | `googleapis` (OAuth device flow on Pi)      |
| Crypto          | `libsodium-wrappers` for token at rest      |
| Tests           | Vitest + Playwright (UI)                    |
| Lint / format   | Biome                                       |

## 5. Widget Contract

A widget is a directory exporting one default object:

```ts
// packages/widgets/<name>/index.ts
import type { Widget } from '@dashboard/core'

export default {
  id: 'calendar',
  name: 'Calendar',
  defaultSize: { w: 8, h: 5 },
  minSize: { w: 4, h: 3 },
  configSchema: CalendarConfig, // Zod schema
  Render: CalendarView,         // React component, receives (config, data)
  AdminPanel: CalendarAdmin,    // React component for edit-time settings
  backend: {
    intervalMs: 60_000,
    run: async (ctx) => { /* poll Google, push via ctx.publish() */ },
  },
} satisfies Widget
```

The registry walks `packages/widgets/*/index.ts` and builds:

- a server-side map of widget id → backend (cron-driven on the Fastify side)
- a client-side map of widget id → `Render` / `AdminPanel` lazy chunks

Adding a new first-party widget is creating a new folder; no central registration list to edit.

## 6. Data Model (SQLite via Drizzle)

```text
accounts(id, provider='google', email, refresh_token_encrypted, scopes, created_at)
calendars(id, account_id, google_calendar_id, summary, color_override, visible, sync_token)
people(id, name, color, avatar_url, primary_calendar_id)
events_cache(id, calendar_id, google_event_id, etag, start, end, title, location,
             description, color, last_synced_at, deleted_at)
events_outbox(id, op='create'|'update'|'delete', payload_json, attempts, last_error,
              created_at, completed_at)
scenes(id, name, layout_json, is_default)
scene_schedule(id, scene_id, cron_expr, priority)
widget_configs(id, scene_id, widget_id, instance_id, x, y, w, h, config_json)
kv(key, value)  -- last sync tokens, encryption salt, sleep manual override, etc.
```

- `layout_json` is denormalized for fast renders; `widget_configs` rows are the authoritative source on edit.
- `sync_token` per calendar enables incremental Google sync.
- `events_outbox` is the single source of pending writes — survives restarts.

Encryption: refresh tokens encrypted with libsodium secretbox using a key derived from `/etc/machine-id` + a per-install salt stored in `kv`. Loss of the salt means re-OAuth — acceptable.

## 7. Google Calendar Sync

**Read path:**

1. On `accounts` insert and once per hour: list calendars, upsert into `calendars`.
2. Per calendar, every 60s: `events.list(syncToken)`. Apply diffs to `events_cache`. Persist new `sync_token`.
3. If Google returns 410 GONE on the sync token: full ±90-day re-sync.
4. WebSocket broadcasts a `calendar:changed` event so dashboard re-renders without polling the local API.

**Write path:**

1. Touchscreen event editor writes to `events_outbox` + optimistically updates `events_cache` (UI sees it instantly).
2. Outbox processor (every 5s or on insert) attempts `events.insert/update/delete` to Google.
3. On 5xx / network failure: exponential backoff, capped at 5 minutes; row stays in outbox.
4. On 409/412 (etag mismatch): refetch event, abandon local change, surface a small touchscreen notice.
5. On success: outbox row marked completed.

**Conflict philosophy:** Google wins. Touchscreen UI shows local "pending" pill on events still in outbox.

**Push notifications:** out of scope for v1 (requires public HTTPS endpoint). 60s poll is the baseline. SDK leaves room to add watch channels later.

## 8. Scenes & Idle Behavior

A **scene** is a saved layout of widget instances at specific grid coordinates.

- v1 scenes: `Active`, `Sleep`. Users can add more.
- `scene_schedule` rows are cron expressions that select a scene. Highest-priority matching rule wins.
- Manual override: touch a "sleep" button on the dashboard (or admin) → switches to Sleep scene; cleared at next schedule boundary or by tapping the screen.
- Sleep scene v1: large clock, slim agenda strip (today + tomorrow), full-bleed Google Photos slideshow with Ken Burns, weather pill.
- Backlight: stays on by default. Optional "true off after 23:30" toggle uses `vcgencmd display_power 0` and PIR/touch wake (post-v1 if no sensor).

## 9. Admin UI Behavior

- **Live edits:** scene editor is a draft. Changes do not appear on the kiosk until **Publish**. A "preview on kiosk" toggle pushes the draft live without saving.
- **Publish:** writes new `scenes` row, marks it as the active layout, broadcasts `scene:updated` via WebSocket. Dashboard hot-swaps the layout — no reload.
- **Optimistic UI** everywhere: actions don't wait for round-trips before reflecting.
- **No login.** LAN is the perimeter. Document this clearly; users who want auth can put it behind a reverse proxy.
- **First-run wizard:** Connect Google → choose calendars → assign 4 people to calendars → pick weather location (lat/lon, default browser geolocation) → pick photo album → done. Wizard reachable later from settings.

## 10. Visual Style

"Playful Bright" direction:

- Pastel gradient background (pink → blue).
- White cards with soft shadows, rounded 16–18px corners.
- Indigo `#5b6cff` accent + person palette (pink/indigo/orange/green for the four family members).
- Inter font, 700-weight headings; emoji used sparingly to identify event types.
- Tailwind v4 with a theme token file in `packages/ui/tokens.css`.

## 11. Install / Update / Backup

### `scripts/install.sh`

Idempotent one-shot for a clean Pi OS Bookworm 64-bit install. Steps:

1. Verify Pi 4, 64-bit OS, network reachable.
2. `apt update && apt install -y curl git avahi-daemon cage chromium-browser libnss3 build-essential`
3. Install Node 22 via NodeSource.
4. Install pnpm via corepack.
5. Create `dashboard` system user + `/var/lib/dashboard` data dir.
6. Clone repo to `/opt/dashboard` (or use already-checked-out path).
7. `pnpm install --frozen-lockfile && pnpm build`.
8. Copy `deploy/dashboard.service` and `deploy/cage.service` to `/etc/systemd/system/`, enable both.
9. Configure Avahi to advertise `dashboard.local`.
10. Set Chromium kiosk flags via cage args.
11. Print final status with OAuth setup URL to visit on the touchscreen.

Re-running is safe: each step checks current state before changing.

### `scripts/update.sh`

`git pull && pnpm install --frozen-lockfile && pnpm build && systemctl restart dashboard`

### `scripts/backup.sh`

`sqlite3 .backup` to a configurable target path (default `/var/lib/dashboard/backups/`). Crontab installer optional.

## 12. Testing Strategy

- **Unit (Vitest):** widget config parsing, outbox state machine, sync diff application, scene scheduler.
- **Integration (Vitest + better-sqlite3 in-memory):** OAuth token round-trip, calendar sync with recorded Google fixtures, WebSocket broadcast paths.
- **UI (Playwright):** first-run wizard, event quick-add, drag-resize a widget in the scene editor, publish flow, scene switch.
- **Pi smoke test:** documented manual checklist for fresh-install verification (boot → kiosk loads → admin reachable at dashboard.local → OAuth completes → event written round-trips to Google).

## 13. Performance & Resource Budget

- Cold boot to kiosk visible: target <30s on Pi 4 4GB.
- Idle RAM: target <500MB total (Node ~150MB, Chromium ~300MB).
- Event create latency: optimistic update visible in <100ms on touchscreen; Google round-trip success within 5s on healthy network.
- Dashboard frame budget: 60fps for slideshow, no jank during scene switch.
- SQLite WAL mode, busy_timeout 5s.

## 14. Open Risks & Future Work

- **Push notifications for Google Calendar** require a public HTTPS endpoint; polling at 60s is a known tradeoff.
- **Photo album access:** Google Photos Library API has limitations on shared albums; if blocked, fall back to a local folder source.
- **Pi 4 / Chromium GPU acceleration** for the slideshow may need `--enable-features=Vulkan` tuning depending on OS version.
- **Provider expansion** (iCloud / Outlook / CalDAV) is structurally feasible — the `accounts` table is multi-provider — but explicitly out of v1.
- **Authentication:** LAN-only is a real risk if WiFi is shared with guests. Document reverse-proxy auth recipes.

## 15. Acceptance Criteria

A v1 ship requires all of:

1. Clean Pi install via `scripts/install.sh` completes without manual intervention beyond OAuth.
2. First-run wizard configures 4 people, calendars, weather, photo album.
3. Two-way Google Calendar sync round-trips an event within 5s.
4. Scene editor on phone publishes a new layout that appears on kiosk without reload.
5. Sleep scene auto-activates on schedule and reverts on tap.
6. Survives 7-day soak with no manual restart.
