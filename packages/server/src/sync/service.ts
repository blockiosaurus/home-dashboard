import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { createEncryptor, deriveKey } from '../auth/encryption'
import { InvalidRefreshTokenError, refreshAccessToken } from '../auth/google'
import { createTokenCache } from '../auth/token-cache'
import { createScheduler } from '../scheduler'
import type { Broker } from '../ws/broker'
import { adoptPredecessors, markNeedsReconnect, needsReconnect } from './account-repo'
import {
  getFullSyncAt,
  getSyncToken,
  pruneEventsNotIn,
  removeEvents,
  setFullSyncAt,
  setSyncToken,
  upsertEvents,
} from './calendar-repo'
import type { CachedEvent } from './calendar-sync'
import { listCalendars, listEvents } from './google-client'
import { syncCalendarOnce } from './runner'
import { writeSyncStatus } from './sync-status'

const upsertCalendar = (
  db: Database.Database,
  args: {
    id: string
    accountId: string
    googleCalendarId: string
    summary: string
    colorOverride: string | null
  },
) => {
  // `color_override` is intentionally omitted from the ON CONFLICT clause: it
  // is only ever set here for a brand-new row (from Google's calendar color),
  // never overwriting a user's own choice on an existing calendar.
  db.prepare(
    `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET
       google_calendar_id = excluded.google_calendar_id,
       summary = excluded.summary`,
  ).run(args.id, args.accountId, args.googleCalendarId, args.summary, args.colorOverride)
}

/**
 * Discovers the Google calendars visible to `accessToken` and mirrors them
 * into our `calendars` table for `accountId`. Pre-existing rows keep their
 * visibility / color / sync_token; new ones are inserted as visible=1 with
 * Google's own calendar color as a starting `color_override`. When a
 * calendar is the account's primary one, its id is the account's email
 * address, so we backfill `accounts.email` from it (the account row is
 * created with an empty email at OAuth time, before we know this). Knowing
 * the email, a reconnect then takes over the account it replaces.
 */
