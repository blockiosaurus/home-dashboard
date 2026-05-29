import type { WidgetDefinition } from '@dashboard/core'

export interface Registry {
  register: (w: WidgetDefinition) => void
  get: (id: string) => WidgetDefinition | undefined
  list: () => WidgetDefinition[]
}

export const createRegistry = (): Registry => {
  const map = new Map<string, WidgetDefinition>()
  return {
    register: (w) => {
      if (map.has(w.id)) throw new Error(`widget ${w.id} already registered`)
      map.set(w.id, w)
    },
    get: (id) => map.get(id),
    list: () => [...map.values()],
  }
}
