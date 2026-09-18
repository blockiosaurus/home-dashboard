import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

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
})
