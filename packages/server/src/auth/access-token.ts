import type Database from 'better-sqlite3'
import { createEncryptor, deriveKey } from './encryption'
import { createTokenCache } from './token-cache'

export interface ProviderArgs {
  db: Database.Database
  machineId: string
  refresh: (rt: string) => Promise<{ accessToken: string; expiresAt: number }>
}

export const createAccessTokenProvider = (args: ProviderArgs): (() => Promise<string | null>) => {
  const cache = createTokenCache(args.refresh)
  return async () => {
    const acc = args.db
      .prepare('SELECT refresh_token_encrypted FROM accounts ORDER BY created_at ASC LIMIT 1')
      .get() as { refresh_token_encrypted: string } | undefined
    if (!acc) return null
    const saltRow = args.db.prepare("SELECT value FROM kv WHERE key='salt'").get() as
      | { value: string }
      | undefined
    if (!saltRow) return null
    const key = await deriveKey(args.machineId, saltRow.value)
    const enc = await createEncryptor(key)
    const refreshToken = enc.decrypt(acc.refresh_token_encrypted)
    return cache.get(refreshToken)
  }
}
