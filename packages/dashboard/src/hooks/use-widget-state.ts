import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

export interface WidgetStateRecord<T> {
  instanceId: string
  widgetId: string
  version: number
  data: T
  updatedAt: number
}

export interface UseWidgetStateArgs<T> {
  instanceId: string
  widgetId: string
  initial: T
}

export const useWidgetState = <T>(args: UseWidgetStateArgs<T>) => {
  const qc = useQueryClient()
  const key = ['widget-state', args.instanceId]

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<WidgetStateRecord<T>> => {
      const res = await fetch(`/api/widgets/${args.instanceId}/state`)
      if (res.status === 404) {
        return {
          instanceId: args.instanceId,
          widgetId: args.widgetId,
          version: 0,
          data: args.initial,
          updatedAt: 0,
        }
      }
      if (!res.ok) throw new Error('widget state load failed')
      return (await res.json()) as WidgetStateRecord<T>
    },
    refetchInterval: 30_000,
  })

  const mutation = useMutation({
    mutationFn: async (data: T) => {
      const current = qc.getQueryData<WidgetStateRecord<T>>(key)
      const res = await fetch(`/api/widgets/${args.instanceId}/state`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          widgetId: args.widgetId,
          data,
          ...(current && current.version > 0 ? { expectedVersion: current.version } : {}),
        }),
      })
      if (!res.ok) throw new Error('widget state save failed')
      return (await res.json()) as WidgetStateRecord<T>
    },
    onSuccess: (next) => qc.setQueryData(key, next),
  })

  return {
    data: query.data?.data ?? args.initial,
    save: (next: T) => mutation.mutate(next),
    isSaving: mutation.isPending,
  }
}
