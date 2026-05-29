import type { LayoutCell } from '@dashboard/core'
import { Card } from '@dashboard/ui'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export interface WidgetPaletteProps {
  onAdd: (cell: LayoutCell) => void
}

export const WidgetPalette = ({ onAdd }: WidgetPaletteProps) => {
  const { data } = useQuery({ queryKey: ['widgets'], queryFn: api.getWidgets })
  return (
    <Card className="w-56 shrink-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Add widget
      </h3>
      <div className="mt-3 space-y-1">
        {(data?.widgets ?? []).map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() =>
              onAdd({
                instanceId: newId(),
                widgetId: w.id,
                x: 0,
                y: 0,
                w: w.defaultSize.w,
                h: w.defaultSize.h,
                config: {},
              })
            }
            className="block w-full rounded-lg border border-[var(--text-dim)]/20 bg-white px-3 py-2 text-left text-sm hover:bg-gray-50"
          >
            {w.name}
          </button>
        ))}
      </div>
    </Card>
  )
}
