import type { LayoutCell } from '@dashboard/core'
import { Card } from '@dashboard/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { clampCell, findEmptySpot } from '../grid-utils'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export interface WidgetPaletteProps {
  existing: LayoutCell[]
  onAdd: (cell: LayoutCell) => void
}

export const WidgetPalette = ({ existing, onAdd }: WidgetPaletteProps) => {
  const { data } = useQuery({ queryKey: ['widgets'], queryFn: api.getWidgets })
  const widgets = data?.widgets ?? []
  const spots = widgets.map((w) => findEmptySpot(existing, w.defaultSize.w, w.defaultSize.h))
  // When nothing fits, the reason has to be visible on the page — a disabled
  // button with a `title` tooltip says nothing on a touchscreen.
  const gridFull = widgets.length > 0 && spots.every((s) => s === null)

  return (
    <Card className="w-56 shrink-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Add widget
      </h3>
      <div className="mt-3 space-y-1">
        {widgets.map((w, i) => {
          const spot = spots[i] ?? null
          return (
            <div key={w.id}>
              <button
                type="button"
                disabled={spot === null}
                onClick={() => {
                  if (!spot) return
                  onAdd(
                    clampCell({
                      instanceId: newId(),
                      widgetId: w.id,
                      x: spot.x,
                      y: spot.y,
                      w: w.defaultSize.w,
                      h: w.defaultSize.h,
                      // Start from the widget's own sensible defaults so a newly
                      // placed widget works without anyone editing its settings.
                      config: w.defaultConfig ?? {},
                    }),
                  )
                }}
                className="block w-full rounded-lg border border-[var(--text-dim)]/20 bg-white px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="block text-sm font-semibold">{w.name}</span>
                {w.description ? (
                  <span className="mt-0.5 block text-xs leading-snug text-[var(--text-dim)]">
                    {w.description}
                  </span>
                ) : null}
              </button>
              {spot === null ? (
                // Every disabled control says why on the page itself — a `title`
                // tooltip is invisible on the touchscreen this is used from.
                <p className="mt-0.5 px-3 text-xs leading-snug text-[var(--text-dim)]">
                  No room for a {w.defaultSize.w}×{w.defaultSize.h} widget.
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
      {gridFull ? (
        <p className="mt-2 text-xs leading-snug text-[var(--text-dim)]">
          The grid is full. Remove or shrink a widget to add another.
        </p>
      ) : null}
    </Card>
  )
}
