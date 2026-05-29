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
  return (
    <Card className="w-56 shrink-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Add widget
      </h3>
      <div className="mt-3 space-y-1">
        {(data?.widgets ?? []).map((w) => {
          const spot = findEmptySpot(existing, w.defaultSize.w, w.defaultSize.h)
          const full = spot === null
          return (
            <button
              key={w.id}
              type="button"
              disabled={full}
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
                    config: {},
                  }),
                )
              }}
              className="block w-full rounded-lg border border-[var(--text-dim)]/20 bg-white px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={full ? 'No room on the grid' : `Place at (${spot.x}, ${spot.y})`}
            >
              {w.name}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
