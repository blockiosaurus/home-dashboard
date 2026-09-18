# UX / Onboarding Hardening Plan

**Date:** 2026-09-18
**Goal:** Make first-run setup work end to end, make every wizard step matter, make the editor and settings usable by a non-technical family member on a phone, and remove dead code.

## Global Constraints

These bind every task. Reviewers check them.

- Monorepo: pnpm workspaces, TypeScript strict + `exactOptionalPropertyTypes` (see `tsconfig.base.json`), ESM, React 19, Tailwind v4 (utility classes, tokens in `packages/ui/src/tokens.css`), Fastify 5, better-sqlite3 with raw prepared statements (no drizzle query builder at runtime), zod for all request bodies.
- Every task must leave `pnpm -r build`, `pnpm -r test`, and `pnpm lint` (biome) green. Run all three before committing. Fix formatting with `pnpm format` if biome complains.
- Server changes get vitest coverage in the same style as `packages/server/src/routes/system.test.ts` (build the app with `buildApp({ dataDir: tmpdir })`, use `app.inject`). Admin and dashboard packages have no test runner; verify those by building and by reasoning, and say so in the report.
- Do not add dependencies unless the task names them.
- Do not touch `enclosure/`, `.env`, or files under `docs/superpowers/plans/` other than this plan.
- Copy visible to end users is plain English for a family, not developer jargon: no "cron", "scene id", "instanceId", "OAuth", "JSON" in UI text unless inside an explicitly labeled advanced section.
- Every button the user can tap on a phone has a touch-friendly hit area (min height 40px / `py-2` or larger) and a disabled reason shown inline, never only in a `title` tooltip.
- Commit per task with a conventional-commit subject (`fix(admin): …`, `feat(server): …`) and this trailer as the last line of the body:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`
- Existing API shapes stay backward compatible unless a task says otherwise; the kiosk and admin are deployed together so additive changes are fine.
- Widget definitions live in `packages/widgets/<name>/src/index.ts`, shared types in `packages/core`.

## Architecture notes for implementers

- Server entry: `packages/server/src/app.ts` builds Fastify, opens SQLite, seeds default scenes (`db/seed.ts`), starts the widget runtime (`widgets/runtime.ts` → `widgets/cron-runner.ts`), sync service (`sync/service.ts`), and scene scheduler (`sync/scene-scheduler.ts`). Routes live in `routes/*.ts`, each a `registerXRoutes(app, db, deps)` function.
- The `system` record is a JSON blob in the `kv` table under key `system`, schema in `routes/system.ts`.
- WebSocket messages are validated by `packages/core/src/ws.ts` (`ServerMessageSchema`). The kiosk (`packages/dashboard/src/App.tsx`) and admin subscribe. The broker is `app.broker`.
- Admin SPA: `packages/admin/src`, react-router with basename `/admin`, TanStack Query for data, `api.ts` wraps fetch calls. `App.tsx` renders `Shell` (nav + routes) and redirects to `/wizard` when `system.firstRunComplete` is false.
- Kiosk SPA: `packages/dashboard/src`, renders the active scene as a CSS grid of widget cells.
- Grid is `GRID_COLS = 8` by `GRID_ROWS = 12` (`packages/core/src/scene.ts`).

---

### Task 1: Fix wizard completion bounce, expose Google configuration, skip connect when already connected

**Problem.** After Finish, `DoneStep` calls `PUT /api/system` then navigates to `/editor`, but `Shell` reads the stale cached `['system']` query (still `firstRunComplete: false`) and immediately redirects back to `/wizard`. Users then re-run Connect Google and create duplicate account rows. Also the wizard cannot tell whether the server has Google credentials until Start fails, and the connect step copy claims Google Photos access although the scope is Calendar only.

**Server (`packages/server/src/routes/system.ts`, `app.ts`):**
- `registerSystemRoutes(app, db, deps: { googleConfigured: boolean })`. `GET /api/system` adds a read-only field `googleConfigured` (true when both client id and secret are set). `PUT` ignores it if sent. Update `app.ts` to pass it (`Boolean(opts.googleClientId && opts.googleClientSecret)`).
- `POST /api/oauth/start` response adds `intervalSeconds` (already on the flow object).
- Tests: extend `system.test.ts` to assert `googleConfigured: false` with no creds and `true` when `buildApp` gets both.

**Admin (`packages/admin/src/routes/Wizard.tsx`, `api.ts`, `App.tsx`):**
- `api.getSystem` type gains `googleConfigured: boolean`; `api.oauthStart` gains `intervalSeconds: number`; add `api.getAccounts()` (move the inline fetch from `AccountsPanel.tsx` into `api.ts` and use it there too).
- Finish: after `putSystem` resolves, call `queryClient.setQueryData(['system'], result)` with the response body and `invalidateQueries({ queryKey: ['system'] })`, then navigate. Delete the "warm cache" `useQuery` in `DoneStep`.
- `Shell`: while the system query has no data yet render nothing (not the editor), so the redirect decision is made on fresh data.
- Connect step: on wizard mount query accounts. If an account exists, show "Google Calendar is connected" with a Continue button and a secondary "Connect a different account" that starts the device flow; do not auto-start a flow. If `googleConfigured` is false, replace the Start button with a panel: "This dashboard's server doesn't have Google credentials yet." plus the exact commands from the README (`sudo nano /etc/dashboard/env`, `sudo systemctl restart dashboard`), a "Check again" button (refetches system), and a "Skip for now" button that advances without connecting.
- Every connect state also offers "Skip for now" (calendar can be connected later from Settings).
- Fix copy: "We use Google Calendar so the dashboard can show your family's events and let you add new ones from the touchscreen." No mention of Photos.
- Polling uses `intervalSeconds * 1000` (minimum 5000) instead of a fixed 5s.
- Device-flow pending state: show the code in a large tappable block, the verification URL as a link, and a "Cancel" that returns to idle.

**Verify:** `pnpm -r build`, `pnpm -r test`, `pnpm lint`. Reason through the finish path: `setQueryData` runs before `navigate`, so `Shell` sees `firstRunComplete: true`.

---

### Task 2: Wizard structure: progress, back, step persistence, merged finish

**Problem.** No progress indicator, no Back, a refresh restarts at step one, and "Almost done → Finish" is an extra screen.

**Admin (`packages/admin/src/routes/Wizard.tsx`; split step components into `packages/admin/src/wizard/*.tsx` if the file passes ~350 lines):**
- Steps are an ordered array `['connect', 'calendars', 'people', 'weather', 'photos']` (the `calendars` step is added in Task 4; for this task define the array with `connect`, `people`, `weather`, `photos` and leave a clear insertion point). Render a header "Step N of M" plus a row of small dots, active dot in `var(--accent)`.
- Each step card has a Back button (ghost) except the first, and a primary Continue. The last step's primary button reads "Finish" and performs the save that `DoneStep` did; delete `DoneStep`.
- Persist the current step index and the collected draft (people, weather) in `sessionStorage` under key `dashboard.wizard`; restore on mount; clear on Finish. Never persist OAuth device codes.
- Extract a `WizardCard` wrapper component (title, subtitle, children, footer with Back/Continue) so steps share layout.
- Saving people on Finish: send every person with a non-empty name via `PUT /api/people/:id`; for the four fixed ids `p1..p4` with an empty name, call `DELETE /api/people/:id` so a cleared name is removed on re-run.

**Verify:** build, tests, lint. Reason through: refresh mid-wizard lands on the same step with the same draft.

---

### Task 3: Weather step with city search; apply the chosen location to weather widgets

**Problem.** `navigator.geolocation` is blocked over plain http from a phone, the error callback is empty, and the default silently stays New York. `weatherDefault` is saved but never read, so the kiosk still shows NYC weather.

**Admin (`packages/admin/src/routes/Wizard.tsx` weather step, plus a reusable `packages/admin/src/components/LocationPicker.tsx`):**
- Replace lat/lon fields with a search box. On input (debounced 300ms, min 2 chars) call `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=6&language=en&format=json` directly from the browser (no key, CORS allowed). Show results as tappable rows "City, Admin1, Country". Selecting one sets `{ lat: latitude, lon: longitude, label: "<name>, <admin1 or country>" }`.
- Keep an "Enter coordinates instead" disclosure that reveals the numeric lat/lon fields.
- Keep the "Use this device's location" button but only when `window.isSecureContext` is true; when it fails show an inline message "Your browser blocked location access. Search for your town instead."
- Show the selected location as a chip above the unit selector. Continue is disabled with inline text "Pick a location to continue" until a location is chosen or coordinates are entered. Drop the NYC default; the initial value is `null`.
- The unit selector becomes two toggle buttons (°F / °C).
- `LocationPicker` is also used by the weather widget config form in Task 8, so keep it self-contained (props: `value`, `onChange`).

**Server (`packages/server/src/routes/system.ts`):**
- When a `PUT /api/system` body includes `weatherDefault`, after saving, update every cell with `widgetId === 'weather'` in every scene: set `config.lat`, `config.lon`, `config.unit`, and `config.label` from the new default, write the scenes back, and publish `{ type: 'scene:updated', sceneId }` for each changed scene. Put this in a helper `applyWeatherDefault(db, broker, weatherDefault)` in `packages/server/src/scenes/apply-weather-default.ts` with a unit test (seed two scenes, call helper, assert cells updated and other widgets untouched).
- `registerSystemRoutes` gains access to `app.broker` (already decorated on app).

**Verify:** build, tests (new test for the helper + route test that PUT with weatherDefault mutates the seeded `weather-1` cell), lint.

---

### Task 4: Calendar discovery on connect, calendar picker in wizard and settings

**Problem.** All Google calendars sync as visible (holidays, birthdays, contacts) and nothing lets the user hide one. Calendars are only discovered on the 60s sync tick, so a picker right after connecting would be empty.

**Server:**
- `sync/service.ts`: extract the per-account "discover calendars" block into an exported `discoverCalendars(db, accessToken, accountId)` function. `startSyncService` returns `{ stop, runNow: () => Promise<void> }` where `runNow` runs one tick immediately (guard against overlapping runs with a simple in-flight flag).
- `listCalendars` in `sync/google-client.ts` requests `fields=items(id,summary,primary,backgroundColor)` and returns `{ id, summary, primary?: boolean, backgroundColor?: string }`. `discoverCalendars` stores `backgroundColor` into `calendars.color_override` only when the row is new (never overwrite a user choice), and when `primary` is true sets `accounts.email = <calendar id>` for that account (the primary calendar id is the account's email address).
- `routes/oauth.ts`: `registerOauthRoutes` accepts an optional `onAccountAdded?: () => Promise<void>`; after inserting the account row it awaits it, catching and logging errors. In `app.ts` start the sync service before registering OAuth routes and pass `() => sync.runNow()`.
- New `routes/calendars.ts`: `GET /api/calendars` → `{ calendars: [{ id, accountId, summary, visible, color }] }` ordered by summary; `PUT /api/calendars/:id` body `{ visible?: boolean, color?: string | null }` (zod), 404 when missing, returns the updated row. Register in `app.ts`.
- Tests: `routes/calendars.test.ts` (insert two calendar rows directly, GET lists both, PUT toggles visible, 404). Extend `sync/service` tests or add a focused test for `discoverCalendars` setting email from primary.

**Admin:**
- `api.ts`: `getCalendars`, `putCalendar(id, patch)`.
- New wizard step `calendars` between `connect` and `people`. Skipped automatically (not shown, not counted in "Step N of M") when no account is connected. Content: "Which calendars should show on the dashboard?" with a checkbox row per calendar (color dot, name), toggling calls `putCalendar` immediately. While the list is empty show a spinner text "Looking for your calendars…" and refetch every 3s for up to 60s, then "No calendars found yet. They'll appear after the first sync; you can pick them in Settings later."
- New `packages/admin/src/components/CalendarsPanel.tsx` in Settings with the same list (reuse a `CalendarList` component). Shown in Settings between Accounts and System.

**Verify:** build, tests, lint.

---

### Task 5: Family members map to calendars; events carry the person's color

**Problem.** People are saved but nothing reads them. The design intent was: each family member owns a calendar, and their events show in their color.

**Server:**
- `routes/events.ts`: the query joins `people` on `people.primary_calendar_id = c.id` and returns `color` as `COALESCE(people.color, c.color_override, e.color)` plus a new field `personName: string | null`. Add a test: insert a calendar, a person pointing at it, an event, and assert the event's color is the person's color.
- `routes/people.ts`: `PUT` accepts `primaryCalendarId: string | null` (nullable, not just optional).

**Admin:**
- People step: each row gets a "Calendar" select listing `getCalendars()` results plus "None". Hidden entirely when no calendars exist (no account connected). Saves `primaryCalendarId`.
- Add a `PeoplePanel.tsx` to Settings (same rows as the wizard step, saving on blur/change) so it can be edited later. Extract the row component to `packages/admin/src/components/PersonRow.tsx` and use it in both places.

**Kiosk widgets:** `packages/widgets/agenda/src/view.tsx` and `packages/widgets/calendar/src/view.tsx` already use `e.color`; no change needed beyond confirming they still build.

**Verify:** build, tests, lint.

---

### Task 6: Kiosk first-run setup screen with admin URL and QR code

**Problem.** Before setup the touchscreen shows NYC weather and an empty calendar with no hint of what to do.

**Server:**
- `GET /api/system` adds `adminUrls: string[]`: first `http://<os.hostname()>.local:<port>/admin/` (omit `:<port>` when port is 80), then one `http://<ipv4>:<port>/admin/` per non-internal IPv4 interface from `os.networkInterfaces()`. Port comes from a new `deps.port` on `registerSystemRoutes` (pass `config.port` through `buildApp` options as `port?: number`, default 3000). Unit-test the URL builder as a pure function `buildAdminUrls({ hostname, interfaces, port })` in `packages/server/src/system/admin-urls.ts`.
- `PUT /api/system` publishes `{ type: 'system:updated' }` on the broker after saving. Add that message to `ServerMessageSchema` in `packages/core/src/ws.ts` and to its test.

**Kiosk (`packages/dashboard`):**
- Add dependency `qrcode.react@4.1.0` to `packages/dashboard/package.json` (same version the admin uses; run `pnpm install`).
- `App.tsx`: query `/api/system` (key `['system']`). If `firstRunComplete` is false render `SetupScreen` instead of the scene. On `system:updated` WS message invalidate `['system']`.
- New `packages/dashboard/src/SetupScreen.tsx`: full-screen card on the gradient background. Title "Let's set up your dashboard". Body: "On your phone, open" + the first admin URL in large text + a `QRCodeSVG` of it (size 220) + "or use" + remaining URLs in smaller text. Footer hint: "This screen goes away as soon as setup finishes." Layout must read well in portrait (the kiosk is 1080×1920 rotated via `RotatedRoot`).
- Loading state: while the scenes or system query has no data render a neutral centered "Starting…" instead of "No scenes yet". Show "No scenes yet" only when data is loaded and empty.

**Verify:** build, tests, lint.

---

### Task 7: Register all widgets, rebuild backends on publish, sane default configs

**Problem.** The server registry only knows Weather and Slideshow, so the palette cannot re-add the other seven widgets. Widget backends are computed once at startup from the default scene only, so a widget added in the editor never gets data and the Sleep scene's slideshow never gets photos. Widgets added from the palette get `config: {}`, which breaks weather (lat required) and chores/notes/meal-plan/packages (they read `config.instanceId` for their state URL).

**Core (`packages/core/src/widget.ts`):**
- `WidgetDefinition` gains `defaultConfig?: TConfig` and `description?: string`.

**Widgets:** each `packages/widgets/*/src/index.ts` sets a one-line `description` and a `defaultConfig`: clock `{ format: '12h' }`, calendar `{ view: 'week' }`, agenda `{ daysAhead: 1, title: 'Up next' }`, weather `{ unit: 'fahrenheit' }` (lat/lon filled by the server, see below), slideshow `{ source: 'local', intervalMs: 8000, shuffle: true }`, chores `{ title: 'Chores' }`, meal-plan `{ title: 'Meals' }`, notes `{ title: 'Notes' }`, packages `{ title: 'Packages' }`. Remove `instanceId` from the config schemas of chores, meal-plan, notes, packages; their views take `instanceId` from a new prop instead.
- `packages/dashboard/src/widget-loader.ts`: `Render` props become `{ instanceId: string; config: TConfig; data: TData | undefined }`; `SceneRenderer.tsx` passes `instanceId={cell.instanceId}`. Update the four stateful views to use the prop. Weather `ConfigSchema` makes `lat`/`lon` optional at the schema level; the backend skips the fetch and publishes `{ error: 'no-location' }` when they are missing, and the view shows "Set a location in Settings" for that payload.
- `packages/server/src/db/seed.ts`: drop `instanceId` from seeded configs.

**Server:**
- `app.ts`: register all nine widget definitions (add the seven missing `@dashboard/widget-*` workspace deps to `packages/server/package.json`, run `pnpm install`). Only weather and slideshow have backends.
- `widgets/runtime.ts`: `startWidgetRuntime` returns `{ stop, cache, reload(instances) }`. `reload` stops the current timers and starts backends for the new instance list, keeping the cache. Add a helper `collectInstances(db)` in `widgets/instances-from-scene.ts` that reads all scenes and returns instances de-duplicated by `instanceId`, and use it both at startup and on reload. Instances whose widget is `weather` and lack `lat`/`lon` get them merged from `system.weatherDefault` when present.
- `routes/scenes.ts`: after a successful save call `app.widgetRuntime.reload(collectInstances(db))` (decorate `widgetRuntime` on app in `app.ts`).
- `routes/widgets-list.ts`: include `description` and `defaultConfig` per widget; for weather merge `system.weatherDefault` (lat, lon, unit, label) into `defaultConfig` when set (route now takes `db`).
- Tests: runtime `reload` starts a backend for a newly added instance and stops removed ones (use a fake backend with a spy); `collectInstances` de-dupes across scenes; widgets-list returns nine widgets and merges weatherDefault.

**Admin:**
- `WidgetPalette.tsx`: new cells use `config: w.defaultConfig ?? {}`; each row shows the name and the description in small text; when no widget fits, show one inline line under the list: "The grid is full. Remove or shrink a widget to add another." Never rely on `title` tooltips.
- `GridCanvas.tsx` tiles show the widget's display name (pass a `names: Record<string, string>` prop built from `getWidgets`), not the id.

**Verify:** build, tests, lint. Note in the report that existing databases keep `instanceId` inside config for the four stateful widgets; the views ignore it now, so nothing breaks.

---

### Task 8: Scene editor: scene switcher and real config forms

**Problem.** Only the default scene can be edited (no switcher), and the config panel is a raw JSON textarea that silently ignores typos.

**Admin:**
- `SceneEditor.tsx`: a scene `<select>` next to the title listing all scenes; switching with unpublished changes asks `window.confirm('Discard unpublished changes?')`. Store the draft per selected scene in the zustand store (`draft` keyed by scene id is fine; simplest is replacing the draft on switch). Add a "Set as default" checkbox that maps to `isDefault` (publishing a scene with `isDefault: true` must clear the flag on other scenes: server `routes/scenes.ts` POST wraps the upsert in a transaction that sets `is_default = 0` on all other rows when the incoming scene is default; add a test).
- New `packages/admin/src/widget-forms.ts`: a field-descriptor map per widget id. Field types: `text`, `number`, `select` (options), `toggle`, `location` (renders `LocationPicker` from Task 3). Descriptors:
  - clock: format select (12-hour / 24-hour)
  - calendar: view select (Week / Day / Month)
  - agenda: title text, daysAhead number ("Days to show", min 1 max 14)
  - weather: location (writes lat, lon, label), unit select (°F / °C)
  - slideshow: intervalMs number shown as seconds ("Seconds per photo", min 2), shuffle toggle
  - chores, meal-plan, notes, packages: title text
- `WidgetConfigPanel.tsx`: renders the widget name as the heading, the descriptor fields as inputs (using `Input` from `@dashboard/ui` and simple selects/toggles), and a collapsed "Advanced (JSON)" `<details>` containing the existing textarea. Invalid JSON in the textarea shows an inline red "Not valid JSON" message instead of being ignored. Keep the Remove button.
- Size hints: under the fields show "Size: W × H" for the selected cell.

**Verify:** build, tests, lint.

---

### Task 9: Settings: scene dropdowns, simple sleep schedule, accounts panel with status

**Problem.** "Manual scene override" and schedule rules take free-text ids and cron syntax; the accounts panel shows "google" because email is empty; there is no sync status; connecting later requires re-running the whole wizard.

**Server:**
- `sync/service.ts`: after each successful account sync write `kv` key `syncStatus` = `{ lastSyncAt: <ms>, lastError: string | null }`; on failure write `lastError` with the message. New `GET /api/sync/status` in `routes/sync-status.ts` returns `{ lastSyncAt, lastError, eventCount }` (`eventCount` = `SELECT count(*) FROM events_cache WHERE deleted_at IS NULL`). Test it.
- `db/seed.ts`: the two seeded schedule rule ids become `sleep-start` and `sleep-end`. `routes/scene-schedule.ts` is unchanged.

**Admin:**
- `SystemPanel.tsx` → rename to `SceneOverridePanel.tsx`: a select "Show this scene now" with "Follow the schedule" (null) plus each scene by name; saves on change (no separate Save button). Keep the "Re-run setup" button with fixed copy: "Want to go through setup again? Your Google connection and data are kept."
- `ScheduleEditor.tsx` → `SleepSchedulePanel.tsx`: "Sleep mode" card with a toggle (enabled when both rules exist), a "Sleep scene" select, "Starts at" and "Ends at" `<input type="time">`. Saving writes rule `sleep-start` = `{ sceneId: <sleep scene>, cronExpr: 'M H * * *', priority: 10 }` and `sleep-end` = `{ sceneId: <default scene id>, cronExpr: 'M H * * *', priority: 10 }`; disabling deletes both. On load, parse the two rules back into the form (if the existing DB still has `sleep-22`/`wake-07`, treat them as `sleep-start`/`sleep-end` and delete the old ids on first save). A collapsed "Advanced: all rules" `<details>` keeps the raw list with Remove buttons.
- `AccountsPanel.tsx`: each account shows "Connected as <email>" (fallback "Google account" when email is empty), and below the list a status line "Last synced 3 minutes ago · 128 events" from `/api/sync/status` (refetch every 30s; show the error text in red when `lastError` is set; show "Not synced yet" when null). Add a "Connect Google" button when no account exists that opens the device-flow UI inline: extract the connect UI from the wizard into `packages/admin/src/components/ConnectGoogle.tsx` (props: `onConnected`) and use it in both places.
- `Settings.tsx` layout order: Accounts, Calendars, People, Scene override, Sleep schedule.

**Verify:** build, tests, lint.

---

### Task 10: Responsive admin layout for phones

**Problem.** Fixed 224px sidebar plus three fixed-width columns overflow a 375px phone; settings cards squash to 80px.

**Admin:**
- `App.tsx`: below `lg`, the nav becomes a top bar with two tabs (Editor, Settings) and the content scrolls beneath; at `lg` and up keep the sidebar. Add a small "Open dashboard" link in the nav pointing at `/` (`target="_blank"`).
- `SceneEditor.tsx`: below `lg`, stack vertically: header row (scene select, status pill, Publish), palette as a horizontally scrolling row of chips, canvas full width, config panel below the canvas. At `lg` keep the three-column layout but let the palette and config panel shrink (`w-56`/`w-72` become `lg:w-56`, `lg:w-72`, with `min-w-0` on the canvas column).
- `GridCanvas.tsx`: `rowHeight` derives from container width so the 8×12 grid keeps its 1080×1920 aspect: `rowHeight = (containerWidth / 8) * (1920/1080) / 1` rounded, computed with a `ResizeObserver` on the wrapper (keep `WidthProvider` for columns). Touch dragging must keep working (react-grid-layout supports touch).
- `Settings.tsx`: `grid-cols-1` below `lg`, two columns at `lg`.
- Wizard cards already use `max-w-md w-full`; make sure the page container has `min-h-full` and vertical padding so the card scrolls on short viewports.
- Check the desktop pane at 800px wide as well; nothing may overflow horizontally at any width from 360px up.

**Verify:** build, lint. State in the report which widths you reasoned through.

---

### Task 11: Dead code removal, lint fix, kiosk connection states

**Remove** (the project reverted to a local photo folder; these paths are unreachable from the UI and the README says so):
- `packages/server/src/routes/google-albums.ts`, `routes/photos-ambient.ts`, `sync/google-ambient.ts` (+ test), `sync/google-photos.ts` (+ test), and their registrations in `app.ts`. The slideshow backend keeps only the `local` source: simplify `packages/widgets/slideshow/src/backend.ts` and its `index.ts` schema to `source: 'local'` only (drop `albumId`, `size`, the `google-photos`/`ambient` branches) and update the view accordingly. Drop `photosAlbumId` from the system schema and `api.ts`; drop `getAlbums`, `ambientRegister`, `ambientStatus`, `ambientReset` from `api.ts`. Keep the `ambient_device_id` column (no destructive migration); just stop reading it.
- Unused `QRCodeSVG` import in `Wizard.tsx` if still present after earlier tasks.
- Run `pnpm format` so `RotatedRoot.tsx` passes biome.

**Kiosk:**
- `packages/dashboard/src/ws.ts`: expose connection state via a callback (`onStatus(connected: boolean)`); the store gains `wsConnected`. `App.tsx` shows a slim top banner "Reconnecting to the dashboard server…" when disconnected for more than 5 seconds, and refetches `['scenes']` and `['system']` when the socket reconnects.

**Docs:** README photo section unchanged; remove any remaining mention of Google Photos / Ambient in `.env.example` (the "Photos Library API" line) and in the wizard copy.

**Verify:** build, tests, lint. Confirm `grep -ri ambient packages --include='*.ts' --include='*.tsx' -l` returns only `db/schema.ts` and the migration files.

---

### Task 12: Installer accepts Google credentials, starts the kiosk, README refresh

**Scripts (`scripts/install.sh`):**
- New flags `--google-client-id VALUE` and `--google-client-secret VALUE`. When both are given, write them into `/etc/dashboard/env` (create or replace the two lines; keep other lines). When not given and `--yes` is not set, prompt interactively with a note that the step can be skipped and done later by editing `/etc/dashboard/env`. When `--yes` and not given, skip silently.
- After installing the units, `systemctl restart dashboard.service` (already there) and then `systemctl start cage.service` unless `--no-kiosk` is passed. The kiosk now shows the setup screen from Task 6, so starting it immediately is the right default. Keep the existing warning comment about not restarting cage on re-runs: only *start* it if inactive (`systemctl is-active --quiet cage || systemctl start cage`).
- Final summary: print the admin URL block first and say "Look at the touchscreen: it shows this same address and a QR code."
- `--help` documents the new flags.

**Docs:**
- `README.md`: replace `https://github.com/YOU/dashboard.git` with `https://github.com/blockiosaurus/home-dashboard.git`. Collapse "First boot" into: clone, run installer with the two credential flags, open the address shown on the touchscreen or printed by the installer, finish setup. Keep a short "Adding credentials later" subsection with the env-file edit. Remove the separate "start the kiosk" step. Update `docs/dev/install.md` to match.
- Add a "What setup asks you" subsection listing the wizard steps in one line each (connect Google, choose calendars, family members, weather location, photos folder).

**Verify:** `bash -n scripts/install.sh`, `pnpm lint` (biome ignores shell; still run it), and read the README top to bottom once for consistency with the new flow.
