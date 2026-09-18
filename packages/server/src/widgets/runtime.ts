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
  reload: (instances: WidgetInstance[]) => void
}

export const startWidgetRuntime = ({ broker, widgets, instances }: RuntimeArgs): RuntimeHandle => {
  const cache = new Map<string, unknown>()
  const publish = (instanceId: string, payload: unknown) => {
    cache.set(instanceId, payload)
    broker.publish({ type: 'widget:data', instanceId, payload })
  }
  const now = () => new Date()
  const start = (list: WidgetInstance[]) =>
    runWidgetBackends({ widgets, instances: list, publish, now })

  let stopCurrent = start(instances)

  return {
    stop: () => stopCurrent(),
    cache: {
      get: (instanceId) => cache.get(instanceId),
      entries: () => cache.entries(),
    },
    // Called whenever a scene is published. Clearing the timers first keeps
    // this idempotent: a backend run already in flight simply finishes, and its
    // late publish only refreshes the cache for an instance that may no longer
    // be on screen, which is harmless. The cache itself is kept so reconnecting
    // kiosks still get last-known data for unchanged widgets.
    reload: (next) => {
      stopCurrent()
      stopCurrent = start(next)
    },
  }
}
