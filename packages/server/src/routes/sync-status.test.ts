import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { writeSyncStatus } from '../sync/sync-status'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sync-status-route-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('GET /api/sync/status', () => {
  it('returns null lastSyncAt/lastError and zero eventCount before any sync', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/sync/status' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ lastSyncAt: null, lastError: null, eventCount: 0 })
    await app.close()
  })

  it('reflects a written sync status', async () => {
    const app = await buildApp({ dataDir: dir })
    writeSyncStatus(app.db, { lastSyncAt: 12345, lastError: null })
    const res = await app.inject({ method: 'GET', url: '/api/sync/status' })
    expect(res.json()).toMatchObject({ lastSyncAt: 12345, lastError: null })
    await app.close()
  })

  it('reflects a sync error', async () => {
    const app = await buildApp({ dataDir: dir })
    writeSyncStatus(app.db, { lastError: 'refresh token invalid' })
    const res = await app.inject({ method: 'GET', url: '/api/sync/status' })
    expect(res.json()).toMatchObject({ lastError: 'refresh token invalid' })
    await app.close()
  })

  it('counts only non-deleted events', async () => {
    const app = await buildApp({ dataDir: dir })
    app.db
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
         VALUES ('cal1', 'acc1', 'gcal1', 'Mine', NULL, 1)`,
      )
      .run()
    const now = Date.now()
    app.db
      .prepare(
        `INSERT INTO events_cache
           (id, calendar_id, google_event_id, etag, start, end, all_day, title, location, description, color, last_synced_at, deleted_at)
         VALUES ('ev1', 'cal1', 'gev1', 'etag1', ?, ?, 0, 'Kept', NULL, NULL, NULL, ?, NULL)`,
      )
      .run(now, now + 1000, now)
    app.db
      .prepare(
        `INSERT INTO events_cache
           (id, calendar_id, google_event_id, etag, start, end, all_day, title, location, description, color, last_synced_at, deleted_at)
         VALUES ('ev2', 'cal1', 'gev2', 'etag2', ?, ?, 0, 'Deleted', NULL, NULL, NULL, ?, ?)`,
      )
      .run(now, now + 1000, now, now)

    const res = await app.inject({ method: 'GET', url: '/api/sync/status' })
    expect(res.json()).toMatchObject({ eventCount: 1 })
    await app.close()
  })
})
