import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { createStateStore } from './state-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'state-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('state-store', () => {
  it('returns null for missing instance', () => {
    const { db, close } = openDatabase(dir)
    const store = createStateStore(db.raw)
    expect(store.get('absent')).toBeNull()
    close()
  })

  it('put creates then increments version', () => {
    const { db, close } = openDatabase(dir)
    const store = createStateStore(db.raw)
    const a = store.put('i1', 'chores', { items: [] }, null)
    expect(a.version).toBe(1)
    const b = store.put('i1', 'chores', { items: ['a'] }, 1)
    expect(b.version).toBe(2)
    expect(store.get('i1')?.data).toEqual({ items: ['a'] })
    close()
  })

  it('rejects stale put', () => {
    const { db, close } = openDatabase(dir)
    const store = createStateStore(db.raw)
    store.put('i1', 'chores', { v: 0 }, null)
    expect(() => store.put('i1', 'chores', { v: 1 }, 0)).toThrow(/conflict/)
    close()
  })
})
