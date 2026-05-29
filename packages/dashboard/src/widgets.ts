import { registerWidgetLoader } from './widget-loader'

registerWidgetLoader('clock', () => import('@dashboard/widget-clock').then((m) => m.default))

registerWidgetLoader('calendar', () => import('@dashboard/widget-calendar').then((m) => m.default))
