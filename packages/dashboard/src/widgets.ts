import { registerWidgetLoader } from './widget-loader'

registerWidgetLoader('clock', () =>
  import('@dashboard/widget-clock').then((m) => m.default),
)
