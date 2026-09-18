import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEncryptor, deriveKey } from '../auth/encryption'
import * as googleAuth from '../auth/google'
import { openDatabase } from '../db'
import { createBroker } from '../ws/broker'
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
    vi.spyOn(googleAuth, 'refreshAccessToken').mockRejectedValue(new Error('network down'))

    await sync2.runNow()
    sync2.stop()

    const afterFailure = loadSyncStatus(db.raw)
    expect(afterFailure.lastSyncAt).toBe(afterSuccess.lastSyncAt)
    expect(afterFailure.lastError).toBe('network down')

    close()
  })
})
