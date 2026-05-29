import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'people-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('people routes', () => {
  it('GET returns empty list initially', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'GET', url: '/api/people' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ people: [] })
    await app.close()
  })

  it('PUT creates then DELETE removes', async () => {
    const app = await buildApp({ dataDir: dir })
    const put = await app.inject({
      method: 'PUT',
      url: '/api/people/p1',
      payload: { name: 'Mom', color: '#ff7eb6' },
    })
    expect(put.statusCode).toBe(200)
    const list = await app.inject({ method: 'GET', url: '/api/people' })
    expect((list.json() as { people: Array<{ name: string }> }).people[0]?.name).toBe('Mom')
    const del = await app.inject({ method: 'DELETE', url: '/api/people/p1' })
    expect(del.statusCode).toBe(204)
    const after = await app.inject({ method: 'GET', url: '/api/people' })
    expect((after.json() as { people: unknown[] }).people).toHaveLength(0)
    await app.close()
  })
})
