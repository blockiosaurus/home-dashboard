import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export type OutboxOp = 'create' | 'update' | 'delete'

export interface OutboxPayload {
  calendarId: string
  eventId?: string
  etag?: string
  body?: Record<string, unknown>
}

export type SendResult = 'ok' | 'conflict' | 'retry'

export interface OutboxOptions {
  send: (op: OutboxOp, payload: OutboxPayload) => Promise<SendResult>
  now: () => number
  maxBackoffMs?: number
}

export interface OutboxRow {
  id: string
  op: OutboxOp
  payload_json: string
  attempts: number
  next_attempt_at: number
}

export interface Outbox {
  enqueue: (e: { op: OutboxOp; payload: OutboxPayload }) => string
  processOnce: () => Promise<void>
  pendingCount: () => number
}

const backoff = (attempts: number, maxMs: number) => Math.min(2 ** attempts * 1000, maxMs)

export const createOutbox = (db: Database.Database, opts: OutboxOptions): Outbox => {
  const maxBackoff = opts.maxBackoffMs ?? 5 * 60_000

  const insert = db.prepare(`
    INSERT INTO events_outbox (id, op, payload_json, attempts, next_attempt_at, created_at)
    VALUES (@id, @op, @payloadJson, 0, @now, @now)
  `)
  const pickReady = db.prepare(`
    SELECT id, op, payload_json, attempts, next_attempt_at FROM events_outbox
    WHERE completed_at IS NULL AND next_attempt_at <= ? ORDER BY created_at ASC
  `)
  const updateRetry = db.prepare(`
    UPDATE events_outbox SET attempts = attempts + 1, next_attempt_at = ?, last_error = ? WHERE id = ?
  `)
  const markDone = db.prepare(`
    UPDATE events_outbox SET completed_at = ?, last_error = NULL WHERE id = ?
  `)
  const markFailed = db.prepare(`
    UPDATE events_outbox SET completed_at = ?, last_error = ? WHERE id = ?
  `)
  const countPending = db.prepare(
    'SELECT COUNT(*) AS n FROM events_outbox WHERE completed_at IS NULL',
  )

  return {
    enqueue: ({ op, payload }) => {
      const id = randomUUID()
      insert.run({
        id,
        op,
        payloadJson: JSON.stringify(payload),
        now: opts.now(),
      })
      return id
    },
    processOnce: async () => {
      const rows = pickReady.all(opts.now()) as OutboxRow[]
      for (const row of rows) {
        const payload = JSON.parse(row.payload_json) as OutboxPayload
        let result: SendResult
        try {
          result = await opts.send(row.op, payload)
        } catch (err) {
          result = 'retry'
          updateRetry.run(opts.now() + backoff(row.attempts + 1, maxBackoff), String(err), row.id)
          continue
        }
        if (result === 'ok') {
          markDone.run(opts.now(), row.id)
        } else if (result === 'conflict') {
          markFailed.run(opts.now(), 'conflict', row.id)
        } else {
          updateRetry.run(opts.now() + backoff(row.attempts + 1, maxBackoff), 'retry', row.id)
        }
      }
    },
    pendingCount: () => (countPending.get() as { n: number }).n,
  }
}
