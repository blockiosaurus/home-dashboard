import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'

describe('scenes routes', () => {
  it('GET /api/scenes returns seeded default scene on fresh db', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    const res = await app.inject({ method: 'GET', url: '/api/scenes' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { scenes: Array<{ name: string; isDefault: boolean }> }
    expect(body.scenes).toHaveLength(1)
    expect(body.scenes[0]?.name).toBe('Active')
    expect(body.scenes[0]?.isDefault).toBe(true)
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
})
