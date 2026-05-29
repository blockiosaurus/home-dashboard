import type { WidgetDefinition } from '@dashboard/core'

export interface WidgetInstance {
  widgetId: string
  instanceId: string
  config: unknown
}

export interface RunArgs {
  widgets: WidgetDefinition[]
  instances: WidgetInstance[]
  publish: (instanceId: string, payload: unknown) => void
  now: () => Date
}

export const runWidgetBackends = ({ widgets, instances, publish, now }: RunArgs) => {
  const byId = new Map(widgets.map((w) => [w.id, w]))
  const timers: NodeJS.Timeout[] = []
  for (const inst of instances) {
    const w = byId.get(inst.widgetId)
    if (!w?.backend) continue
    const ctx = {
      instanceId: inst.instanceId,
      config: inst.config,
      publish: (p: unknown) => publish(inst.instanceId, p),
      now,
    }
    // Fire once immediately
    void w.backend.run(ctx).catch((e) => console.error('widget backend error', e))
    const t = setInterval(() => {
      void w.backend?.run(ctx).catch((e) => console.error('widget backend error', e))
    }, w.backend.intervalMs)
    timers.push(t)
  }
  return () => {
    for (const t of timers) clearInterval(t)
  }
}
