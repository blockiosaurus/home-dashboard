import type { LayoutCell, Scene } from '@dashboard/core'
import { GRID_COLS, GRID_ROWS } from '@dashboard/core'
import { useEffect, useState } from 'react'
import { useDashboardStore } from './store'
import { loadWidget, type WidgetView } from './widget-loader'

const Cell = ({ cell }: { cell: LayoutCell }) => {
  const [view, setView] = useState<WidgetView | null>(null)
  const data = useDashboardStore((s) => s.widgetData[cell.instanceId])

  useEffect(() => {
    void loadWidget(cell.widgetId).then(setView)
  }, [cell.widgetId])

  const style = {
    gridColumnStart: cell.x + 1,
    gridColumnEnd: cell.x + 1 + cell.w,
    gridRowStart: cell.y + 1,
    gridRowEnd: cell.y + 1 + cell.h,
  }

  return (
    <div
      style={style}
      className="bg-white shadow-[var(--shadow-card)]"
      data-instance={cell.instanceId}
    >
      {view ? <view.Render config={cell.config} data={data} /> : null}
    </div>
  )
}

export const SceneRenderer = ({ scene }: { scene: Scene }) => (
  <div
    className="h-full p-4"
    style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
      gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
      gap: '12px',
    }}
  >
    {scene.cells.map((cell) => (
      <Cell key={cell.instanceId} cell={cell} />
    ))}
  </div>
)
