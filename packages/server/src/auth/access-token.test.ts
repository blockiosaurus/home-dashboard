import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db'
import { createAccessTokenProvider } from './access-token'
import { createEncryptor, deriveKey } from './encryption'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'at-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('createAccessTokenProvider', () => {
  it('returns null when no account exists', async () => {
    const { db, close } = openDatabase(dir)
    const provider = createAccessTokenProvider({
      db: db.raw,
      machineId: 'm',
      refresh: vi.fn(),
    })
    expect(await provider()).toBeNull()
    close()
  })

  it('decrypts refresh token and returns fresh access token', async () => {
    const { db, close } = openDatabase(dir)
    db.raw.prepare("INSERT INTO kv (key, value) VALUES ('salt', 'S')").run()
    const key = await deriveKey('m', 'S')
    const enc = await createEncryptor(key)
    const encrypted = enc.encrypt('rt-secret')
    db.raw
      .prepare(
        `INSERT INTO accounts (id, provider, email, refresh_token_encrypted, scopes, created_at)
         VALUES ('a1', 'google', '', ?, 'calendar', ?)`,
      )
      .run(encrypted, Date.now())

    const refresh = vi.fn(async (rt: string) => {
      expect(rt).toBe('rt-secret')
      return { accessToken: 'AT', expiresAt: Date.now() + 60_000 }
    })
    const provider = createAccessTokenProvider({ db: db.raw, machineId: 'm', refresh })
    expect(await provider()).toBe('AT')
    close()
  })
})
