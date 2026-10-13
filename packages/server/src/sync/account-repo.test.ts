import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import {
  adoptPredecessors,
  clearNeedsReconnect,
  markNeedsReconnect,
  needsReconnect,
  removeAccountData,
} from './account-repo'
import { getFullSyncAt, setFullSyncAt } from './calendar-repo'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'acct-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

type Db = ReturnType<typeof openDatabase>['db']

const addAccount = (db: Db, id: string, email = '') =>
  db.raw
    .prepare(
      `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
       VALUES (?, 'google', ?, 'x', 'calendar', 0)`,
    )
    .run(id, email)

const addCalendar = (
  db: Db,
  accountId: string,
  gid: string,
  visible = 1,
  color: string | null = null,
) =>
  db.raw
    .prepare(
      `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible, sync_token)
       VALUES (?, ?, ?, ?, ?, ?, 'T')`,
    )
    .run(`${accountId}::${gid}`, accountId, gid, gid, color, visible)

const addEvent = (db: Db, calendarId: string, gid: string) =>
  db.raw
    .prepare(
      `INSERT INTO events_cache
         (id, calendar_id, google_event_id, etag, start, end, all_day, title, last_synced_at)
       VALUES (?, ?, ?, 'e', 0, 1, 0, 't', 0)`,
    )
    .run(`${calendarId}::${gid}`, calendarId, gid)

const calendarRows = (db: Db) =>
  db.all<{ id: string; visible: number; color_override: string | null }>(
    'SELECT id, visible, color_override FROM calendars ORDER BY id',
  )

describe('needsReconnect flag', () => {
  it('marks, reads and clears per account', () => {
    const { db, close } = openDatabase(dir)
    expect(needsReconnect(db.raw, 'a1')).toBe(false)
    markNeedsReconnect(db.raw, 'a1')
    expect(needsReconnect(db.raw, 'a1')).toBe(true)
    expect(needsReconnect(db.raw, 'a2')).toBe(false)
    clearNeedsReconnect(db.raw, 'a1')
    expect(needsReconnect(db.raw, 'a1')).toBe(false)
    close()
  })
})

describe('removeAccountData', () => {
  it('drops the account, its calendars, events and kv bookkeeping only', () => {
    const { db, close } = openDatabase(dir)
    addAccount(db, 'a1')
    addAccount(db, 'a2')
    addCalendar(db, 'a1', 'cal')
    addCalendar(db, 'a2', 'cal')
    addEvent(db, 'a1::cal', 'e')
    addEvent(db, 'a2::cal', 'e')
    markNeedsReconnect(db.raw, 'a1')
    setFullSyncAt(db.raw, 'a1::cal', 1)
    setFullSyncAt(db.raw, 'a2::cal', 2)

    removeAccountData(db.raw, 'a1')

    expect(db.all<{ id: string }>('SELECT id FROM accounts').map((r) => r.id)).toEqual(['a2'])
    expect(calendarRows(db).map((r) => r.id)).toEqual(['a2::cal'])
    expect(db.all<{ id: string }>('SELECT id FROM events_cache').map((r) => r.id)).toEqual([
      'a2::cal::e',
    ])
    expect(needsReconnect(db.raw, 'a1')).toBe(false)
    expect(getFullSyncAt(db.raw, 'a1::cal')).toBeNull()
    expect(getFullSyncAt(db.raw, 'a2::cal')).toBe(2)
    close()
  })
})

describe('adoptPredecessors', () => {
  it('replaces an older account with the same email, carrying over settings', () => {
    const { db, close } = openDatabase(dir)
    addAccount(db, 'old', 'me@x.com')
    addCalendar(db, 'old', 'me@x.com', 1, '#111111')
    addCalendar(db, 'old', 'work', 0, '#222222')
    addEvent(db, 'old::me@x.com', 'e')
    db.raw
      .prepare(
        "INSERT INTO people (id, name, color, primary_calendar_id) VALUES ('p1', 'Me', '#fff', 'old::me@x.com')",
      )
      .run()
    addAccount(db, 'new', 'me@x.com')
    addCalendar(db, 'new', 'me@x.com', 1, '#aaaaaa')
    addCalendar(db, 'new', 'work', 1, '#bbbbbb')

    expect(adoptPredecessors(db.raw, 'new', 'me@x.com', ['me@x.com', 'work'])).toEqual(['old'])

    expect(calendarRows(db)).toEqual([
      { id: 'new::me@x.com', visible: 1, color_override: '#111111' },
      { id: 'new::work', visible: 0, color_override: '#222222' },
    ])
    expect(db.all('SELECT id FROM events_cache')).toEqual([])
    expect(
      db.get<{ c: string }>("SELECT primary_calendar_id AS c FROM people WHERE id='p1'")?.c,
    ).toBe('new::me@x.com')
    expect(db.all<{ id: string }>('SELECT id FROM accounts').map((r) => r.id)).toEqual(['new'])
    close()
  })

  it('adopts the orphaned calendars (account row gone) that belong to this person', () => {
    // The state an expired-token purge left behind: two people's calendars
    // with no account rows. Each shares the other's primary calendar, so
    // "contains my email" alone is ambiguous.
    const { db, close } = openDatabase(dir)
    for (const g of ['keith@x.com', 'family', 'chores']) addCalendar(db, 'k-old', g, 1)
    for (const g of ['leanne@x.com', 'keith@x.com', 'family', 'work'])
      addCalendar(db, 'l-old', g, 0)
    addAccount(db, 'k-new', 'keith@x.com')
    for (const g of ['keith@x.com', 'family', 'chores']) addCalendar(db, 'k-new', g, 1)

    expect(
      adoptPredecessors(db.raw, 'k-new', 'keith@x.com', ['keith@x.com', 'family', 'chores']),
    ).toEqual(['k-old'])
    expect(calendarRows(db).filter((r) => r.id.startsWith('l-old')).length).toBe(4)

    addAccount(db, 'l-new', 'leanne@x.com')
    for (const g of ['leanne@x.com', 'keith@x.com', 'family', 'work'])
      addCalendar(db, 'l-new', g, 1)
    expect(
      adoptPredecessors(db.raw, 'l-new', 'leanne@x.com', [
        'leanne@x.com',
        'keith@x.com',
        'family',
        'work',
      ]),
    ).toEqual(['l-old'])
    expect(
      calendarRows(db)
        .filter((r) => r.id.startsWith('l-new'))
        .every((r) => r.visible === 0),
    ).toBe(true)
    close()
  })

  it('leaves orphans alone when none contains the email, or when it is a tie', () => {
    const { db, close } = openDatabase(dir)
    addCalendar(db, 'o1', 'someone@x.com')
    addCalendar(db, 'o2', 'me@x.com')
    addCalendar(db, 'o3', 'me@x.com')
    addAccount(db, 'new', 'me@x.com')
    addCalendar(db, 'new', 'me@x.com')
    expect(adoptPredecessors(db.raw, 'new', 'me@x.com', ['me@x.com'])).toEqual([])
    expect(calendarRows(db).length).toBe(4)
    close()
  })

  it('is a no-op for a healthy account with no predecessors', () => {
    const { db, close } = openDatabase(dir)
    addAccount(db, 'a1', 'me@x.com')
    addCalendar(db, 'a1', 'me@x.com')
    addAccount(db, 'a2', 'you@x.com')
    addCalendar(db, 'a2', 'me@x.com')
    expect(adoptPredecessors(db.raw, 'a1', 'me@x.com', ['me@x.com'])).toEqual([])
    expect(calendarRows(db).length).toBe(2)
    close()
  })
})
