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
   git clone https://github.com/blockiosaurus/home-dashboard.git /opt/dashboard
   cd /opt/dashboard
   ```

2. Run the one-shot installer:

   ```bash
   sudo scripts/install.sh --repo-dir /opt/dashboard
   ```

   It prompts for your Google client id and secret and writes them straight
   into `/etc/dashboard/env` (root-owned, 0640). This is the recommended way
   to supply them — each prompt can be left blank to skip, and you can always
   add or change them later by editing `/etc/dashboard/env` (see "Adding
   credentials later" below).

   There are also `--google-client-id` / `--google-client-secret` flags for
   unattended installs, but **anything you pass on the command line is saved
   in your shell history** (and visible in `ps` while the installer runs), so
   prefer the prompt or the env file for the secret.

   The Google OAuth client must be of type **"TVs and Limited Input devices"**
   (not Web). Enable the **Google Calendar API** in the same Cloud project at
   <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com>.

   The installer installs apt deps (avahi, cage, chromium, build tools),
   Node 22 via NodeSource, pnpm via corepack, creates a `dashboard` system
   user with `/var/lib/dashboard` as the data directory, builds the monorepo,
   installs `dashboard.service` (Node server) + `cage.service` (Wayland
   kiosk), starts both, and advertises `dashboard.local` via Avahi.

3. Open the address shown on the touchscreen (it displays a QR code too), or
   the one the installer printed, from any phone on your WiFi. Walk through
   the first-run wizard.

#### Adding credentials later

Skipped Google during install, or need to change the client id/secret?

```bash
sudo nano /etc/dashboard/env
# GOOGLE_CLIENT_ID=...apps.googleusercontent.com
# GOOGLE_CLIENT_SECRET=...
sudo systemctl restart dashboard
```

Then open the admin's Settings → Accounts page to connect Google.

### What setup asks you

The first-run wizard walks through, in order:

1. **Connect Google** — sign in for two-way calendar sync. Optional; skip and
   connect later from Settings → Accounts.
2. **Choose calendars** — pick which of your Google calendars show up (only
   shown once connected).
3. **Family members** — a name, a color, and optionally a calendar for each
   person.
4. **Weather location** — search for your city.
5. **Photos folder** — where to drop local photos for the slideshow (see
   below).

Then it hands off to the live dashboard.

### Local photo slideshow

The slideshow widget reads from a folder on the Pi.

```bash
# As the dashboard user:
sudo cp ~/Pictures/family/*.jpg /var/lib/dashboard/photos/
sudo chown -R dashboard:dashboard /var/lib/dashboard/photos
```

Subfolders work. JPG, PNG, WebP, AVIF, GIF are recognized. The widget rescans
every hour; restart the service to force a refresh.

### Admin on your phone's home screen

The admin can be installed as an app, so you don't need to keep a browser tab
open. Open it on your phone at **`http://dashboard.local:3000/admin/`** (the
`.local` name, not the IP: a home-screen app stays tied to the address it was
installed from, and the Pi's IP can change), then:

- **iPhone / iPad (Safari):** Share → **Add to Home Screen**. It opens
  full-screen like a normal app.
- **Android (Chrome):** menu → **Add to Home screen**. Because the Pi serves
  plain HTTP, Chrome adds a shortcut that opens in a Chrome tab rather than in
  its own window.

If you open the admin from an IP address, a banner offers the `.local` link
instead. If your phone can't open `dashboard.local` (some Android phones and
some routers don't support `.local` names), give the Pi a fixed IP in your
router's DHCP settings and install from that address.

### Importing events from flyers and PDFs

For the schedules and invitations that arrive as paper, PDFs or screenshots
instead of calendar invites, open the admin's **Import events** page, drop the
files in (PDF, JPG, PNG, HEIC — a phone photo of a flyer works), and press
**Find events**. Claude reads the dates off them; you review, fix anything it
got wrong, pick a calendar for each, and add the ones you want. Nothing is
added until you confirm.

It needs an Anthropic API key in the server env:

```bash
sudo nano /etc/dashboard/env
# ANTHROPIC_API_KEY=sk-ant-...
sudo systemctl restart dashboard
```

Uploaded files are sent to the Anthropic API to be read and aren't stored on
the Pi.

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
