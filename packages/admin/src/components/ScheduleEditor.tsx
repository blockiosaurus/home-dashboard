import { Button, Card, Input } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const ScheduleEditor = () => {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['schedule'], queryFn: api.getSchedule })
  const [sceneId, setSceneId] = useState('default')
  const [cronExpr, setCronExpr] = useState('0 22 * * *')
  const [priority, setPriority] = useState(10)

  const save = useMutation({
    mutationFn: (body: { id: string; sceneId: string; cronExpr: string; priority: number }) =>
      api.putScheduleRule(body.id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })
  const del = useMutation({
    mutationFn: api.deleteScheduleRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule'] }),
  })

  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Schedule
      </h3>
      <p className="mt-1 text-xs text-[var(--text-dim)]">
        Cron syntax. Highest priority rule wins.
      </p>
      <div className="mt-3 space-y-2">
        {(data?.rules ?? []).map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border border-[var(--text-dim)]/20 p-2 text-sm"
          >
            <span>
              <strong>{r.sceneId}</strong> @ <code>{r.cronExpr}</code> (p={r.priority})
            </span>
            <Button variant="ghost" onClick={() => del.mutate(r.id)}>
              Remove
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-3 border-t border-[var(--text-dim)]/20 pt-3">
        <Input
          label="Scene id"
          value={sceneId}
          onChange={(e) => setSceneId(e.target.value)}
        />
        <Input
          label="Cron expression"
          value={cronExpr}
          onChange={(e) => setCronExpr(e.target.value)}
        />
        <Input
          label="Priority"
          type="number"
          value={String(priority)}
          onChange={(e) => setPriority(Number(e.target.value))}
        />
        <Button
          className="w-full"
          onClick={() => save.mutate({ id: newId(), sceneId, cronExpr, priority })}
        >
          Add rule
        </Button>
      </div>
    </Card>
  )
}
