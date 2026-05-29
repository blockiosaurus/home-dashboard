import { Button, Card, Input } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export const SystemPanel = () => {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data } = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  const [manualScene, setManualScene] = useState<string | null>(null)
  useEffect(() => {
    if (data) setManualScene(data.manualScene)
  }, [data])

  const save = useMutation({
    mutationFn: api.putSystem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system'] }),
  })

  const redoWizard = useMutation({
    mutationFn: async () => {
      await api.putSystem({ firstRunComplete: false })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system'] })
      navigate('/wizard')
    },
  })

  return (
    <Card>
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">System</h3>
      <div className="mt-3 space-y-3">
        <Input
          label="Manual scene override"
          value={manualScene ?? ''}
          onChange={(e) => setManualScene(e.target.value || null)}
          placeholder="(none)"
        />
        <Button onClick={() => save.mutate({ manualScene })} disabled={save.isPending}>
          Save
        </Button>
        <div className="border-t border-[var(--text-dim)]/20 pt-3">
          <p className="mb-2 text-xs text-[var(--text-dim)]">
            Wants to redo the setup wizard? This won't disconnect Google or delete your data.
          </p>
          <Button variant="secondary" onClick={() => redoWizard.mutate()} disabled={redoWizard.isPending}>
            {redoWizard.isPending ? 'Resetting…' : 'Re-run wizard'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
