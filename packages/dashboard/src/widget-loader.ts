import type { ComponentType } from 'react'

export interface WidgetView<TConfig = unknown, TData = unknown> {
  // `instanceId` comes from the layout cell rather than the config so stateful
  // widgets (chores, notes, …) can address /api/widgets/:id/state without the
  // editor having to duplicate the id into every config blob.
  Render: ComponentType<{ instanceId: string; config: TConfig; data: TData | undefined }>
}

type Loader = () => Promise<WidgetView>

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
