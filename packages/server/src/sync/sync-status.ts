import type Database from 'better-sqlite3'

export interface SyncStatus {
  lastSyncAt: number | null
  lastError: string | null
}

const defaultStatus: SyncStatus = { lastSyncAt: null, lastError: null }

/** Reads the `syncStatus` record from `kv`, defaulting to "never synced" when
 * absent (a fresh install, or before the first tick has run). */
export const loadSyncStatus = (db: Database.Database): SyncStatus => {
  const row = db.prepare("SELECT value FROM kv WHERE key='syncStatus'").get() as
    | { value: string }
    | undefined
  if (!row) return defaultStatus
  try {
    return { ...defaultStatus, ...JSON.parse(row.value) }
  } catch {
    return defaultStatus
  }
}

/** Merges `patch` onto the current `syncStatus` record and persists it. Used
 * per account tick: a successful sync sets `lastSyncAt` to now and clears
 * `lastError`; a failed one keeps the previous `lastSyncAt` and records the
 * error message — callers pass only the fields that changed. */
export const writeSyncStatus = (db: Database.Database, patch: Partial<SyncStatus>): SyncStatus => {
  const current = loadSyncStatus(db)
  const next: SyncStatus = { ...current, ...patch }
  db.prepare(
    `INSERT INTO kv (key, value) VALUES ('syncStatus', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(next))
  return next
}
