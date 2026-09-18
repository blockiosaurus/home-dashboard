import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'events-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('events routes', () => {
  it('GET /api/events returns events within window', async () => {
    const app = await buildApp({ dataDir: dir })
    // No events yet — just verify shape.
    const res = await app.inject({
      method: 'GET',
      url: `/api/events?from=${Date.now()}&to=${Date.now() + 86400000}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ events: [] })
    await app.close()
  })

  it("an event on a calendar owned by a person takes that person's color and name", async () => {
    const app = await buildApp({ dataDir: dir })
    app.db
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
         VALUES ('cal1', 'acc1', 'gcal1', 'Mom', '#ff0000', 1)`,
      )
      .run()
    app.db
      .prepare(
        `INSERT INTO people (id, name, color, primary_calendar_id)
         VALUES ('p1', 'Mom', '#ff7eb6', 'cal1')`,
      )
      .run()
    const now = Date.now()
    app.db
      .prepare(
        `INSERT INTO events_cache
           (id, calendar_id, google_event_id, etag, start, end, all_day, title, location, description, color, last_synced_at, deleted_at)
         VALUES ('ev1', 'cal1', 'gev1', 'etag1', ?, ?, 0, 'Dentist', NULL, NULL, '#0000ff', ?, NULL)`,
      )
      .run(now + 1000, now + 2000, now)

    const res = await app.inject({
      method: 'GET',
      url: `/api/events?from=${now}&to=${now + 86400000}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      events: Array<{ color: string | null; personName: string | null }>
    }
    expect(body.events).toHaveLength(1)
    expect(body.events[0]?.color).toBe('#ff7eb6')
    expect(body.events[0]?.personName).toBe('Mom')
    await app.close()
  })

  it('an event with no matching person has personName null and falls back to calendar/event color', async () => {
    const app = await buildApp({ dataDir: dir })
    app.db
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
         VALUES ('cal2', 'acc1', 'gcal2', 'Shared', NULL, 1)`,
      )
      .run()
    const now = Date.now()
    app.db
      .prepare(
        `INSERT INTO events_cache
           (id, calendar_id, google_event_id, etag, start, end, all_day, title, location, description, color, last_synced_at, deleted_at)
         VALUES ('ev2', 'cal2', 'gev2', 'etag2', ?, ?, 0, 'Recital', NULL, NULL, '#00ff00', ?, NULL)`,
      )
      .run(now + 1000, now + 2000, now)

    const res = await app.inject({
      method: 'GET',
      url: `/api/events?from=${now}&to=${now + 86400000}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      events: Array<{ color: string | null; personName: string | null }>
    }
    expect(body.events).toHaveLength(1)
    expect(body.events[0]?.color).toBe('#00ff00')
    expect(body.events[0]?.personName).toBeNull()
    await app.close()
  })

  it('two people mapped to the same calendar still yield exactly one row, from the lowest id', async () => {
    const app = await buildApp({ dataDir: dir })
    app.db
      .prepare(
        `INSERT INTO calendars (id, account_id, google_calendar_id, summary, color_override, visible)
         VALUES ('cal3', 'acc1', 'gcal3', 'Family', NULL, 1)`,
      )
      .run()
    // Inserted out of id order to prove the tie-break is by id, not insertion order.
    app.db
      .prepare(
        `INSERT INTO people (id, name, color, primary_calendar_id)
         VALUES ('p2', 'Dad', '#5b6cff', 'cal3')`,
      )
      .run()
    app.db
      .prepare(
        `INSERT INTO people (id, name, color, primary_calendar_id)
         VALUES ('p1', 'Mom', '#ff7eb6', 'cal3')`,
      )
      .run()
    const now = Date.now()
    app.db
      .prepare(
        `INSERT INTO events_cache
           (id, calendar_id, google_event_id, etag, start, end, all_day, title, location, description, color, last_synced_at, deleted_at)
         VALUES ('ev3', 'cal3', 'gev3', 'etag3', ?, ?, 0, 'Family dinner', NULL, NULL, NULL, ?, NULL)`,
      )
      .run(now + 1000, now + 2000, now)

    const res = await app.inject({
      method: 'GET',
      url: `/api/events?from=${now}&to=${now + 86400000}`,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      events: Array<{ color: string | null; personName: string | null }>
    }
    expect(body.events).toHaveLength(1)
    expect(body.events[0]?.color).toBe('#ff7eb6')
    expect(body.events[0]?.personName).toBe('Mom')
    await app.close()
  })
})
