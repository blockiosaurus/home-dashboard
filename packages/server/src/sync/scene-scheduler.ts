import { parseExpression } from 'cron-parser'
import type Database from 'better-sqlite3'
import type { Broker } from '../ws/broker'
import { createScheduler } from '../scheduler'

export interface ScheduleRule {
  id: string
  sceneId: string
  cronExpr: string
  priority: number
}

export interface PickArgs {
  now: Date
  defaultSceneId: string
  manualSceneId: string | null
  rules: ScheduleRule[]
}

export const pickActiveScene = (args: PickArgs): string => {
  if (args.manualSceneId) return args.manualSceneId

  let bestPriority = Number.NEGATIVE_INFINITY
  let bestSceneId = args.defaultSceneId

  for (const rule of args.rules) {
    try {
      const it = parseExpression(rule.cronExpr, { currentDate: args.now })
      const prev = it.prev().toDate()
      // Rule "wins" until the next matching rule fires; we just pick the most
      // recently fired rule by priority. The most recent prev() is whichever rule
      // last triggered before `now`; among those, highest priority wins.
      if (rule.priority > bestPriority) {
        bestPriority = rule.priority
        bestSceneId = rule.sceneId
      } else if (rule.priority === bestPriority) {
        // tie-break: more recently fired wins
        const currentBestRule = args.rules.find(
          (r) => r.sceneId === bestSceneId && r.priority === bestPriority,
        )
        if (currentBestRule) {
          const prevForBest = parseExpression(currentBestRule.cronExpr, {
            currentDate: args.now,
          })
            .prev()
            .toDate()
          if (prev > prevForBest) bestSceneId = rule.sceneId
        }
      }
    } catch {
      // bad cron expression — skip
    }
  }
  return bestSceneId
}

export interface RuntimeArgs {
  db: Database.Database
  broker: Broker
}

const loadDefaultSceneId = (db: Database.Database): string => {
  const row = db.prepare('SELECT id FROM scenes WHERE is_default = 1 LIMIT 1').get() as
    | { id: string }
    | undefined
  return row?.id ?? 'default'
}

const loadManualSceneId = (db: Database.Database): string | null => {
  const row = db.prepare("SELECT value FROM kv WHERE key='system'").get() as
    | { value: string }
    | undefined
  if (!row) return null
  try {
    const j = JSON.parse(row.value) as { manualScene?: string | null }
    return j.manualScene ?? null
  } catch {
    return null
  }
}

const loadRules = (db: Database.Database): ScheduleRule[] => {
  const rows = db
    .prepare('SELECT id, scene_id, cron_expr, priority FROM scene_schedule')
    .all() as Array<{ id: string; scene_id: string; cron_expr: string; priority: number }>
  return rows.map((r) => ({
    id: r.id,
    sceneId: r.scene_id,
    cronExpr: r.cron_expr,
    priority: r.priority,
  }))
}

export const startSceneScheduler = ({ db, broker }: RuntimeArgs) => {
  let lastSceneId: string | null = null
  const tick = () => {
    const sceneId = pickActiveScene({
      now: new Date(),
      defaultSceneId: loadDefaultSceneId(db),
      manualSceneId: loadManualSceneId(db),
      rules: loadRules(db),
    })
    if (sceneId !== lastSceneId) {
      lastSceneId = sceneId
      broker.publish({ type: 'scene:active', sceneId })
    }
  }
  const sched = createScheduler()
  sched.every(30_000, tick)
  tick()
  return { stop: () => sched.stop() }
}
