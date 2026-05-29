import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ws-routes-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('widget state routes', () => {
  it('GET returns 404 when absent', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/widgets/x/state' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('PUT creates then GET returns it', async () => {
    const app = await buildApp({ dataDir: dir })
    const put = await app.inject({
      method: 'PUT',
      url: '/api/widgets/x/state',
      payload: { widgetId: 'chores', data: { items: ['dishes'] } },
    })
    expect(put.statusCode).toBe(200)
    expect(put.json()).toMatchObject({ version: 1 })
    const get = await app.inject({ method: 'GET', url: '/api/widgets/x/state' })
    expect(get.statusCode).toBe(200)
    expect(get.json()).toMatchObject({
      instanceId: 'x',
      widgetId: 'chores',
      version: 1,
      data: { items: ['dishes'] },
    })
    await app.close()
  })

  it('PUT with stale version returns 409', async () => {
    const app = await buildApp({ dataDir: dir })
    await app.inject({
      method: 'PUT',
      url: '/api/widgets/x/state',
      payload: { widgetId: 'chores', data: {} },
    })
    const stale = await app.inject({
      method: 'PUT',
      url: '/api/widgets/x/state',
      payload: { widgetId: 'chores', data: {}, expectedVersion: 0 },
    })
    expect(stale.statusCode).toBe(409)
    await app.close()
  })
})
