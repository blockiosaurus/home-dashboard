import type { ServerMessage } from '@dashboard/core'

type Listener = (m: ServerMessage) => void

export interface Broker {
  publish: (m: ServerMessage) => void
  subscribe: (l: Listener) => () => void
  size: () => number
}

export const createBroker = (): Broker => {
  const listeners = new Set<Listener>()
  return {
    publish: (m) => {
      for (const l of listeners) l(m)
    },
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    size: () => listeners.size,
  }
}
