import type { ServerMessage } from '@dashboard/core'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'

const scenePayload = {
  id: 'default',
  name: 'Active',
  isDefault: true,
  cells: [
    {
      instanceId: 'weather-new',
      widgetId: 'weather',
      x: 0,
      y: 0,
      w: 3,
      h: 2,
      config: { unit: 'fahrenheit' },
    },
  ],
}

describe('scenes routes', () => {
  it('GET /api/scenes returns seeded default scene on fresh db', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    const res = await app.inject({ method: 'GET', url: '/api/scenes' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { scenes: Array<{ name: string; isDefault: boolean }> }
    expect(body.scenes).toHaveLength(2)
    const activeScene = body.scenes.find((s) => s.name === 'Active')
    expect(activeScene?.name).toBe('Active')
    expect(activeScene?.isDefault).toBe(true)
    await app.close()
  })

  it('POST /api/scenes creates and GET returns it', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    const scene = {
      id: 's1',
      name: 'Active',
      isDefault: true,
      cells: [],
    }
    const create = await app.inject({ method: 'POST', url: '/api/scenes', payload: scene })
    expect(create.statusCode).toBe(201)
    const list = await app.inject({ method: 'GET', url: '/api/scenes' })
    expect((list.json() as { scenes: Array<{ name: string }> }).scenes[0]?.name).toBe('Active')
    await app.close()
  })

  it('POST /api/scenes rebuilds the widget runtime so a newly added widget gets data', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    // A weather widget with no location publishes without touching the network,
    // which makes it a safe probe for "did a backend start for this instance?".
    const scene = {
      id: 'default',
      name: 'Active',
      isDefault: true,
      cells: [
        {
          instanceId: 'weather-new',
          widgetId: 'weather',
          x: 0,
          y: 0,
          w: 3,
          h: 2,
          config: { unit: 'fahrenheit' },
        },
      ],
    }
    expect(app.widgetRuntime.cache.get('weather-new')).toBeUndefined()

    const create = await app.inject({ method: 'POST', url: '/api/scenes', payload: scene })
    expect(create.statusCode).toBe(201)
    await new Promise((r) => setTimeout(r, 20))

    expect(app.widgetRuntime.cache.get('weather-new')).toEqual({ error: 'no-location' })
    await app.close()
  })

  it('still saves and notifies the kiosk when the system record is malformed', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    // collectInstances reads the system record for the weather default; a
    // corrupt row must not turn a successful save into a 500.
    app.db
      .prepare(
        `INSERT INTO kv (key, value) VALUES ('system', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run('not json at all')
    const seen: ServerMessage[] = []
    app.broker.subscribe((m) => seen.push(m))

    const res = await app.inject({ method: 'POST', url: '/api/scenes', payload: scenePayload })

    expect(res.statusCode).toBe(201)
    expect(seen).toContainEqual({ type: 'scene:updated', sceneId: 'default' })
    await app.close()
  })

  it('POST /api/scenes clears is_default on other scenes when the incoming scene is default', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    const list = await app.inject({ method: 'GET', url: '/api/scenes' })
    const scenes = (
      list.json() as {
        scenes: Array<{ id: string; name: string; isDefault: boolean; cells: unknown[] }>
      }
    ).scenes
    const original = scenes.find((s) => s.isDefault)
    const other = scenes.find((s) => !s.isDefault)
    expect(original).toBeDefined()
    expect(other).toBeDefined()

    const res = await app.inject({
      method: 'POST',
      url: '/api/scenes',
      payload: { id: other?.id, name: other?.name, isDefault: true, cells: other?.cells },
    })
    expect(res.statusCode).toBe(201)
    expect((res.json() as { isDefault: boolean }).isDefault).toBe(true)

    const list2 = await app.inject({ method: 'GET', url: '/api/scenes' })
    const scenes2 = (list2.json() as { scenes: Array<{ id: string; isDefault: boolean }> }).scenes
    expect(scenes2.find((s) => s.id === other?.id)?.isDefault).toBe(true)
    expect(scenes2.find((s) => s.id === original?.id)?.isDefault).toBe(false)
    expect(scenes2.filter((s) => s.isDefault)).toHaveLength(1)
    await app.close()
  })

  it('POST /api/scenes refuses to un-default the only default scene', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    const list = await app.inject({ method: 'GET', url: '/api/scenes' })
    const scenes = (
      list.json() as {
        scenes: Array<{ id: string; name: string; isDefault: boolean; cells: unknown[] }>
      }
    ).scenes
    const def = scenes.find((s) => s.isDefault)
    expect(def).toBeDefined()

    const res = await app.inject({
      method: 'POST',
      url: '/api/scenes',
      payload: { id: def?.id, name: def?.name, isDefault: false, cells: def?.cells },
    })
    expect(res.statusCode).toBe(201)
    // The server keeps the only default scene default and reports that back,
    // rather than silently ignoring the request or leaving no default at all.
    expect((res.json() as { isDefault: boolean }).isDefault).toBe(true)

    const list2 = await app.inject({ method: 'GET', url: '/api/scenes' })
    const scenes2 = (list2.json() as { scenes: Array<{ id: string; isDefault: boolean }> }).scenes
    expect(scenes2.filter((s) => s.isDefault)).toHaveLength(1)
    expect(scenes2.find((s) => s.id === def?.id)?.isDefault).toBe(true)
    await app.close()
  })

  it('still saves and notifies the kiosk when the runtime reload throws', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    app.widgetRuntime.reload = () => {
      throw new Error('reload exploded')
    }
    const seen: ServerMessage[] = []
    app.broker.subscribe((m) => seen.push(m))

    const res = await app.inject({ method: 'POST', url: '/api/scenes', payload: scenePayload })

    expect(res.statusCode).toBe(201)
    expect(seen).toContainEqual({ type: 'scene:updated', sceneId: 'default' })
    await app.close()
  })
})
