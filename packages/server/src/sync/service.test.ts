import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEncryptor, deriveKey } from '../auth/encryption'
import * as googleAuth from '../auth/google'
import { openDatabase } from '../db'
import { createBroker } from '../ws/broker'
import { markNeedsReconnect, needsReconnect } from './account-repo'
import * as googleClient from './google-client'
import { discoverCalendars, startSyncService } from './service'
import { loadSyncStatus } from './sync-status'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sync-service-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('discoverCalendars', () => {
  it('inserts new calendars, storing backgroundColor as color_override', async () => {
    const { db, close } = openDatabase(dir)
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', '', 'x', 'calendar', 0)`,
      )
      .run()
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([
      { id: 'cal-a@group.calendar.google.com', summary: 'Family', backgroundColor: '#abcdef' },
    ])

    await discoverCalendars(db.raw, 'TOKEN', 'acc1')

    const rows = db.all<{
      id: string
      summary: string
      color_override: string | null
      visible: number
    }>('SELECT id, summary, color_override, visible FROM calendars')
    expect(rows).toEqual([
      {
        id: 'acc1::cal-a@group.calendar.google.com',
        summary: 'Family',
        color_override: '#abcdef',
        visible: 1,
      },
    ])
    close()
  })

  it('never overwrites an existing calendar color_override', async () => {
    const { db, close } = openDatabase(dir)
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', '', 'x', 'calendar', 0)`,
      )
      .run()
    db.raw
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
         VALUES ('acc1::c1', 'acc1', 'c1', 'Old name', '#111111', 0)`,
      )
      .run()
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([
      { id: 'c1', summary: 'New name', backgroundColor: '#ffffff' },
    ])

    await discoverCalendars(db.raw, 'TOKEN', 'acc1')

    const row = db.get<{ summary: string; color_override: string; visible: number }>(
      "SELECT summary, color_override, visible FROM calendars WHERE id = 'acc1::c1'",
    )
    expect(row).toMatchObject({ summary: 'New name', color_override: '#111111', visible: 0 })
    close()
  })

  it('a reconnected account takes over the expired one with the same email', async () => {
    const { db, close } = openDatabase(dir)
    const add = db.raw.prepare(
      `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
       VALUES (?, 'google', ?, 'x', 'calendar', 0)`,
    )
    add.run('old', 'me@x.com')
    add.run('new', '')
    db.raw
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, visible)
         VALUES ('old::me@x.com', 'old', 'me@x.com', 'Me', 0)`,
      )
      .run()
    markNeedsReconnect(db.raw, 'old')
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([
      { id: 'me@x.com', summary: 'Me', primary: true },
    ])

    await discoverCalendars(db.raw, 'TOKEN', 'new')

    expect(db.all('SELECT id FROM accounts')).toEqual([{ id: 'new' }])
    expect(db.all('SELECT id, visible FROM calendars')).toEqual([
      { id: 'new::me@x.com', visible: 0 },
    ])
    expect(needsReconnect(db.raw, 'old')).toBe(false)
    close()
  })

  it('sets accounts.email from the primary calendar id', async () => {
    const { db, close } = openDatabase(dir)
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', '', 'x', 'calendar', 0)`,
      )
      .run()
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([
      { id: 'someone@gmail.com', summary: 'someone@gmail.com', primary: true },
      { id: 'holidays@group.v.calendar.google.com', summary: 'Holidays' },
    ])

    await discoverCalendars(db.raw, 'TOKEN', 'acc1')

    const account = db.get<{ email: string }>("SELECT email FROM accounts WHERE id = 'acc1'")
    expect(account?.email).toBe('someone@gmail.com')
    close()
  })
})

