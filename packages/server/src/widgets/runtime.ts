import type { WidgetDefinition } from '@dashboard/core'
import type { Broker } from '../ws/broker'
import { type WidgetInstance, runWidgetBackends } from './cron-runner'

export interface RuntimeArgs {
  broker: Broker
  widgets: WidgetDefinition[]
  instances: WidgetInstance[]
}

export const startWidgetRuntime = ({ broker, widgets, instances }: RuntimeArgs) =>
  runWidgetBackends({
    widgets,
    instances,
    publish: (instanceId, payload) => broker.publish({ type: 'widget:data', instanceId, payload }),
    now: () => new Date(),
  })
