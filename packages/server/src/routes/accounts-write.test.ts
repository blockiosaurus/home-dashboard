import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../app'
import { createEncryptor, deriveKey } from '../auth/encryption'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))
afterEach(() => fetchMock.mockReset())

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'aw-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('accounts-write', () => {
  it('DELETE revokes token and removes row', async () => {
    const app = await buildApp({ dataDir: dir })
    app.db.prepare("INSERT INTO kv (key, value) VALUES ('salt', 'S')").run()
    const key = await deriveKey('dev-machine', 'S')
    const enc = await createEncryptor(key)
    app.db
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('a1', 'google', '', ?, 'calendar', ?)`,
      )
      .run(enc.encrypt('rt-secret'), Date.now())

    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    const res = await app.inject({ method: 'DELETE', url: '/api/accounts/a1' })
    expect(res.statusCode).toBe(204)
    expect(fetchMock).toHaveBeenCalled()
    const row = app.db.prepare('SELECT id FROM accounts WHERE id = ?').get('a1')
    expect(row).toBeUndefined()
    await app.close()
  })

  it('DELETE returns 404 for unknown account', async () => {
    const app = await buildApp({ dataDir: dir })
    const res = await app.inject({ method: 'DELETE', url: '/api/accounts/missing' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })
})