export const discoverCalendars = async (
  db: Database.Database,
  accessToken: string,
  accountId: string,
): Promise<void> => {
  const remoteCals = await listCalendars(accessToken)
  for (const r of remoteCals) {
    upsertCalendar(db, {
      id: `${accountId}::${r.id}`,
      accountId,
      googleCalendarId: r.id,
      summary: r.summary,
      colorOverride: r.backgroundColor ?? null,
    })
    if (r.primary) {
      db.prepare('UPDATE accounts SET email = ? WHERE id = ?').run(r.id, accountId)
    }
  }
  const primary = remoteCals.find((r) => r.primary)
  if (primary) {
    adoptPredecessors(
      db,
      accountId,
      primary.id,
      remoteCals.map((r) => r.id),
    )
  }
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

export interface SyncService {
  stop: () => void
  /** Runs one sync tick immediately (used right after a new account is
   * connected, so a calendar picker doesn't have to wait for the 60s
   * schedule). Overlapping calls are collapsed: if a tick is already running
   * — from the schedule or a previous `runNow` — this is a no-op. */
  runNow: () => Promise<void>
}

export const startSyncService = async (opts: SyncServiceOptions): Promise<SyncService> => {
  if (!opts.config.googleClientId || !opts.config.googleClientSecret) {
    return { stop: () => {}, runNow: async () => {} }
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

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const accounts = opts.db
        .prepare('SELECT id, email, refresh_token_encrypted FROM accounts')
        .all() as Array<{ id: string; email: string; refresh_token_encrypted: string }>

      // Failures are tallied across the whole tick and written once at the
      // end. Writing per account meant a healthy second account cleared the
      // first one's lastError back to null in the very same tick.
      let calendarFailures = 0
      let lastCalendarFailureMessage = ''
      let accountFailureMessage: string | null = null
      // True once any account has made it through its calendar loop, i.e. at
      // least some of the cache is fresh — that, and only that, advances
      // lastSyncAt.
      let anyAccountSynced = false
      const expired: string[] = []

      for (const acc of accounts) {
        if (needsReconnect(opts.db, acc.id)) {
          expired.push(acc.email || 'a Google account')
          continue
        }
        try {
          const refreshToken = enc.decrypt(acc.refresh_token_encrypted)
          const accessToken = await tokenCache.get(refreshToken)

          try {
            await discoverCalendars(opts.db, accessToken, acc.id)
          } catch (err) {
            // Log but don't abort — we may still have cached calendars to sync.
            console.error('discoverCalendars failed', err)
          }

          const cals = opts.db
            .prepare(
              'SELECT id, google_calendar_id FROM calendars WHERE account_id = ? AND visible = 1',
            )
            .all(acc.id) as Array<{ id: string; google_calendar_id: string }>
          // Per-calendar failures don't abort the account's tick, but they
          // must still surface: without the tally below, a tick reported a
          // clean sync while some calendars were silently stale.
          for (const c of cals) {
            try {
              const result = await syncCalendarOnce({
                calendarId: c.id,
                accessToken,
                currentSyncToken: getSyncToken(opts.db, c.id),
                lastFullSyncAt: getFullSyncAt(opts.db, c.id),
                fullSyncIntervalMs: 86_400_000,
                timeWindowDays: 90,
                list: (token, _, args) => listEvents(token, c.google_calendar_id, args),
                persist: (_calId, events: CachedEvent[]) => upsertEvents(opts.db, events),
                remove: (calId, ids) => removeEvents(opts.db, calId, ids),
                prune: (calId, window, keep) => pruneEventsNotIn(opts.db, calId, window, keep),
                setToken: (calId, token) => setSyncToken(opts.db, calId, token),
                setFullSyncAt: (calId, at) => setFullSyncAt(opts.db, calId, at),
                now: Date.now,
              })
              if (result.upserts + result.deletes > 0) {
                opts.broker.publish({ type: 'calendar:changed' })
              }
            } catch (err) {
              calendarFailures += 1
              lastCalendarFailureMessage = err instanceof Error ? err.message : String(err)
              console.error(`sync failed for calendar ${c.id}`, err)
            }
          }
          anyAccountSynced = true
        } catch (err) {
          if (err instanceof InvalidRefreshTokenError) {
            // Revoked or expired (Google expires tokens after 7 days while the
            // OAuth app is in "Testing"). Deleting the account here used to
            // stop syncing silently while its stale events stayed up; keep it
            // flagged instead, so the error shows until a reconnect replaces it.
            console.warn(`account ${acc.id} needs reconnecting: ${err.message}`)
            markNeedsReconnect(opts.db, acc.id)
            expired.push(acc.email || 'a Google account')
            continue
          }
          console.error(`sync failed for account ${acc.id}`, err)
          accountFailureMessage = err instanceof Error ? err.message : String(err)
        }
      }

      // One write per tick. Nothing is written at all when there was nothing
      // to do (no accounts),
      // so a fresh install keeps reading as "never synced".
      if (anyAccountSynced || accountFailureMessage !== null || expired.length > 0) {
        const calendarSummary =
          calendarFailures === 0
            ? null
            : `${calendarFailures} ${calendarFailures === 1 ? "calendar couldn't" : "calendars couldn't"} sync: ${lastCalendarFailureMessage}`
        writeSyncStatus(opts.db, {
          // Most actionable first: an account that needs reconnecting, then
          // one that couldn't get a token, then per-calendar failures.
          lastError:
            (expired.length > 0
              ? `Google access expired for ${expired.join(', ')}. Reconnect in Settings.`
              : null) ??
            accountFailureMessage ??
            calendarSummary,
          // Only advance the timestamp if some account actually synced; a tick
          // where every account failed must keep the previous lastSyncAt.
          ...(anyAccountSynced ? { lastSyncAt: Date.now() } : {}),
        })
      }
    } finally {
      running = false
    }
  }

  const sched = createScheduler()
  sched.every(60_000, tick)

  return { stop: () => sched.stop(), runNow: tick }
}
