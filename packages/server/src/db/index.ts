import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import * as schema from './schema'

export interface DatabaseHandle {
  db: {
    drizzle: ReturnType<typeof drizzle<typeof schema>>
    all: <T = unknown>(sql: string) => T[]
    get: <T = unknown>(sql: string) => T | undefined
    raw: Database.Database
  }
  close: () => void
  path: string
}

export const openDatabase = (dataDir: string): DatabaseHandle => {
  mkdirSync(dataDir, { recursive: true })
  const path = join(dataDir, 'dashboard.db')
  const raw = new Database(path)
  raw.pragma('journal_mode = WAL')
  raw.pragma('busy_timeout = 5000')
  raw.pragma('foreign_keys = ON')

  const d = drizzle(raw, { schema })
  migrate(d, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname })

  return {
    db: {
      drizzle: d,
      all: (sql) => raw.prepare(sql).all() as never,
      get: (sql) => raw.prepare(sql).get() as never,
      raw,
    },
    close: () => raw.close(),
    path,
  }
}
