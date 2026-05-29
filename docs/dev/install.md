# Installing on a Raspberry Pi 4

## You need

- Raspberry Pi 4 (4GB or 8GB)
- Raspberry Pi OS Bookworm 64-bit (lite is fine)
- 18.5" touchscreen wired up (HDMI + USB for touch)
- The Pi attached to your home WiFi
- A Google Cloud OAuth 2.0 client of type "TVs and Limited Input devices"

## Running locally for development

Copy `.env.example` to `.env` at the repo root and fill in your Google OAuth
client id + secret:

    cp .env.example .env
    # edit .env with your editor

Then start the server (it auto-loads `.env`):

    pnpm install
    pnpm -r build
    pnpm --filter @dashboard/server start

Open the admin at http://localhost:3000/admin/ to run the wizard.

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

4. Configure your Google OAuth client id + secret. On the Pi, prefer the
   systemd-managed file at `/etc/dashboard/env` (root-owned, 0640):

       sudo nano /etc/dashboard/env
       sudo systemctl restart dashboard

   For dev or non-Pi installs, copy the template at the repo root:

       cp .env.example .env
       # edit .env

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
