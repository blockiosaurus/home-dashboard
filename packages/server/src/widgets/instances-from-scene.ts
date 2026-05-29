import type { LayoutCell } from '@dashboard/core'
import type { WidgetInstance } from './cron-runner'

export const instancesFromScene = (cells: LayoutCell[]): WidgetInstance[] =>
  cells.map((c) => ({ widgetId: c.widgetId, instanceId: c.instanceId, config: c.config }))
