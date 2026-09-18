import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db'
import * as googleClient from './google-client'
import { discoverCalendars } from './service'

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
