import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type Calendar, api } from '../api'

/** Shared calendar checkbox list used by both the wizard's calendars step and
 * the Settings calendars panel. Each row is a full-width tappable label
 * (min-height 44px, not just the small checkbox square) so it's easy to hit
 * on a phone. Toggling saves immediately via `PUT /api/calendars/:id`. */
export const CalendarList = ({ calendars }: { calendars: Calendar[] }) => {
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) =>
      api.putCalendar(id, { visible }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calendars'] }),
  })

  return (
    <ul className="space-y-2">
      {calendars.map((cal) => (
        <li key={cal.id}>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[var(--text-dim)]/20 px-3 py-2">
            <input
              type="checkbox"
              checked={cal.visible}
              onChange={(e) => toggle.mutate({ id: cal.id, visible: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-[var(--accent)]"
            />
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-black/10"
              style={{ background: cal.color ?? 'var(--text-dim)' }}
            />
            <span className="flex-1 truncate text-sm font-semibold">{cal.summary}</span>
          </label>
        </li>
      ))}
    </ul>
  )
}
