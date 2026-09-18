import type { ServerMessage } from '@dashboard/core'
import type Database from 'better-sqlite3'

export interface WeatherDefault {
  lat: number
  lon: number
  unit: 'celsius' | 'fahrenheit'
  label?: string | undefined
}

interface SceneRow {
  id: string
  layout_json: string
}

interface LayoutCellLike {
  widgetId: string
  config: unknown
}

/** Minimal shape the broker needs — matches `Broker['publish']` without
 * importing the concrete type, so this stays easy to unit test with a plain
 * stub. */
export interface WeatherDefaultBroker {
  publish: (m: ServerMessage) => void
}

/** Pushes a new default weather location/unit onto every `widgetId ===
 * 'weather'` cell across all scenes, persists the updated layouts, and
 * publishes `scene:updated` for each scene that actually changed. A scene
 * with no weather cells is left untouched and never published — this is a
 * no-op for scenes that don't have one. */
export const applyWeatherDefault = (
  db: Database.Database,
  broker: WeatherDefaultBroker,
  weatherDefault: WeatherDefault,
) => {
  const rows = db.prepare('SELECT id, layout_json FROM scenes').all() as SceneRow[]
  const now = Date.now()

  for (const row of rows) {
    const cells = JSON.parse(row.layout_json) as LayoutCellLike[]
    let changed = false
    const nextCells = cells.map((cell) => {
      if (cell.widgetId !== 'weather') return cell
      changed = true
      return {
        ...cell,
        config: {
          ...(cell.config as Record<string, unknown>),
          lat: weatherDefault.lat,
          lon: weatherDefault.lon,
          unit: weatherDefault.unit,
          label: weatherDefault.label,
        },
      }
    })

    if (!changed) continue

    db.prepare('UPDATE scenes SET layout_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(nextCells),
      now,
      row.id,
    )
    broker.publish({ type: 'scene:updated', sceneId: row.id })
  }
}
