import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-test-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('0003_all_day_local_midnight', () => {
  it('moves cached all-day rows from UTC midnight to local midnight', () => {
    const sqlite = new Database(join(dir, 'm.db'))
    const d = drizzle(sqlite)
    // Migrate to the latest schema, seed rows in the old UTC-midnight format,
    // then replay 0003's statement against them.
    migrate(d, { migrationsFolder })
    const insert = sqlite.prepare(
      `INSERT INTO events_cache (id, calendar_id, google_event_id, etag, start, end, all_day, title, last_synced_at)
       VALUES (?, 'c', 'g', 'e', ?, ?, ?, 't', 0)`,
    )
    insert.run('allday', Date.UTC(2026, 9, 10), Date.UTC(2026, 9, 11), 1)
    insert.run('timed', Date.UTC(2026, 9, 10, 15), Date.UTC(2026, 9, 10, 16), 0)
    sqlite.exec(readFileSync(join(migrationsFolder, '0003_all_day_local_midnight.sql'), 'utf8'))
    const rows = sqlite
      .prepare('SELECT id, start, end FROM events_cache ORDER BY id')
      .all() as Array<{
      id: string
      start: number
      end: number
    }>
    expect(rows[0]).toEqual({
      id: 'allday',
      start: new Date(2026, 9, 10).getTime(),
      end: new Date(2026, 9, 11).getTime(),
    })
    expect(rows[1]).toEqual({
      id: 'timed',
      start: Date.UTC(2026, 9, 10, 15),
      end: Date.UTC(2026, 9, 10, 16),
    })
    sqlite.close()
  })
})
