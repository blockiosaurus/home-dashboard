import type { LayoutCell } from '@dashboard/core'
import { Button, Card, Input } from '@dashboard/ui'
import { useEffect, useState } from 'react'
import type { FieldSpec } from '../widget-forms'
import { WIDGET_FORMS } from '../widget-forms'
import { LocationPicker } from './LocationPicker'

export interface WidgetConfigPanelProps {
  cell: LayoutCell | null
  /** Widget id -> display name, shared with GridCanvas so the panel heading
   * reads "Weather" and not "weather". */
  names: Record<string, string>
  onChange: (cell: LayoutCell) => void
  onDelete: (instanceId: string) => void
}

type Config = Record<string, unknown>

const asConfig = (config: unknown): Config =>
  config && typeof config === 'object' ? (config as Config) : {}

const FieldRow = ({
  field,
  config,
  onPatch,
}: {
  field: FieldSpec
  config: Config
  onPatch: (patch: Config) => void
}) => {
  if (field.type === 'text') {
    const value = typeof config[field.key] === 'string' ? (config[field.key] as string) : ''
    return (
      <Input
        label={field.label}
        value={value}
        onChange={(e) => onPatch({ [field.key]: e.target.value })}
      />
    )
  }

  if (field.type === 'number') {
    const divisor = field.divisor ?? 1
    const raw = config[field.key]
    const displayValue = typeof raw === 'number' ? raw / divisor : ''
    return (
      <div>
        <Input
          label={field.label}
          type="number"
          min={field.min}
          max={field.max}
          value={displayValue}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            const clamped = field.min !== undefined ? Math.max(field.min, n) : n
            onPatch({ [field.key]: clamped * divisor })
          }}
        />
        {field.hint ? <p className="mt-1 text-xs text-[var(--text-dim)]">{field.hint}</p> : null}
      </div>
    )
  }

  if (field.type === 'select') {
    const value = typeof config[field.key] === 'string' ? (config[field.key] as string) : ''
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-[var(--text-dim)]">{field.label}</span>
        <select
          value={value}
          onChange={(e) => onPatch({ [field.key]: e.target.value })}
          className="min-h-10 rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    )
  }

  if (field.type === 'toggle') {
    const checked = Boolean(config[field.key])
    return (
      <label className="flex min-h-10 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onPatch({ [field.key]: e.target.checked })}
          className="h-5 w-5 shrink-0 accent-[var(--accent)]"
        />
        <span className="text-sm font-semibold">{field.label}</span>
      </label>
    )
  }

  // field.type === 'location'
  const lat = config.lat
  const lon = config.lon
  const label = typeof config.label === 'string' ? config.label : ''
  const value = typeof lat === 'number' && typeof lon === 'number' ? { lat, lon, label } : null
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-[var(--text-dim)]">{field.label}</span>
      <LocationPicker
        value={value}
        onChange={(next) =>
          onPatch(
            next
              ? { lat: next.lat, lon: next.lon, label: next.label }
              : { lat: undefined, lon: undefined, label: undefined },
          )
        }
      />
    </div>
  )
}

export const WidgetConfigPanel = ({ cell, names, onChange, onDelete }: WidgetConfigPanelProps) => {
  const config = asConfig(cell?.config)
  const configText = JSON.stringify(config, null, 2)
  const [jsonText, setJsonText] = useState(configText)
  const [jsonError, setJsonError] = useState(false)

  // Re-sync the Advanced textarea whenever the underlying config changes for
  // a reason other than the textarea itself (switching cells, a field input
  // above, or an external prop update) — but not while the user has typed
  // something in the textarea we haven't been able to parse yet, since that
  // JSON is still "in progress" and shouldn't be clobbered by a stale value.
  useEffect(() => {
    setJsonText(configText)
    setJsonError(false)
  }, [configText])

  if (!cell) {
    return (
      <Card className="w-72 shrink-0">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
          Configure
        </h3>
        <p className="mt-2 text-sm text-[var(--text-dim)]">Select a widget to edit its config.</p>
      </Card>
    )
  }

  const fields = WIDGET_FORMS[cell.widgetId] ?? []

  const onPatch = (patch: Config) => {
    onChange({ ...cell, config: { ...config, ...patch } })
  }

  return (
    <Card className="w-72 shrink-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
        {names[cell.widgetId] ?? cell.widgetId}
      </h3>

      {fields.length > 0 ? (
        <div className="mt-3 space-y-3">
          {fields.map((field) => (
            <FieldRow
              key={field.type === 'location' ? 'location' : field.key}
              field={field}
              config={config}
              onPatch={onPatch}
            />
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-xs text-[var(--text-dim)]">
        Size: {cell.w} × {cell.h}
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
          Advanced (JSON)
        </summary>
        <textarea
          className="mt-2 h-64 w-full resize-none rounded-lg border border-[var(--text-dim)]/30 bg-white p-2 font-mono text-xs"
          value={jsonText}
          onChange={(e) => {
            const text = e.target.value
            setJsonText(text)
            try {
              const next = JSON.parse(text)
              setJsonError(false)
              onChange({ ...cell, config: next })
            } catch {
              setJsonError(true)
            }
          }}
        />
        {jsonError ? (
          <p className="mt-1 text-xs font-semibold text-red-600">Not valid JSON</p>
        ) : null}
      </details>

      <Button variant="danger" className="mt-3 w-full" onClick={() => onDelete(cell.instanceId)}>
        Remove widget
      </Button>
    </Card>
  )
}