describe('startSyncService tick in-flight guard', () => {
  it('collapses overlapping runNow calls into a single tick, and runNow never throws', async () => {
    const { db, close } = openDatabase(dir)
    const broker = createBroker()

    const sync = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })

    // Encrypt a refresh token the same way the service does, using the salt
    // it just created in `db`'s kv table, so the tick's decrypt() succeeds
    // and execution reaches the (stubbed, no-network) calls below rather than
    // bailing out early on a decryption error.
    const saltRow = db.get<{ value: string }>("SELECT value FROM kv WHERE key='salt'")
    const key = await deriveKey('test-machine', saltRow?.value ?? '')
    const enc = await createEncryptor(key)
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', '', ?, 'calendar', 0)`,
      )
      .run(enc.encrypt('a-refresh-token'))

    // Gate refreshAccessToken so the first tick parks mid-flight — long
    // enough for a concurrent runNow() call to observe the in-flight flag
    // and no-op — then release it once both calls have been fired.
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const refreshSpy = vi.spyOn(googleAuth, 'refreshAccessToken').mockImplementation(async () => {
      await gate
      return { accessToken: 'ACCESS_TOKEN', expiresAt: Date.now() + 3_600_000 }
    })
    const listCalendarsSpy = vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([])

    const first = sync.runNow()
    const second = sync.runNow()

    release?.()
    await expect(Promise.all([first, second])).resolves.toBeDefined()

    // The second call arrived while the first was still parked on the gate,
    // so it should have been a no-op rather than a second concurrent tick.
    expect(refreshSpy).toHaveBeenCalledTimes(1)
    expect(listCalendarsSpy).toHaveBeenCalledTimes(1)

    // The guard resets after a tick finishes, so a later runNow() still runs
    // a fresh tick (asserted via listCalendars, called unconditionally each
    // tick — refreshAccessToken itself won't be called again here since
    // tokenCache still holds an unexpired cached access token).
    await expect(sync.runNow()).resolves.toBeUndefined()
    expect(listCalendarsSpy).toHaveBeenCalledTimes(2)

    sync.stop()
    close()
  })
})

