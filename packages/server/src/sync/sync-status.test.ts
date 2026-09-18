import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { loadSyncStatus, writeSyncStatus } from './sync-status'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sync-status-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('sync-status', () => {
  it('loadSyncStatus defaults to never-synced when nothing has been written', () => {
    const { db, close } = openDatabase(dir)
    expect(loadSyncStatus(db.raw)).toEqual({ lastSyncAt: null, lastError: null })
    close()
  })

  it('writeSyncStatus persists a patch and loadSyncStatus reads it back', () => {
    const { db, close } = openDatabase(dir)
    writeSyncStatus(db.raw, { lastSyncAt: 1000, lastError: null })
    expect(loadSyncStatus(db.raw)).toEqual({ lastSyncAt: 1000, lastError: null })
    close()
  })

  it('merges a patch onto the existing record instead of replacing it', () => {
    const { db, close } = openDatabase(dir)
    writeSyncStatus(db.raw, { lastSyncAt: 1000, lastError: null })
    // A failed tick keeps the previous lastSyncAt and only sets lastError.
    writeSyncStatus(db.raw, { lastError: 'boom' })
    expect(loadSyncStatus(db.raw)).toEqual({ lastSyncAt: 1000, lastError: 'boom' })
    close()
  })

  it('a later successful tick clears lastError and bumps lastSyncAt', () => {
    const { db, close } = openDatabase(dir)
    writeSyncStatus(db.raw, { lastError: 'boom' })
    writeSyncStatus(db.raw, { lastSyncAt: 2000, lastError: null })
    expect(loadSyncStatus(db.raw)).toEqual({ lastSyncAt: 2000, lastError: null })
    close()
  })

  it('writeSyncStatus overwrites on repeated calls (ON CONFLICT upsert)', () => {
    const { db, close } = openDatabase(dir)
    writeSyncStatus(db.raw, { lastSyncAt: 1 })
    writeSyncStatus(db.raw, { lastSyncAt: 2 })
    const rows = db.all<{ key: string }>("SELECT key FROM kv WHERE key='syncStatus'")
    expect(rows).toHaveLength(1)
    close()
  })
})
