import type Database from 'better-sqlite3'
import { createEncryptor, deriveKey } from '../auth/encryption'
import { refreshAccessToken } from '../auth/google'
import { createTokenCache } from '../auth/token-cache'
import { createScheduler } from '../scheduler'
import type { Broker } from '../ws/broker'
import { getSyncToken, setSyncToken, upsertEvents } from './calendar-repo'
import type { CachedEvent } from './calendar-sync'
import { listEvents } from './google-client'
import { syncCalendarOnce } from './runner'

export interface SyncServiceOptions {
  db: Database.Database
  broker: Broker
  config: {
    googleClientId?: string
    googleClientSecret?: string
  }
  machineId: string
}

export const startSyncService = async (opts: SyncServiceOptions) => {
  if (!opts.config.googleClientId || !opts.config.googleClientSecret) {
    return { stop: () => {} }
  }
  const clientId = opts.config.googleClientId
  const clientSecret = opts.config.googleClientSecret

  const saltRow = opts.db.prepare("SELECT value FROM kv WHERE key='salt'").get() as
    | { value: string }
    | undefined
  let salt = saltRow?.value
  if (!salt) {
    salt = crypto.randomUUID()
    opts.db.prepare("INSERT INTO kv (key, value) VALUES ('salt', ?)").run(salt)
  }
  const key = await deriveKey(opts.machineId, salt)
  const enc = await createEncryptor(key)

  const tokenCache = createTokenCache((rt) => refreshAccessToken(clientId, clientSecret, rt))

  const sched = createScheduler()
  sched.every(60_000, async () => {
    const accounts = opts.db
      .prepare('SELECT id, refresh_token_encrypted FROM accounts')
      .all() as Array<{ id: string; refresh_token_encrypted: string }>
    for (const acc of accounts) {
      const refreshToken = enc.decrypt(acc.refresh_token_encrypted)
      const accessToken = await tokenCache.get(refreshToken)
      const cals = opts.db
        .prepare(
          'SELECT id, google_calendar_id FROM calendars WHERE account_id = ? AND visible = 1',
        )
        .all(acc.id) as Array<{ id: string; google_calendar_id: string }>
      for (const c of cals) {
        const result = await syncCalendarOnce({
          calendarId: c.id,
          accessToken,
          currentSyncToken: getSyncToken(opts.db, c.id),
          timeWindowDays: 90,
          list: (token, _, args) => listEvents(token, c.google_calendar_id, args),
          persist: (_calId, events: CachedEvent[]) => upsertEvents(opts.db, events),
          setToken: (calId, token) => setSyncToken(opts.db, calId, token),
          now: Date.now,
        })
        if (result.upserts + result.deletes > 0) {
          opts.broker.publish({ type: 'calendar:changed' })
        }
      }
    }
  })

  return { stop: () => sched.stop() }
}
