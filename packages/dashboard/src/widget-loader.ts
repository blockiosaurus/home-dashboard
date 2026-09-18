import type { ComponentType } from 'react'

export interface WidgetView<TConfig = unknown, TData = unknown> {
  // `instanceId` comes from the layout cell rather than the config so stateful
  // widgets (chores, notes, …) can address /api/widgets/:id/state without the
  // editor having to duplicate the id into every config blob.
  Render: ComponentType<{ instanceId: string; config: TConfig; data: TData | undefined }>
}

// `any` here (not `unknown`) is deliberate: each widget module exports a
// `WidgetView` typed with its own concrete config/data shape, and this
// registry is exactly the boundary where that per-widget type gets erased
// down to the `unknown`/`unknown` shape callers (SceneRenderer) work with.
// `unknown` would reject the assignment below since Render's prop type is
// checked contravariantly.
// biome-ignore lint/suspicious/noExplicitAny: type-erasure boundary, see above
type Loader = () => Promise<WidgetView<any, any>>

const loaders = new Map<string, Loader>()
const cache = new Map<string, WidgetView>()

export const registerWidgetLoader = (id: string, loader: Loader) => {
  loaders.set(id, loader)
}

export const loadWidget = async (id: string): Promise<WidgetView | null> => {
  const cached = cache.get(id)
  if (cached) return cached
  const loader = loaders.get(id)
  if (!loader) return null
  const view = await loader()
  cache.set(id, view)
  return view
}
