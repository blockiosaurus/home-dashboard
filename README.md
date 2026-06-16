# Dashboard

Self-hosted family dashboard for Raspberry Pi 4 + 18.5" touchscreen — calendar,
weather, agenda, chores, meal plan, notes, packages, and a local-folder photo
slideshow. Free alternative to DAKboard / Skylight.

Design notes: `docs/superpowers/specs/2026-05-29-family-dashboard-design.md`

---

## Installing on a Raspberry Pi 4

### What you need

- Raspberry Pi 4 (4 GB or 8 GB)
- Raspberry Pi OS Bookworm **64-bit** (lite is fine)
- 18.5" touchscreen — HDMI + USB for touch
- The Pi on your home WiFi
- A Google Cloud OAuth 2.0 client of type **"TVs and Limited Input devices"**
  (for calendar sync)

### First boot

After flashing Raspberry Pi OS Bookworm and getting a shell on the Pi:

1. Clone the repo into `/opt/dashboard`:

   ```bash
   sudo install -d -o pi -g pi /opt
   sudo chown pi:pi /opt
   git clone https://github.com/YOU/dashboard.git /opt/dashboard
   cd /opt/dashboard
   ```

2. Run the one-shot installer:

   ```bash
   sudo scripts/install.sh --repo-dir /opt/dashboard --yes
   ```

   It installs apt deps (avahi, cage, chromium, build tools), Node 22 via
   NodeSource, pnpm via corepack, creates a `dashboard` system user with
   `/var/lib/dashboard` as the data directory, builds the monorepo, installs
   `dashboard.service` (Node server) + `cage.service` (Wayland kiosk), and
   advertises `dashboard.local` via Avahi.

3. Paste your Google OAuth credentials:

   ```bash
   sudo nano /etc/dashboard/env
   # GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   # GOOGLE_CLIENT_SECRET=...
   sudo systemctl restart dashboard
   ```

   The Google OAuth client must be of type **"TVs and Limited Input devices"**
   (not Web). Enable the **Google Calendar API** in the same Cloud project at
   <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com>.

4. From any phone on your WiFi, open `http://dashboard.local/admin/` (or use
   the IP printed at the end of the installer). Walk through the first-run
   wizard.

5. Once the wizard finishes, start the kiosk on the touchscreen:

   ```bash
   sudo systemctl start cage
   ```

### Local photo slideshow

The slideshow widget reads from a folder on the Pi (Google Photos' Library
API was deprecated for general use in 2025; the Ambient API requires Google
Partner Program approval).

```bash
# As the dashboard user:
sudo cp ~/Pictures/family/*.jpg /var/lib/dashboard/photos/
sudo chown -R dashboard:dashboard /var/lib/dashboard/photos
```

Subfolders work. JPG, PNG, WebP, AVIF, GIF are recognized. The widget rescans
every hour; restart the service to force a refresh.

### Ongoing ops

| Task        | Command                                                       |
| ----------- | ------------------------------------------------------------- |
| Update      | `sudo /opt/dashboard/scripts/update.sh` (requires git clone)  |
| Backup DB   | `sudo /opt/dashboard/scripts/backup.sh /mnt/usb`              |
| Daily cron  | `sudo /opt/dashboard/scripts/backup.sh --install-cron`        |
| Server logs | `sudo journalctl -u dashboard -f`                             |
| Kiosk logs  | `sudo journalctl -u cage -f`                                  |
| Service     | `sudo systemctl status dashboard cage avahi-daemon`           |

### Troubleshooting

- **Kiosk shows a black screen** → `journalctl -u cage -f`. Usually Chromium
  can't reach `localhost:3000`; check `systemctl status dashboard`.
- **Can't reach `dashboard.local`** → some Android devices don't speak mDNS
  reliably. Use the IP the installer printed.
- **Calendar doesn't sync** → confirm `/etc/dashboard/env` has both
  `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, the Calendar API is enabled
  in your Cloud project, and the wizard completed the OAuth round-trip. Watch
  `journalctl -u dashboard -f` for `listCalendars failed: 403` (API not
  enabled) or `invalid_grant` (token revoked — wizard will auto-recover on
  the next sync tick).
- **Refresh token expired after 7 days** → that's a Google quirk while the
  OAuth consent screen is in "Testing" mode. Click **Publish App** on the
  consent screen to lift it (unverified apps still work for accounts you
  control, you just see a warning to click through).

More detail in `docs/dev/install.md` and `docs/dev/upgrades.md`.

---

## Local development (Mac / Linux laptop)

```bash
cp .env.example .env
# put your GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET into .env
pnpm install
pnpm -r build
pnpm --filter @dashboard/server start
```

Open <http://localhost:3000/admin/> to run the wizard, then
<http://localhost:3000/> for the kiosk view.

For watch-mode hot reload during dev:

```bash
pnpm --filter @dashboard/server dev
pnpm --filter @dashboard/dashboard dev   # in another shell
pnpm --filter @dashboard/admin dev       # in another shell
```

Run tests / lint:

```bash
pnpm -r test
pnpm lint
```

---

## Repo layout

```text
packages/
├── core/                shared TS types + zod schemas + widget contract
├── server/              Fastify + Drizzle + better-sqlite3 + WebSocket
├── ui/                  shared React primitives + theme tokens
├── dashboard/           React + Vite kiosk SPA (served at /)
├── admin/               React + Vite admin SPA (served at /admin/)
└── widgets/
    ├── clock/
    ├── calendar/
    ├── agenda/
    ├── weather/         Open-Meteo backend
    ├── slideshow/       local-folder photo source
    ├── chores/
    ├── meal-plan/
    ├── notes/
    └── packages/
scripts/                 install.sh / update.sh / backup.sh
deploy/                  systemd units + Avahi service file
docs/
├── dev/                 install + upgrade procedures
└── superpowers/         design specs + implementation plans
```
