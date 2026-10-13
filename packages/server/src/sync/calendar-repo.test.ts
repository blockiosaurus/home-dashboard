import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import {
  deleteEvent,
  getFullSyncAt,
  pruneEventsNotIn,
  removeEvents,
  setFullSyncAt,
  upsertEvents,
} from './calendar-repo'

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

const row = (id: string, start: string, end: string, etag = 'e') => ({
  id: `c1::${id}`,
  calendarId: 'c1',
  googleEventId: id,
  etag,
  start: new Date(start),
  end: new Date(end),
  allDay: false,
  title: id,
  location: null,
  description: null,
  color: null,
  lastSyncedAt: new Date(),
})

describe('removeEvents', () => {
  it('deletes only the given ids of the given calendar and returns the count', () => {
    const { db, close } = openDatabase(dir)
    upsertEvents(db.raw, [
      row('a', '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z'),
      row('b', '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z'),
    ])
    expect(removeEvents(db.raw, 'c1', ['c1::a', 'c1::missing'])).toBe(1)
    expect(db.all<{ id: string }>('SELECT id FROM events_cache').map((r) => r.id)).toEqual([
      'c1::b',
    ])
    expect(removeEvents(db.raw, 'c1', [])).toBe(0)
    close()
  })
})

describe('pruneEventsNotIn', () => {
  it('drops stale rows overlapping the window, keeping listed, out-of-window and pending rows', () => {
    const { db, close } = openDatabase(dir)
    upsertEvents(db.raw, [
      row('kept', '2026-10-14T12:00:00Z', '2026-10-14T13:00:00Z'),
      row('stale', '2026-10-15T12:00:00Z', '2026-10-15T13:00:00Z'),
      row('outside', '2027-06-01T12:00:00Z', '2027-06-01T13:00:00Z'),
      row('pending-1', '2026-10-16T12:00:00Z', '2026-10-16T13:00:00Z', 'pending'),
      {
        ...row('other', '2026-10-15T12:00:00Z', '2026-10-15T13:00:00Z'),
        id: 'c2::other',
        calendarId: 'c2',
      },
    ])
    const removed = pruneEventsNotIn(
      db.raw,
      'c1',
      { from: Date.parse('2026-10-01T00:00:00Z'), to: Date.parse('2026-12-31T00:00:00Z') },
      ['c1::kept'],
    )
    expect(removed).toBe(1)
    const ids = db.all<{ id: string }>('SELECT id FROM events_cache ORDER BY id').map((r) => r.id)
    expect(ids).toEqual(['c1::kept', 'c1::outside', 'c1::pending-1', 'c2::other'])
    close()
  })
})

describe('full sync timestamp', () => {
  it('round-trips per calendar and starts as null', () => {
    const { db, close } = openDatabase(dir)
    expect(getFullSyncAt(db.raw, 'c1')).toBeNull()
    setFullSyncAt(db.raw, 'c1', 1234)
    setFullSyncAt(db.raw, 'c1', 5678)
    expect(getFullSyncAt(db.raw, 'c1')).toBe(5678)
    expect(getFullSyncAt(db.raw, 'c2')).toBeNull()
    close()
  })
})
