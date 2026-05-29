import type { LayoutCell } from '@dashboard/core'
import { Button, Card } from '@dashboard/ui'

export interface WidgetConfigPanelProps {
  cell: LayoutCell | null
  onChange: (cell: LayoutCell) => void
  onDelete: (instanceId: string) => void
}

export const WidgetConfigPanel = ({ cell, onChange, onDelete }: WidgetConfigPanelProps) => {
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
  const configStr = JSON.stringify(cell.config, null, 2)
  return (
    <Card className="w-72 shrink-0">
      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-dim)]">
        {cell.widgetId}
      </h3>
      <textarea
        className="mt-2 h-64 w-full resize-none rounded-lg border border-[var(--text-dim)]/30 bg-white p-2 font-mono text-xs"
        value={configStr}
        onChange={(e) => {
          try {
            const next = JSON.parse(e.target.value)
            onChange({ ...cell, config: next })
          } catch {
            // ignore invalid JSON until parseable
          }
        }}
      />
      <Button variant="danger" className="mt-3 w-full" onClick={() => onDelete(cell.instanceId)}>
        Remove widget
      </Button>
    </Card>
  )
}
