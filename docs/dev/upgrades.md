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
