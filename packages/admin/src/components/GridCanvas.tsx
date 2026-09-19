import type { LayoutCell } from '@dashboard/core'
import { GRID_COLS, GRID_ROWS } from '@dashboard/core'
import { useEffect, useRef, useState } from 'react'
import RGL, { WidthProvider } from 'react-grid-layout'
import type ReactGridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import { clampCell } from '../grid-utils'

// WidthProvider measures the container itself, avoiding race conditions
// between our ResizeObserver and RGL's pixel→grid math (which was almost
// certainly causing widgets to land at column 0).
const ResponsiveRGL = WidthProvider(RGL)

type Layout = ReactGridLayout.Layout

export interface GridCanvasProps {
  cells: LayoutCell[]
  /** Widget id -> display name, so tiles read "Meal Plan" and not "meal-plan". */
  names: Record<string, string>
  onChange: (cells: LayoutCell[]) => void
  onSelect: (instanceId: string | null) => void
  selectedInstanceId: string | null
}

const toLayout = (cells: LayoutCell[]): Layout[] =>
  cells.map((c) => ({ i: c.instanceId, x: c.x, y: c.y, w: c.w, h: c.h }))

const sameLayout = (a: Layout[], b: Layout[]): boolean => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]
    const bi = b[i]
    if (!ai || !bi) return false
    if (ai.i !== bi.i || ai.x !== bi.x || ai.y !== bi.y || ai.w !== bi.w || ai.h !== bi.h)
      return false
  }
  return true
}

export const GridCanvas = ({
  cells,
  names,
  onChange,
  onSelect,
  selectedInstanceId,
}: GridCanvasProps) => {
  // Hold the layout locally so RGL can manage positions during drag/resize
  // without us echoing every interim frame back through props and triggering
  // a re-sync. We push to the parent only on drag/resize stop.
  const [layout, setLayout] = useState<Layout[]>(() => toLayout(cells))

  // Re-seed when the cells set changes from outside (add/remove widget, scene
  // load). Skip when the new layout is identical to avoid clobbering an
  // in-flight drag.
  useEffect(() => {
    const next = toLayout(cells)
    setLayout((prev) => (sameLayout(prev, next) ? prev : next))
  }, [cells])

  // The canvas keeps the kiosk's 1080×1920 portrait aspect regardless of how
  // wide the admin pane is: row height is derived from the wrapper's own
  // measured width rather than a fixed pixel value, so 12 rows always add up
  // to the right height whether the admin is full-width on a laptop or
  // squeezed onto a phone. WidthProvider (below) still owns column math —
  // this observer only feeds `rowHeight`.
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    // Measure once up front: ResizeObserver's first callback is delivered on a
    // later frame, so without this the canvas paints at the fallback width and
    // visibly snaps to size a frame later.
    const initial = el.getBoundingClientRect().width
    if (initial > 0) setWidth(initial)
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setWidth(w)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Guard against a zero/undefined width (e.g. a hidden tab) by falling back
  // to the last known-good width rather than producing rowHeight 0.
  const safeWidth = width > 0 ? width : 600
  const rowHeight = Math.round(((safeWidth / GRID_COLS) * 1920) / 1080)

  // RGL's own defaults, pinned so the canvas height below stays in step with
  // whatever RGL actually renders.
  const MARGIN = 10

  // Always show the whole 8x12 kiosk screen. RGL's `autoSize` sizes the
  // container to the *occupied* rows instead, which collapses the canvas as
  // soon as the lowest widget is removed and leaves empty grid rows with no
  // drop target to aim at.
  const canvasHeight = GRID_ROWS * rowHeight + (GRID_ROWS - 1) * MARGIN + MARGIN * 2

  const persist = (next: Layout[]) => {
    onChange(
      cells.map((c) => {
        const l = next.find((x) => x.i === c.instanceId)
        if (!l) return c
        return clampCell({ ...c, x: l.x, y: l.y, w: l.w, h: l.h })
      }),
    )
  }

  return (
    <div ref={wrapperRef}>
      <ResponsiveRGL
        className="rounded-2xl bg-white shadow-[var(--shadow-card)]"
        cols={GRID_COLS}
        maxRows={GRID_ROWS}
        rowHeight={rowHeight}
        margin={[MARGIN, MARGIN]}
        containerPadding={[MARGIN, MARGIN]}
        autoSize={false}
        style={{ height: canvasHeight }}
        layout={layout}
        // Track live moves in local state so RGL has stable reference between
        // frames. Don't notify the parent until interaction ends.
        onLayoutChange={(next) => setLayout(next)}
        onDragStop={(next) => persist(next)}
        onResizeStop={(next) => persist(next)}
        compactType={null}
        verticalCompact={false}
        preventCollision={false}
        allowOverlap
        // NOT `isBounded`. react-grid-layout 1.5.0 subtracts `containerPadding`
        // from the running drag offset on every drag event and feeds the result
        // back into its own drag state (GridItem.js, the isBounded branch), so
        // the tile creeps up and left by 10px per mousemove — dozens of pixels
        // per drag — and lands rows above where it was dropped. Bounds don't
        // need it: RGL's calcXY already clamps to `cols`/`maxRows` on drop, and
        // `clampCell` in `persist` clamps again before the draft is updated.
        isDraggable
        isResizable
        useCSSTransforms
      >
        {cells.map((c) => (
          <div
            key={c.instanceId}
            className={`flex items-center justify-center rounded-lg border-2 ${
              selectedInstanceId === c.instanceId
                ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5'
            } text-xs font-semibold text-[var(--accent)]`}
            onMouseDown={() => onSelect(c.instanceId)}
            onTouchStart={() => onSelect(c.instanceId)}
          >
            {names[c.widgetId] ?? c.widgetId}
          </div>
        ))}
      </ResponsiveRGL>
    </div>
  )
}
