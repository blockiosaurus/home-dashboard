import type { LayoutCell } from '@dashboard/core'
import type Database from 'better-sqlite3'
import { type WeatherDefault, loadSystem } from '../system/store'
import type { WidgetInstance } from './cron-runner'

export const instancesFromScene = (cells: LayoutCell[]): WidgetInstance[] =>
  cells.map((c) => ({ widgetId: c.widgetId, instanceId: c.instanceId, config: c.config }))

/** Weather instances added from the palette start with only a unit; fill in the
 * family's saved location so they show real numbers instead of an error. The
 * instance's own values always win — a per-widget override stays an override. */
const withWeatherDefault = (
  inst: WidgetInstance,
  weatherDefault: WeatherDefault | null,
): WidgetInstance => {
  if (inst.widgetId !== 'weather' || !weatherDefault) return inst
  const config = (inst.config ?? {}) as Record<string, unknown>
  if (typeof config.lat === 'number' && typeof config.lon === 'number') return inst
  return {
    ...inst,
    config: {
      lat: weatherDefault.lat,
      lon: weatherDefault.lon,
      unit: weatherDefault.unit,
      ...(weatherDefault.label !== undefined ? { label: weatherDefault.label } : {}),
      ...config,
    },
  }
}

/**
 * Every scene's widget instances, de-duplicated by `instanceId`. Backends run
 * per instance and not per scene, so a widget that appears in both the Active
 * and Sleep scenes must only get one set of timers — and a widget that only
 * lives in Sleep still needs its data ready before the scene switches.
 */
export const collectInstances = (db: Database.Database): WidgetInstance[] => {
  const rows = db.prepare('SELECT layout_json FROM scenes ORDER BY created_at ASC').all() as Array<{
    layout_json: string
  }>
  const { weatherDefault } = loadSystem(db)
  const byInstance = new Map<string, WidgetInstance>()
  for (const row of rows) {
    let cells: LayoutCell[]
    try {
      cells = JSON.parse(row.layout_json) as LayoutCell[]
    } catch {
      continue
    }
    for (const inst of instancesFromScene(cells)) {
      if (byInstance.has(inst.instanceId)) continue
      byInstance.set(inst.instanceId, withWeatherDefault(inst, weatherDefault))
    }
  }
  return [...byInstance.values()]
}
