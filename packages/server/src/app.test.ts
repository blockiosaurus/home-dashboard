import { describe, expect, it } from 'vitest'
import { buildApp } from './app'

describe('app', () => {
  it('GET /api/health returns ok', async () => {
    const app = await buildApp({ dataDir: ':memory-test:' })
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
    await app.close()
  })
})