describe('startSyncService writes sync status per tick', () => {
  it('zero accounts: a tick writes nothing', async () => {
    const { db, close } = openDatabase(dir)
    const broker = createBroker()
    const sync = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })

    await sync.runNow()

    expect(loadSyncStatus(db.raw)).toEqual({ lastSyncAt: null, lastError: null })
    sync.stop()
    close()
  })

  it('a successful tick records lastSyncAt and clears lastError', async () => {
    const { db, close } = openDatabase(dir)
    const broker = createBroker()
    const sync = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })

    const saltRow = db.get<{ value: string }>("SELECT value FROM kv WHERE key='salt'")
    const key = await deriveKey('test-machine', saltRow?.value ?? '')
    const enc = await createEncryptor(key)
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', '', ?, 'calendar', 0)`,
      )
      .run(enc.encrypt('a-refresh-token'))

    vi.spyOn(googleAuth, 'refreshAccessToken').mockResolvedValue({
      accessToken: 'ACCESS_TOKEN',
      expiresAt: Date.now() + 3_600_000,
    })
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([])

    const before = Date.now()
    await sync.runNow()

    const status = loadSyncStatus(db.raw)
    expect(status.lastError).toBeNull()
    expect(status.lastSyncAt).not.toBeNull()
    expect(status.lastSyncAt as number).toBeGreaterThanOrEqual(before)

    sync.stop()
    close()
  })

  it('re-lists the window for a token-only calendar and drops events Google cancelled', async () => {
    const { db, close } = openDatabase(dir)
    const broker = createBroker()
    const sync = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })

    const saltRow = db.get<{ value: string }>("SELECT value FROM kv WHERE key='salt'")
    const key = await deriveKey('test-machine', saltRow?.value ?? '')
    const enc = await createEncryptor(key)
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', '', ?, 'calendar', 0)`,
      )
      .run(enc.encrypt('a-refresh-token'))
    // A calendar synced before full-sync tracking existed: it has a token,
    // and a cached event that has since been deleted in Google.
    db.raw
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, visible, sync_token)
         VALUES ('acc1::cal', 'acc1', 'cal', 'Home', 1, 'OLD')`,
      )
      .run()
    const soon = Date.now() + 86_400_000
    db.raw
      .prepare(
        `INSERT INTO events_cache
           (id, calendar_id, google_event_id, etag, start, end, all_day, title, last_synced_at)
         VALUES ('acc1::cal::ghost', 'acc1::cal', 'ghost', 'e', ?, ?, 0, 'Ghost', 0)`,
      )
      .run(soon, soon + 3_600_000)

    vi.spyOn(googleAuth, 'refreshAccessToken').mockResolvedValue({
      accessToken: 'ACCESS_TOKEN',
      expiresAt: Date.now() + 3_600_000,
    })
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([])
    const far = new Date(Date.now() + 80 * 86_400_000).toISOString()
    const list = vi.spyOn(googleClient, 'listEvents').mockResolvedValue({
      events: [
        {
          id: 'far',
          etag: 'e',
          summary: 'Far future',
          start: { dateTime: far },
          end: { dateTime: far },
        },
      ],
      nextSyncToken: 'NEW',
    })

    await sync.runNow()

    expect(list.mock.calls[0]?.[2]).toHaveProperty('timeMax')
    expect(list.mock.calls[0]?.[2]).not.toHaveProperty('syncToken')
    const ids = db.all<{ id: string }>('SELECT id FROM events_cache').map((r) => r.id)
    expect(ids).toEqual(['acc1::cal::far'])

    // Next tick within the day goes back to the cheap token sync.
    list.mockResolvedValue({ events: [], nextSyncToken: 'NEWER' })
    await sync.runNow()
    expect(list.mock.calls[1]?.[2]).toEqual({ syncToken: 'NEW' })

    sync.stop()
    close()
  })

  it('a calendar whose events fail to list records lastError but still advances lastSyncAt', async () => {
    const { db, close } = openDatabase(dir)
    const broker = createBroker()
    const sync = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })

    const saltRow = db.get<{ value: string }>("SELECT value FROM kv WHERE key='salt'")
    const key = await deriveKey('test-machine', saltRow?.value ?? '')
    const enc = await createEncryptor(key)
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', '', ?, 'calendar', 0)`,
      )
      .run(enc.encrypt('a-refresh-token'))
    db.raw
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
         VALUES ('acc1::c1', 'acc1', 'c1', 'Family', NULL, 1)`,
      )
      .run()

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(googleAuth, 'refreshAccessToken').mockResolvedValue({
      accessToken: 'ACCESS_TOKEN',
      expiresAt: Date.now() + 3_600_000,
    })
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([])
    vi.spyOn(googleClient, 'listEvents').mockRejectedValue(new Error('calendar API 500'))

    const before = Date.now()
    await sync.runNow()

    const status = loadSyncStatus(db.raw)
    // The tick itself ran, so lastSyncAt advances; lastError is what tells
    // the family that one of their calendars is stale.
    expect(status.lastSyncAt as number).toBeGreaterThanOrEqual(before)
    expect(status.lastError).toBe("1 calendar couldn't sync: calendar API 500")

    sync.stop()
    close()
  })

  it("keeps a failing account's lastError when a later account in the same tick succeeds", async () => {
    const { db, close } = openDatabase(dir)
    const broker = createBroker()
    const sync = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })

    const saltRow = db.get<{ value: string }>("SELECT value FROM kv WHERE key='salt'")
    const key = await deriveKey('test-machine', saltRow?.value ?? '')
    const enc = await createEncryptor(key)
    // Two accounts, walked in insertion order: 'a' has a calendar that fails,
    // 'b' has none and sails through. The status write used to sit inside the
    // account loop, so b's clean result overwrote a's error in the same tick.
    for (const id of ['a-acct', 'b-acct']) {
      db.raw
        .prepare(
          `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
           VALUES (?, 'google', '', ?, 'calendar', 0)`,
        )
        .run(id, enc.encrypt(`refresh-token-${id}`))
    }
    db.raw
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
         VALUES ('a-acct::c1', 'a-acct', 'c1', 'Family', NULL, 1)`,
      )
      .run()

    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(googleAuth, 'refreshAccessToken').mockResolvedValue({
      accessToken: 'ACCESS_TOKEN',
      expiresAt: Date.now() + 3_600_000,
    })
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([])
    vi.spyOn(googleClient, 'listEvents').mockRejectedValue(new Error('calendar API 500'))

    const before = Date.now()
    await sync.runNow()

    const status = loadSyncStatus(db.raw)
    expect(status.lastSyncAt as number).toBeGreaterThanOrEqual(before)
    expect(status.lastError).toBe("1 calendar couldn't sync: calendar API 500")

    sync.stop()
    close()
  })

  it('an expired refresh token flags the account instead of deleting it', async () => {
    const { db, close } = openDatabase(dir)
    const broker = createBroker()
    const sync = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })
    const saltRow = db.get<{ value: string }>("SELECT value FROM kv WHERE key='salt'")
    const enc = await createEncryptor(await deriveKey('test-machine', saltRow?.value ?? ''))
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', 'me@x.com', ?, 'calendar', 0)`,
      )
      .run(enc.encrypt('dead-token'))
    db.raw
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, visible)
         VALUES ('acc1::me@x.com', 'acc1', 'me@x.com', 'Me', 1)`,
      )
      .run()

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const refresh = vi
      .spyOn(googleAuth, 'refreshAccessToken')
      .mockRejectedValue(
        new googleAuth.InvalidRefreshTokenError('Token has been expired or revoked.'),
      )

    await sync.runNow()

    expect(db.all('SELECT id FROM accounts')).toEqual([{ id: 'acc1' }])
    expect(db.all('SELECT id FROM calendars')).toEqual([{ id: 'acc1::me@x.com' }])
    expect(needsReconnect(db.raw, 'acc1')).toBe(true)
    const message = 'Google access expired for me@x.com. Reconnect in Settings.'
    expect(loadSyncStatus(db.raw).lastError).toBe(message)

    // Later ticks don't keep hammering Google with the dead token, but the
    // error stays up.
    await sync.runNow()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(loadSyncStatus(db.raw).lastError).toBe(message)

    sync.stop()
    close()
  })

  it('a failing tick keeps the previous lastSyncAt and records lastError', async () => {
    const { db, close } = openDatabase(dir)
    const broker = createBroker()

    // `startSyncService` creates the salt on first run if none exists yet, so
    // read it only after that, before encrypting the refresh token, to make
    // sure it decrypts under the same key both ticks.
    const sync1 = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })
    const saltRow = db.get<{ value: string }>("SELECT value FROM kv WHERE key='salt'")
    const key = await deriveKey('test-machine', saltRow?.value ?? '')
    const enc = await createEncryptor(key)
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('acc1', 'google', '', ?, 'calendar', 0)`,
      )
      .run(enc.encrypt('a-refresh-token'))

    vi.spyOn(googleAuth, 'refreshAccessToken').mockResolvedValueOnce({
      accessToken: 'ACCESS_TOKEN',
      expiresAt: Date.now() + 3_600_000,
    })
    vi.spyOn(googleClient, 'listCalendars').mockResolvedValue([])

    await sync1.runNow()
    sync1.stop()

    const afterSuccess = loadSyncStatus(db.raw)
    expect(afterSuccess.lastError).toBeNull()
    expect(afterSuccess.lastSyncAt).not.toBeNull()

    // A fresh service instance has an empty token cache, so its tick calls
    // refreshAccessToken again rather than reusing the first instance's
    // cached access token — this time make that call fail.
    const sync2 = await startSyncService({
      db: db.raw,
      broker,
      config: { googleClientId: 'client-id', googleClientSecret: 'client-secret' },
      machineId: 'test-machine',
    })
    vi.restoreAllMocks()
    // The tick logs the (expected) failure; keep the stack trace out of the
    // test output so a real error still stands out when one appears.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(googleAuth, 'refreshAccessToken').mockRejectedValue(new Error('network down'))

    await sync2.runNow()
    sync2.stop()

    const afterFailure = loadSyncStatus(db.raw)
    expect(afterFailure.lastSyncAt).toBe(afterSuccess.lastSyncAt)
    expect(afterFailure.lastError).toBe('network down')

    close()
  })
})
