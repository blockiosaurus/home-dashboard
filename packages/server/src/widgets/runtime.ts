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
  const now = () => new Date()

  // Stopping a generation only clears its intervals — a `run` already in flight
  // keeps going and will still call publish when it resolves. Without this
  // guard a slow fetch started before a reload (say, weather for the old
  // location) can land after the new generation has already published and
  // overwrite it for a whole interval. Publishes are therefore tagged with the
  // generation that produced them and dropped once superseded.
  let generation = 0

  const start = (list: WidgetInstance[]) => {
    const gen = generation
    const publish = (instanceId: string, payload: unknown) => {
      if (gen !== generation) return
      cache.set(instanceId, payload)
      broker.publish({ type: 'widget:data', instanceId, payload })
    }
    return runWidgetBackends({ widgets, instances: list, publish, now })
  }

  let stopCurrent = start(instances)

  return {
    stop: () => {
      stopCurrent()
      generation += 1
    },
    cache: {
      get: (instanceId) => cache.get(instanceId),
      entries: () => cache.entries(),
    },
    // Called whenever a scene is published. Safe to call at any time and as
    // often as needed: the timers are cleared, the generation is bumped so
    // anything still in flight can no longer publish, and the new instance list
    // starts fresh. The cache is kept so reconnecting kiosks still get
    // last-known data for unchanged widgets.
    reload: (next) => {
      stopCurrent()
      generation += 1
      stopCurrent = start(next)
    },
  }
}
