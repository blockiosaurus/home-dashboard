import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../app'
import { createEncryptor, deriveKey } from '../auth/encryption'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))
afterEach(() => fetchMock.mockReset())

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('accounts-write', () => {
  it('DELETE revokes token and removes row', async () => {
    const app = await buildApp({ dataDir: dir })
    app.db.prepare("INSERT INTO kv (key, value) VALUES ('salt', 'S')").run()
    const key = await deriveKey('dev-machine', 'S')
    const enc = await createEncryptor(key)
    app.db
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('a1', 'google', '', ?, 'calendar', ?)`,
      )
      .run(enc.encrypt('rt-secret'), Date.now())

    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    const res = await app.inject({ method: 'DELETE', url: '/api/accounts/a1' })
    expect(res.statusCode).toBe(204)
    expect(fetchMock).toHaveBeenCalled()
    const row = app.db.prepare('SELECT id FROM accounts WHERE id = ?').get('a1')
    expect(row).toBeUndefined()
    await app.close()
  })

  it('DELETE removes only that account’s calendars and events', async () => {
    const app = await buildApp({ dataDir: dir })
    app.db.prepare("INSERT INTO kv (key, value) VALUES ('salt', 'S')").run()
    const key = await deriveKey('dev-machine', 'S')
    const enc = await createEncryptor(key)
    const addAccount = app.db.prepare(
      `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
       VALUES (?, 'google', ?, ?, 'calendar', ?)`,
    )
    addAccount.run('a1', 'one@example.com', enc.encrypt('rt-1'), Date.now())
    addAccount.run('a2', 'two@example.com', enc.encrypt('rt-2'), Date.now())
    const addCalendar = app.db.prepare(
      `INSERT INTO calendars (id, account_id, google_calendar_id, summary, visible)
       VALUES (?, ?, ?, ?, 1)`,
    )
    addCalendar.run('a1::cal', 'a1', 'cal-1', 'One')
    addCalendar.run('a2::cal', 'a2', 'cal-2', 'Two')
    const addEvent = app.db.prepare(
      `INSERT INTO events_cache
         (id, calendar_id, google_event_id, etag, start, end, all_day, title, last_synced_at)
       VALUES (?, ?, ?, 'e', ?, ?, 0, ?, ?)`,
    )
    const now = Date.now()
    addEvent.run('e1', 'a1::cal', 'g1', now, now + 1000, 'Leaving', now)
    addEvent.run('e2', 'a2::cal', 'g2', now, now + 1000, 'Staying', now)

    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    const res = await app.inject({ method: 'DELETE', url: '/api/accounts/a1' })
    expect(res.statusCode).toBe(204)

    const calendars = app.db.prepare('SELECT id FROM calendars').all()
    expect(calendars).toEqual([{ id: 'a2::cal' }])
    const events = app.db.prepare('SELECT id FROM events_cache').all()
    expect(events).toEqual([{ id: 'e2' }])
    const accounts = app.db.prepare('SELECT id FROM accounts').all()
    expect(accounts).toEqual([{ id: 'a2' }])
    await app.close()
  })

  it('DELETE returns 404 for unknown account', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'DELETE', url: '/api/accounts/missing' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
