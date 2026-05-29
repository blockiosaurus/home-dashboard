import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'

describe('events routes', () => {
  it('GET /api/events returns events within window', async () => {
    const app = await buildApp({ dataDir: `/tmp/events-${Date.now()}` })
    // No events yet — just verify shape.
    const res = await app.inject({
      method: 'GET',
      url: `/api/events?from=${Date.now()}&to=${Date.now() + 86400000}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ events: [] })
    await app.close()
  })
})
