/** Field descriptors for the widget config panel (Task 8). These describe
 * *data*, not behavior — `WidgetConfigPanel` renders generically from them so
 * adding a new field to a widget never needs new panel code. A widget id with
 * no entry here (or none of these five) falls back to the Advanced (JSON)
 * section only. */

export interface SelectOption {
  value: string
  label: string
}

export type FieldSpec =
  | { type: 'text'; key: string; label: string }
  | {
      type: 'number'
      key: string
      label: string
      min?: number
      max?: number
      /** Display (and accept input) divided by this factor, storing the
       * config value multiplied back up. Used for `intervalMs`, which is
       * edited in seconds but stored in milliseconds. */
      divisor?: number
    }
  | { type: 'select'; key: string; label: string; options: SelectOption[] }
  | { type: 'toggle'; key: string; label: string }
  // Renders LocationPicker (Task 3) and writes `lat`, `lon`, `label` together.
  | { type: 'location'; label: string }

export const WIDGET_FORMS: Record<string, FieldSpec[]> = {
  clock: [
    {
      type: 'select',
      key: 'format',
      label: 'Time format',
      options: [
        { value: '12h', label: '12-hour' },
        { value: '24h', label: '24-hour' },
      ],
    },
  ],
  calendar: [
    {
      type: 'select',
      key: 'view',
      label: 'View',
      options: [
        { value: 'week', label: 'Week' },
        { value: 'day', label: 'Day' },
        { value: 'month', label: 'Month' },
      ],
    },
  ],
  agenda: [
    { type: 'text', key: 'title', label: 'Title' },
    { type: 'number', key: 'daysAhead', label: 'Days to show', min: 1, max: 14 },
  ],
  weather: [
    { type: 'location', label: 'Location' },
    {
      type: 'select',
      key: 'unit',
      label: 'Units',
      options: [
        { value: 'fahrenheit', label: '°F' },
        { value: 'celsius', label: '°C' },
      ],
    },
  ],
  slideshow: [
    { type: 'number', key: 'intervalMs', label: 'Seconds per photo', min: 2, divisor: 1000 },
    { type: 'toggle', key: 'shuffle', label: 'Shuffle photos' },
  ],
  chores: [{ type: 'text', key: 'title', label: 'Title' }],
  'meal-plan': [{ type: 'text', key: 'title', label: 'Title' }],
  notes: [{ type: 'text', key: 'title', label: 'Title' }],
  packages: [{ type: 'text', key: 'title', label: 'Title' }],
}
