import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'calendars-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const seedCalendars = async (app: Awaited<ReturnType<typeof buildApp>>) => {
  app.db
    .prepare(
      `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
       VALUES ('acc1', 'google', 'me@example.com', 'x', 'calendar', 0)`,
    )
    .run()
  app.db
    .prepare(
      `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
       VALUES ('acc1::b', 'acc1', 'b', 'Birthdays', NULL, 1)`,
    )
    .run()
  app.db
    .prepare(
      `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
       VALUES ('acc1::a', 'acc1', 'a', 'Appointments', '#ff0000', 0)`,
    )
    .run()
}

describe('calendars routes', () => {
  it('GET lists calendars ordered by summary, with color from color_override', async () => {
    const app = await buildApp({ dataDir: dir })
    await seedCalendars(app)
    const res = await app.inject({ method: 'GET', url: '/api/calendars' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      calendars: [
        {
          id: 'acc1::a',
          accountId: 'acc1',
          summary: 'Appointments',
          visible: false,
          color: '#ff0000',
        },
        {
          id: 'acc1::b',
          accountId: 'acc1',
          summary: 'Birthdays',
          visible: true,
          color: null,
        },
      ],
    })
    await app.close()
  })

  it('PUT toggles visible', async () => {
    const app = await buildApp({ dataDir: dir })
    await seedCalendars(app)
    const res = await app.inject({
      method: 'PUT',
      url: '/api/calendars/acc1::b',
      payload: { visible: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: 'acc1::b', visible: false })

    const list = await app.inject({ method: 'GET', url: '/api/calendars' })
    const updated = (list.json() as { calendars: Array<{ id: string; visible: boolean }> })
      .calendars
    expect(updated.find((c) => c.id === 'acc1::b')?.visible).toBe(false)
    await app.close()
  })

  it('PUT updates color', async () => {
    const app = await buildApp({ dataDir: dir })
    await seedCalendars(app)
    const res = await app.inject({
      method: 'PUT',
      url: '/api/calendars/acc1::b',
      payload: { color: '#00ff00' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: 'acc1::b', color: '#00ff00' })
    await app.close()
  })

  it('PUT returns 404 for an unknown calendar', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({
      method: 'PUT',
      url: '/api/calendars/nope',
      payload: { visible: true },
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
