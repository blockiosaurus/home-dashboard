import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerMessage } from '@dashboard/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import type { WeatherInput } from '../sync/weather-client'

/** Widget backends run off timers, so the effect of a route call lands a tick
 * or two later — poll briefly rather than sleeping a fixed amount. */
const waitFor = async (predicate: () => boolean, timeoutMs = 2000) => {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition')
    await new Promise((r) => setTimeout(r, 10))
  }
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'system-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('system routes', () => {
  it('GET returns defaults', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/system' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ firstRunComplete: false })
    await app.close()
  })

  it('PUT updates partial fields', async () => {
    const app = await buildApp({ dataDir: dir })
    await app.inject({
      method: 'PUT',
      url: '/api/system',
      payload: { firstRunComplete: true, manualScene: 'sleep' },
    })
    const res = await app.inject({ method: 'GET', url: '/api/system' })
    expect(res.json()).toMatchObject({ firstRunComplete: true, manualScene: 'sleep' })
    await app.close()
  })

  it('GET reports googleConfigured: false when no Google credentials are set', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/system' })
    expect(res.json()).toMatchObject({ googleConfigured: false })
    await app.close()
  })

  it('GET reports googleConfigured: true when both Google credentials are set', async () => {
    const app = await buildApp({
      dataDir: dir,
      googleClientId: 'client-id',
      googleClientSecret: 'client-secret',
    })
    const res = await app.inject({ method: 'GET', url: '/api/system' })
    expect(res.json()).toMatchObject({ googleConfigured: true })
    await app.close()
  })

  it('PUT ignores a client-supplied googleConfigured value', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({
      method: 'PUT',
      url: '/api/system',
      payload: { firstRunComplete: true, googleConfigured: true },
    })
    expect(res.json()).toMatchObject({ googleConfigured: false })
    await app.close()
  })

  it('PUT with weatherDefault mutates the seeded weather-1 cell in the default scene', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({
      method: 'PUT',
      url: '/api/system',
      payload: {
        weatherDefault: { lat: 51.5074, lon: -0.1278, unit: 'celsius', label: 'London, England' },
      },
    })
    expect(res.statusCode).toBe(200)

    const scenes = await app.inject({ method: 'GET', url: '/api/scenes' })
    const body = scenes.json() as {
      scenes: Array<{
        id: string
        isDefault: boolean
        cells: Array<{ instanceId: string; widgetId: string; config: Record<string, unknown> }>
      }>
    }
    const defaultScene = body.scenes.find((s) => s.isDefault)
    const weatherCell = defaultScene?.cells.find((c) => c.instanceId === 'weather-1')
    expect(weatherCell?.config).toMatchObject({
      lat: 51.5074,
      lon: -0.1278,
      unit: 'celsius',
      label: 'London, England',
    })
    await app.close()
  })

  it('PUT with weatherDefault restarts the weather backend on the new location', async () => {
    // Record what the (stubbed) open-meteo client is asked for, so we can see
    // whether the *running* backend picked up the new coordinates — rewriting
    // the scene cells alone would leave it fetching the seeded location.
    const calls: WeatherInput[] = []
    const app = await buildApp({
      dataDir: dir,
      fetchWeather: async (input) => {
        calls.push(input)
        return { current: { temperature: 12, weatherCode: 0, isDay: true, windSpeed: 3 } }
      },
    })

    // The runtime fires each backend once at startup; wait for that seeded
    // call so the post-PUT call below can't be confused with it.
    await waitFor(() => calls.length > 0)
    const seeded = calls.length

    const res = await app.inject({
      method: 'PUT',
      url: '/api/system',
      payload: {
        weatherDefault: { lat: 51.5074, lon: -0.1278, unit: 'celsius', label: 'London, England' },
      },
    })
    expect(res.statusCode).toBe(200)

    await waitFor(() => calls.length > seeded)
    expect(calls.at(-1)).toMatchObject({ lat: 51.5074, lon: -0.1278, unit: 'celsius' })

    await waitFor(() => app.widgetRuntime.cache.get('weather-1') !== undefined)
    expect(app.widgetRuntime.cache.get('weather-1')).toMatchObject({
      current: { temperature: 12 },
    })
    await app.close()
  })

  it('GET includes adminUrls as a non-empty array of admin URLs', async () => {
    const app = await buildApp({ dataDir: dir, port: 4100 })
    const res = await app.inject({ method: 'GET', url: '/api/system' })
    const body = res.json() as { adminUrls: string[] }
    expect(Array.isArray(body.adminUrls)).toBe(true)
    expect(body.adminUrls.length).toBeGreaterThan(0)
    for (const url of body.adminUrls) {
      expect(url).toMatch(/^http:\/\/.+:4100\/admin\/$/)
    }
    await app.close()
  })

  it('GET loads a stored record that still has the removed photosAlbumId field', async () => {
    const app = await buildApp({ dataDir: dir })
    app.db
      .prepare(
        `INSERT INTO kv (key, value) VALUES ('system', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(JSON.stringify({ firstRunComplete: true, photosAlbumId: 'legacy-album-id' }))

    const res = await app.inject({ method: 'GET', url: '/api/system' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ firstRunComplete: true })
    expect(res.json()).not.toHaveProperty('photosAlbumId')
    await app.close()
  })

  it('PUT publishes system:updated on the broker after saving', async () => {
    const app = await buildApp({ dataDir: dir })
    const received: ServerMessage[] = []
    const unsub = app.broker.subscribe((m) => received.push(m))

    await app.inject({
      method: 'PUT',
      url: '/api/system',
      payload: { firstRunComplete: true },
    })

    expect(received).toContainEqual({ type: 'system:updated' })
    unsub()
    await app.close()
  })
})
