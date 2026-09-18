import { Input } from '@dashboard/ui'
import type { Calendar } from '../api'

/** The four picker colors, with the plain-English name shown in the select —
 * the hex stays the stored value (and the swatch), but a family member picking
 * "their colour" shouldn't have to read hex codes. */
export const PERSON_COLOR_OPTIONS = [
  { value: '#ff7eb6', name: 'Pink' },
  { value: '#5b6cff', name: 'Blue' },
  { value: '#ffb13b', name: 'Orange' },
  { value: '#36c47a', name: 'Green' },
] as const

export const PERSON_COLORS = PERSON_COLOR_OPTIONS.map((c) => c.value)

export interface PersonRowValue {
  id: string
  name: string
  color: string
  primaryCalendarId: string | null
}

/** One family member's editable row: color swatch, name, color picker, and —
 * only when at least one calendar exists (no account connected means no
 * calendars to offer) — a calendar picker mapping this person to the
 * calendar whose events should carry their color.
 *
 * Shared by the wizard's People step and the Settings People panel. Both
 * keep this fully controlled (`onChange` fires on every edit — a keystroke,
 * a select's change — so the caller can update its own draft state and
 * re-render this row with the new value). `onCommit` fires when a value is
 * ready to persist: on blur for the name field (so we don't save on every
 * keystroke), immediately after `onChange` for the two selects (there's no
 * "typing" to wait out). The wizard omits `onCommit` — it saves everything
 * together on Finish instead. */
export const PersonRow = ({
  value,
  index,
  calendars,
  onChange,
  onCommit,
}: {
  value: PersonRowValue
  index: number
  calendars: Calendar[]
  onChange: (next: PersonRowValue) => void
  onCommit?: (next: PersonRowValue) => void
}) => (
  <div className="flex items-center gap-3">
    <span
      className="inline-block h-8 w-8 shrink-0 rounded-full"
      style={{ background: value.color }}
    />
    <Input
      value={value.name}
      placeholder={`Person ${index + 1}`}
      onChange={(e) => onChange({ ...value, name: e.target.value })}
      onBlur={() => onCommit?.(value)}
      className="flex-1"
    />
    <select
      value={value.color}
      onChange={(e) => {
        const next = { ...value, color: e.target.value }
        onChange(next)
        onCommit?.(next)
      }}
      className="rounded-lg border border-[var(--text-dim)]/30 bg-white px-2 py-2 text-sm"
    >
      {PERSON_COLOR_OPTIONS.map((c) => (
        <option key={c.value} value={c.value}>
          {c.name}
        </option>
      ))}
    </select>
    {calendars.length > 0 ? (
      <select
        value={value.primaryCalendarId ?? ''}
        onChange={(e) => {
          const next = { ...value, primaryCalendarId: e.target.value || null }
          onChange(next)
          onCommit?.(next)
        }}
        className="rounded-lg border border-[var(--text-dim)]/30 bg-white px-2 py-2 text-sm"
      >
        <option value="">No calendar</option>
        {calendars.map((cal) => (
          <option key={cal.id} value={cal.id}>
            {cal.summary}
          </option>
        ))}
      </select>
    ) : null}
  </div>
)
