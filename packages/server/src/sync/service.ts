import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { createEncryptor, deriveKey } from '../auth/encryption'
import { InvalidRefreshTokenError, refreshAccessToken } from '../auth/google'
import { createTokenCache } from '../auth/token-cache'
import { createScheduler } from '../scheduler'
import type { Broker } from '../ws/broker'
import { getSyncToken, setSyncToken, upsertEvents } from './calendar-repo'
import type { CachedEvent } from './calendar-sync'
import { listCalendars, listEvents } from './google-client'
import { syncCalendarOnce } from './runner'

const upsertCalendar = (
  db: Database.Database,
  args: { id: string; accountId: string; googleCalendarId: string; summary: string },
) => {
  db.prepare(
    `INSERT INTO calendars (id, account_id, google_calendar_id, summary, visible)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       google_calendar_id = excluded.google_calendar_id,
       summary = excluded.summary`,
  ).run(args.id, args.accountId, args.googleCalendarId, args.summary)
}

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
    salt = randomUUID()
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
      try {
        const refreshToken = enc.decrypt(acc.refresh_token_encrypted)
        const accessToken = await tokenCache.get(refreshToken)

        // Discover calendars on Google and mirror them into our calendars
        // table. Pre-existing rows keep their visibility / sync_token; new
        // ones are inserted as visible=1.
        try {
          const remoteCals = await listCalendars(accessToken)
          for (const r of remoteCals) {
            upsertCalendar(opts.db, {
              id: `${acc.id}::${r.id}`,
              accountId: acc.id,
              googleCalendarId: r.id,
              summary: r.summary,
            })
          }
        } catch (err) {
          // Log but don't abort — we may still have cached calendars to sync.
          console.error('listCalendars failed', err)
        }

        const cals = opts.db
          .prepare(
            'SELECT id, google_calendar_id FROM calendars WHERE account_id = ? AND visible = 1',
          )
          .all(acc.id) as Array<{ id: string; google_calendar_id: string }>
        for (const c of cals) {
          try {
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
          } catch (err) {
            console.error(`sync failed for calendar ${c.id}`, err)
          }
        }
      } catch (err) {
        if (err instanceof InvalidRefreshTokenError) {
          // Token has been revoked or superseded — most often because the user
          // re-ran the wizard, creating a fresher account row. Drop the dead
          // one so future ticks don't crash.
          console.warn(`removing account ${acc.id}: ${err.message}`)
          opts.db.prepare('DELETE FROM accounts WHERE id = ?').run(acc.id)
          continue
        }
        console.error(`sync failed for account ${acc.id}`, err)
      }
    }
  })

  return { stop: () => sched.stop() }
}
