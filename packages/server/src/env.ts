import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as dotenv } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Load env vars from the first matching .env file:
 *   1. process.env.DASHBOARD_ENV_FILE (explicit override)
 *   2. <repo-root>/.env
 *   3. <package>/.env
 *
 * Existing process.env values always win (so DASHBOARD_ENV_FILE / systemd
 * `EnvironmentFile=` continue to take precedence).
 */
export const loadEnvFile = (): { loaded: string | null } => {
  const candidates: string[] = []
  if (process.env.DASHBOARD_ENV_FILE) candidates.push(process.env.DASHBOARD_ENV_FILE)
  // Server runs from packages/server (src/ in dev, dist/ in prod). Repo root
  // is three levels up from either.
  candidates.push(join(here, '..', '..', '..', '.env'))
  candidates.push(join(here, '..', '.env'))

  for (const path of candidates) {
    if (existsSync(path)) {
      dotenv({ path, override: false })
      return { loaded: path }
    }
  }
  return { loaded: null }
}
