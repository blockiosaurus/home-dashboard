import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { markNeedsReconnect } from '../sync/account-repo'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'acc-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('GET /api/accounts', () => {
  it('reports which accounts need reconnecting', async () => {
    const app = await buildApp({ dataDir: dir })
    const add = app.db.prepare(
      `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
       VALUES (?, 'google', ?, 'x', 'calendar', ?)`,
    )
    add.run('a1', 'one@x.com', 1)
    add.run('a2', 'two@x.com', 2)
    markNeedsReconnect(app.db, 'a2')

    const res = await app.inject({ method: 'GET', url: '/api/accounts' })
    expect(
      res
        .json()
        .accounts.map((a: { id: string; needsReconnect: boolean }) => [a.id, a.needsReconnect]),
    ).toEqual([
      ['a1', false],
      ['a2', true],
    ])
    await app.close()
  })
})
