import type Database from 'better-sqlite3'

const reconnectKey = (accountId: string) => `account_needs_reconnect:${accountId}`

/** Set when Google rejects an account's refresh token. The account is kept
 * (with its calendars and settings) so the problem is visible and a
 * reconnect can take its place; the sync loop skips it until then. */
export const markNeedsReconnect = (db: Database.Database, accountId: string) => {
  db.prepare(
    "INSERT INTO kv (key, value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(reconnectKey(accountId))
}

export const clearNeedsReconnect = (db: Database.Database, accountId: string) => {
  db.prepare('DELETE FROM kv WHERE key = ?').run(reconnectKey(accountId))
}

export const needsReconnect = (db: Database.Database, accountId: string): boolean =>
  db.prepare('SELECT 1 FROM kv WHERE key = ?').get(reconnectKey(accountId)) !== undefined

/** Removes an account (or an orphaned calendar group left by one) together
 * with its calendars, cached events and kv bookkeeping. */
export const removeAccountData = (db: Database.Database, accountId: string) => {
  db.transaction(() => {
    db.prepare(
      `DELETE FROM kv WHERE key IN (
         SELECT 'calendar_full_sync_at:' || id FROM calendars WHERE account_id = ?)`,
    ).run(accountId)
    db.prepare(
      'DELETE FROM events_cache WHERE calendar_id IN (SELECT id FROM calendars WHERE account_id = ?)',
    ).run(accountId)
    db.prepare('DELETE FROM calendars WHERE account_id = ?').run(accountId)
    db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId)
    clearNeedsReconnect(db, accountId)
  })()
}

/** Orphaned calendar groups (account row gone, as an older build did on an
 * expired token) can't be matched by email. Pick the group that contains
 * this account's primary calendar and whose calendars this account can most
 * fully see. Shared calendars mean another person's group may contain the
 * email too, but it also holds calendars this account can't see. A tie is
 * ambiguous, so nothing is adopted. */
const findOrphanGroup = (
  db: Database.Database,
  email: string,
  remoteIds: string[],
): string | null => {
  const rows = db
    .prepare(
      `SELECT account_id, google_calendar_id FROM calendars
       WHERE account_id NOT IN (SELECT id FROM accounts)`,
    )
    .all() as Array<{ account_id: string; google_calendar_id: string }>
  const groups = new Map<string, string[]>()
  for (const r of rows)
    groups.set(r.account_id, [...(groups.get(r.account_id) ?? []), r.google_calendar_id])
  const remote = new Set(remoteIds)
  const scored = [...groups]
    .filter(([, ids]) => ids.includes(email))
    .map(([id, ids]) => ({ id, score: ids.filter((g) => remote.has(g)).length / ids.length }))
    .sort((a, b) => b.score - a.score)
  const [best, next] = scored
  if (!best || (next && next.score === best.score)) return null
  return best.id
}

/** When `accountId` is a reconnect of an account we already had (same email,
 * or an orphaned group from one), carry the old calendars' visibility,
 * colors and people links over to the new rows, then remove the old data so
 * its stale events don't show alongside the fresh ones. Returns the ids of
 * the accounts / groups it replaced. */
export const adoptPredecessors = (
  db: Database.Database,
  accountId: string,
  email: string,
  remoteIds: string[],
): string[] => {
  const predecessors = (
    db
      .prepare('SELECT id FROM accounts WHERE email = ? AND id != ?')
      .all(email, accountId) as Array<{
      id: string
    }>
  ).map((r) => r.id)
  const orphan = findOrphanGroup(db, email, remoteIds)
  if (orphan) predecessors.push(orphan)

  for (const oldId of predecessors) {
    db.transaction(() => {
      const oldCals = db
        .prepare(
          'SELECT id, google_calendar_id, visible, color_override FROM calendars WHERE account_id = ?',
        )
        .all(oldId) as Array<{
        id: string
        google_calendar_id: string
        visible: number
        color_override: string | null
      }>
      for (const c of oldCals) {
        const newCalId = `${accountId}::${c.google_calendar_id}`
        const moved = db
          .prepare('UPDATE calendars SET visible = ?, color_override = ? WHERE id = ?')
          .run(c.visible, c.color_override, newCalId)
        if (moved.changes > 0) {
          db.prepare('UPDATE people SET primary_calendar_id = ? WHERE primary_calendar_id = ?').run(
            newCalId,
            c.id,
          )
        }
      }
      removeAccountData(db, oldId)
    })()
  }
  return predecessors
}
