import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'

describe('event writes', () => {
  it('POST /api/events queues an outbox entry and updates cache optimistically', async () => {
    const dir = `/tmp/ew-${Date.now()}`
    const app = await buildApp({ dataDir: dir })
    // Seed a calendar so the FK reference works
    app.db
      .prepare(
        'INSERT INTO calendars (id, account_id, google_calendar_id, summary, visible) VALUES (?, ?, ?, ?, 1)',
      )
      .run('cal1', 'acc1', 'gcal1', 'Mom')

    const body = {
      calendarId: 'cal1',
      title: 'Lunch',
      start: Date.now() + 3600_000,
      end: Date.now() + 7200_000,
      allDay: false,
    }
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: body })
    expect(res.statusCode).toBe(201)
    const outbox = app.db.prepare('SELECT COUNT(*) AS n FROM events_outbox').get() as {
      n: number
    }
    expect(outbox.n).toBe(1)
    const cache = app.db.prepare('SELECT COUNT(*) AS n FROM events_cache').get() as {
      n: number
    }
    expect(cache.n).toBe(1)
    await app.close()
  })
})
