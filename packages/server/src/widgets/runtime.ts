import type { WidgetDefinition } from '@dashboard/core'
import type { Broker } from '../ws/broker'
import { type WidgetInstance, runWidgetBackends } from './cron-runner'

export interface WidgetDataCache {
  get: (instanceId: string) => unknown
  entries: () => Iterable<[string, unknown]>
}

export interface RuntimeArgs {
  broker: Broker
  widgets: WidgetDefinition[]
  instances: WidgetInstance[]
}

export interface RuntimeHandle {
  stop: () => void
  cache: WidgetDataCache
}

export const startWidgetRuntime = ({ broker, widgets, instances }: RuntimeArgs): RuntimeHandle => {
  const cache = new Map<string, unknown>()
  const stop = runWidgetBackends({
    widgets,
    instances,
    publish: (instanceId, payload) => {
      cache.set(instanceId, payload)
      broker.publish({ type: 'widget:data', instanceId, payload })
    },
    now: () => new Date(),
  })
  return {
    stop,
    cache: {
      get: (instanceId) => cache.get(instanceId),
      entries: () => cache.entries(),
    },
  }
}
