import { Button, Card } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

/** "Manual scene override" from the old SystemPanel, in plain language: pick
 * a scene to force it on now, or hand control back to the sleep schedule. */
export const SceneOverridePanel = () => {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const system = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  const scenes = useQuery({ queryKey: ['scenes'], queryFn: api.getScenes })
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: (manualScene: string | null) => api.putSystem({ manualScene }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['system'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    },
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
      <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
        Scene override
      </h3>
      <div className="mt-3 space-y-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-[var(--text-dim)]">Show this scene now</span>
          <select
            className="rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            value={system.data?.manualScene ?? ''}
            onChange={(e) => save.mutate(e.target.value || null)}
          >
            <option value="">Follow the schedule</option>
            {(scenes.data?.scenes ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {saved ? <p className="text-xs text-green-600">Saved</p> : null}
        <div className="border-t border-[var(--text-dim)]/20 pt-3">
          <p className="mb-2 text-xs text-[var(--text-dim)]">
            Want to go through setup again? Your Google connection and data are kept.
          </p>
          <Button
            variant="secondary"
            onClick={() => redoWizard.mutate()}
            disabled={redoWizard.isPending}
          >
            {redoWizard.isPending ? 'Resetting…' : 'Re-run setup'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
