import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { deleteEvent, upsertEvents } from './calendar-repo'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cal-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('calendar-repo', () => {
  it('upserts and deletes events', () => {
    const { db, close } = openDatabase(dir)
    upsertEvents(db.raw, [
      {
        id: 'c1::g1',
        calendarId: 'c1',
        googleEventId: 'g1',
        etag: 'e1',
        start: new Date('2026-05-29T12:00:00Z'),
        end: new Date('2026-05-29T13:00:00Z'),
        allDay: false,
        title: 'lunch',
        location: null,
        description: null,
        color: null,
        lastSyncedAt: new Date(),
      },
    ])
    const rows = db.all<{ id: string }>('SELECT id FROM events_cache')
    expect(rows.map((r) => r.id)).toEqual(['c1::g1'])
    deleteEvent(db.raw, 'c1::g1')
    expect(db.all('SELECT id FROM events_cache')).toEqual([])
    close()
  })
})
