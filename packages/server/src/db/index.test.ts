import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from './index'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-test-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('openDatabase', () => {
  it('creates the sqlite file and runs migrations', () => {
    const { db, close, path } = openDatabase(dir)
    expect(path).toBe(join(dir, 'dashboard.db'))
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    const names = tables.map((t) => t.name)
    expect(names).toContain('accounts')
    expect(names).toContain('scenes')
    close()
  })

  it('enables WAL mode', () => {
    const { db, close } = openDatabase(dir)
    const mode = db.get<{ journal_mode: string }>('PRAGMA journal_mode')
    expect(mode?.journal_mode).toBe('wal')
    close()
  })
})
