import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../db'
import { createOutbox } from './outbox'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'outbox-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('outbox', () => {
  it('runs writes in FIFO order and marks completed', async () => {
    const { db, close } = openDatabase(dir)
    const send = vi.fn(async () => 'ok' as const)
    const outbox = createOutbox(db.raw, { send, now: () => 1000 })
    outbox.enqueue({ op: 'create', payload: { calendarId: 'c1', body: { summary: 'a' } } })
    outbox.enqueue({ op: 'create', payload: { calendarId: 'c1', body: { summary: 'b' } } })
    await outbox.processOnce()
    expect(send).toHaveBeenCalledTimes(2)
    const remaining = db.all('SELECT * FROM events_outbox WHERE completed_at IS NULL')
    expect(remaining).toHaveLength(0)
    close()
  })

  it('retries with backoff on transient failure', async () => {
    const { db, close } = openDatabase(dir)
    const send = vi.fn(async () => 'retry' as const)
    const outbox = createOutbox(db.raw, { send, now: () => 1000 })
    outbox.enqueue({ op: 'create', payload: { calendarId: 'c1', body: { summary: 'a' } } })
    await outbox.processOnce()
    const row = db.get<{ attempts: number; next_attempt_at: number }>(
      'SELECT attempts, next_attempt_at FROM events_outbox',
    )
    expect(row?.attempts).toBe(1)
    expect(row?.next_attempt_at).toBeGreaterThan(1000)
    close()
  })

  it('on conflict marks the row failed and continues', async () => {
    const { db, close } = openDatabase(dir)
    const send = vi.fn(async () => 'conflict' as const)
    const outbox = createOutbox(db.raw, { send, now: () => 1000 })
    outbox.enqueue({ op: 'create', payload: { calendarId: 'c1', body: { summary: 'a' } } })
    await outbox.processOnce()
    const row = db.get<{ last_error: string; completed_at: number }>(
      'SELECT last_error, completed_at FROM events_outbox',
    )
    expect(row?.last_error).toContain('conflict')
    expect(row?.completed_at).toBe(1000)
    close()
  })
})
