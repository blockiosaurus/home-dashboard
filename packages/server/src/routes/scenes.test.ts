import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'

describe('scenes routes', () => {
  it('GET /api/scenes returns empty array on fresh db', async () => {
    const app = await buildApp({ dataDir: `/tmp/scenes-${Date.now()}` })
    const res = await app.inject({ method: 'GET', url: '/api/scenes' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ scenes: [] })
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
