import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sched-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('scene-schedule routes', () => {
  it('PUT inserts, GET returns, DELETE removes', async () => {
    const app = await buildApp({ dataDir: dir })
    const put = await app.inject({
      method: 'PUT',
      url: '/api/scene-schedule/r1',
      payload: { sceneId: 'default', cronExpr: '0 22 * * *', priority: 10 },
    })
    expect(put.statusCode).toBe(200)
    const list = await app.inject({ method: 'GET', url: '/api/scene-schedule' })
    const rules = (list.json() as { rules: unknown[] }).rules
    expect(rules).toHaveLength(3)
    const del = await app.inject({ method: 'DELETE', url: '/api/scene-schedule/r1' })
    expect(del.statusCode).toBe(204)
    await app.close()
  })
})
