import type { LayoutCell } from '@dashboard/core'
import { Button, Card, Input } from '@dashboard/ui'
import { useEffect, useRef, useState } from 'react'
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

type NumberFieldSpec = Extract<FieldSpec, { type: 'number' }>

/** Number fields keep their own local (string) draft while typing, and only
 * clamp + commit on blur/Enter. Committing straight from `onChange` (as the
 * other field types do) makes backspacing-then-retyping impossible: an
 * intermediate value like "1" gets clamped up to `min` immediately, and
 * `Number('')` is 0, so clearing the field snaps back to `min` instead of
 * letting the user finish typing. */
const NumberField = ({
  field,
  config,
  cellId,
  onPatch,
}: {
  field: NumberFieldSpec
  config: Config
  cellId: string
  onPatch: (patch: Config) => void
}) => {
  const divisor = field.divisor ?? 1
  const raw = config[field.key]
  const committedText = typeof raw === 'number' ? String(raw / divisor) : ''
  const [text, setText] = useState(committedText)
  // Tracks the (cellId, committedText) pair this draft was last synced from,
  // so an outside change — a different cell selected, or the same field's
  // value changed by something other than this input (e.g. the Advanced
  // JSON section) — resets the draft, while the field's own in-progress
  // typing (which doesn't touch `config` until blur) is left alone.
  const lastSynced = useRef({ cellId, committedText })

  useEffect(() => {
    const outsideChange =
      lastSynced.current.cellId !== cellId || lastSynced.current.committedText !== committedText
    lastSynced.current = { cellId, committedText }
    if (outsideChange) setText(committedText)
  }, [cellId, committedText])

  const commit = () => {
    const n = Number(text)
    if (text.trim() === '' || !Number.isFinite(n)) {
      // Empty or unparseable: restore whatever was last committed rather
      // than forcing the field to `min`.
      setText(committedText)
      return
    }
    let clamped = n
    if (field.min !== undefined) clamped = Math.max(field.min, clamped)
    if (field.max !== undefined) clamped = Math.min(field.max, clamped)
    setText(String(clamped))
    onPatch({ [field.key]: clamped * divisor })
  }

  return (
    <div>
      <Input
        label={field.label}
        type="number"
        min={field.min}
        max={field.max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
      />
      {field.hint ? <p className="mt-1 text-xs text-[var(--text-dim)]">{field.hint}</p> : null}
    </div>
  )
}

const FieldRow = ({
  field,
  config,
  cellId,
  onPatch,
}: {
  field: FieldSpec
  config: Config
  cellId: string
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
    return <NumberField field={field} config={config} cellId={cellId} onPatch={onPatch} />
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
  // True whenever the textarea holds text that hasn't been successfully
  // applied to `config` yet (invalid JSON, or valid JSON not yet parsed on
  // this keystroke). While dirty, the resync effect below must leave the
  // textarea alone — otherwise a sibling field's patch (which changes
  // `configText`) would silently overwrite whatever the user was still
  // typing in the JSON box.
  const [jsonDirty, setJsonDirty] = useState(false)
  const lastCellId = useRef(cell?.instanceId)

  // Re-sync the Advanced textarea from `config` when: the selected cell
  // changed (a different cell's in-progress JSON has no bearing on this
  // one, dirty or not), or the config changed for some reason other than
  // the textarea itself while the textarea has no unsaved edits of its own.
  useEffect(() => {
    const switchedCell = lastCellId.current !== cell?.instanceId
    lastCellId.current = cell?.instanceId
    if (switchedCell || !jsonDirty) {
      setJsonText(configText)
      setJsonError(false)
      setJsonDirty(false)
    }
  }, [cell?.instanceId, configText, jsonDirty])

  if (!cell) {
    return (
      <Card className="w-full lg:w-72 lg:shrink-0">
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
    <Card className="w-full lg:w-72 lg:shrink-0">
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
              cellId={cell.instanceId}
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
            setJsonDirty(true)
            try {
              const next = JSON.parse(text)
              setJsonError(false)
              setJsonDirty(false)
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
