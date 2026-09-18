import { Button, Card, Input } from '@dashboard/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

type Step = 'oauth' | 'people' | 'weather' | 'album' | 'done'

interface WizardState {
  step: Step
  people: Array<{ id: string; name: string; color: string }>
  weather: { lat: number; lon: number; unit: 'celsius' | 'fahrenheit'; label: string }
  albumId: string | null
}

const initial: WizardState = {
  step: 'oauth',
  people: [
    { id: 'p1', name: '', color: '#ff7eb6' },
    { id: 'p2', name: '', color: '#5b6cff' },
    { id: 'p3', name: '', color: '#ffb13b' },
    { id: 'p4', name: '', color: '#36c47a' },
  ],
  weather: { lat: 40.7128, lon: -74.006, unit: 'fahrenheit', label: '' },
  albumId: null,
}

export const Wizard = () => {
  const navigate = useNavigate()
  const [state, setState] = useState<WizardState>(initial)

  if (state.step === 'oauth') {
    return <ConnectStep onDone={() => setState((s) => ({ ...s, step: 'people' }))} />
  }

  // Subsequent steps land in Tasks 12.
  if (state.step === 'people')
    return (
      <PeopleStep
        people={state.people}
        onDone={(people) => setState((s) => ({ ...s, people, step: 'weather' }))}
      />
    )
  if (state.step === 'weather')
    return (
      <WeatherStep
        weather={state.weather}
        onDone={(weather) => setState((s) => ({ ...s, weather, step: 'album' }))}
      />
    )
  if (state.step === 'album')
    return <AlbumStep onDone={(albumId) => setState((s) => ({ ...s, albumId, step: 'done' }))} />

  // step === 'done'
  return <DoneStep state={state} onComplete={() => navigate('/editor')} />
}

const ConnectShell = ({ children }: { children: ReactNode }) => (
  <div className="flex h-full items-center justify-center p-6">
    <Card className="w-full max-w-md">
      <h1 className="text-2xl font-bold">Connect Google</h1>
      {children}
    </Card>
  </div>
)

const SkipForNow = ({ onSkip }: { onSkip: () => void }) => (
  <button
    type="button"
    onClick={onSkip}
    className="mt-3 w-full py-2 text-center text-sm text-[var(--text-dim)] underline decoration-dotted"
  >
    Skip for now — you can connect a calendar later from Settings
  </button>
)

type ConnectPhase = 'idle' | 'pending' | 'denied' | 'expired'

interface DeviceFlow {
  deviceCode: string
  userCode: string
  verificationUrl: string
  intervalSeconds: number
}

const ConnectStep = ({ onDone }: { onDone: () => void }) => {
  const queryClient = useQueryClient()
  const system = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.getAccounts })

  const [phase, setPhase] = useState<ConnectPhase>('idle')
  const [flow, setFlow] = useState<DeviceFlow | null>(null)

  const start = useMutation({
    mutationFn: api.oauthStart,
    onSuccess: (res) => {
      setFlow({
        deviceCode: res.deviceCode,
        userCode: res.userCode,
        verificationUrl: res.verificationUrl,
        intervalSeconds: res.intervalSeconds,
      })
      setPhase('pending')
    },
  })

  useEffect(() => {
    if (phase !== 'pending' || !flow) return
    const ms = Math.max(flow.intervalSeconds * 1000, 5000)
    const id = setInterval(async () => {
      const res = await api.oauthPoll(flow.deviceCode)
      if (res.status === 'ok') {
        clearInterval(id)
        queryClient.invalidateQueries({ queryKey: ['accounts'] })
        onDone()
      } else if (res.status === 'denied' || res.status === 'expired') {
        clearInterval(id)
        setPhase(res.status)
      }
    }, ms)
    return () => clearInterval(id)
  }, [phase, flow, queryClient, onDone])

  const cancel = () => {
    setFlow(null)
    setPhase('idle')
  }

  if (!system.data || !accounts.data) {
    return (
      <ConnectShell>
        <p className="mt-2 text-sm text-[var(--text-dim)]">Loading…</p>
        <SkipForNow onSkip={onDone} />
      </ConnectShell>
    )
  }

  const connected = accounts.data.accounts.length > 0

  if (connected && phase === 'idle') {
    return (
      <ConnectShell>
        <p className="mt-2 text-sm text-[var(--text-dim)]">Google Calendar is connected.</p>
        <Button className="mt-4 w-full" onClick={onDone}>
          Continue
        </Button>
        <Button
          variant="secondary"
          className="mt-2 w-full"
          onClick={() => start.mutate()}
          disabled={start.isPending}
        >
          {start.isPending ? 'Starting…' : 'Connect a different account'}
        </Button>
        {start.isError ? (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {start.error instanceof Error ? start.error.message : 'Something went wrong.'}
          </p>
        ) : null}
        <SkipForNow onSkip={onDone} />
      </ConnectShell>
    )
  }

  if (!system.data.googleConfigured && phase === 'idle') {
    return (
      <ConnectShell>
        <p className="mt-2 text-sm text-[var(--text-dim)]">
          We use Google Calendar so the dashboard can show your family's events and let you add new
          ones from the touchscreen.
        </p>
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>This dashboard's server doesn't have Google credentials yet. To add them:</p>
          <code className="mt-2 block rounded-lg bg-white p-2 font-mono text-xs">
            sudo nano /etc/dashboard/env
          </code>
          <code className="mt-2 block rounded-lg bg-white p-2 font-mono text-xs">
            sudo systemctl restart dashboard
          </code>
        </div>
        <Button
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => system.refetch()}
          disabled={system.isFetching}
        >
          {system.isFetching ? 'Checking…' : 'Check again'}
        </Button>
        <SkipForNow onSkip={onDone} />
      </ConnectShell>
    )
  }

  if (phase === 'idle') {
    return (
      <ConnectShell>
        <p className="mt-2 text-sm text-[var(--text-dim)]">
          We use Google Calendar so the dashboard can show your family's events and let you add new
          ones from the touchscreen.
        </p>
        <Button className="mt-4 w-full" onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending ? 'Starting…' : 'Start'}
        </Button>
        {start.isError ? (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {start.error instanceof Error ? start.error.message : 'Something went wrong.'}
          </p>
        ) : null}
        <SkipForNow onSkip={onDone} />
      </ConnectShell>
    )
  }

  if (phase === 'pending' && flow) {
    return (
      <ConnectShell>
        <div className="mt-4 space-y-2">
          <p>1. On any device, visit:</p>
          <a
            className="block break-all rounded-lg bg-gray-100 p-2 text-sm font-mono"
            href={flow.verificationUrl}
            target="_blank"
            rel="noreferrer"
          >
            {flow.verificationUrl}
          </a>
          <p>2. Enter this code:</p>
          <div className="rounded-lg bg-[var(--accent)] p-4 text-center text-3xl font-bold tracking-widest text-white">
            {flow.userCode}
          </div>
          <p className="text-xs text-[var(--text-dim)]">Waiting for Google…</p>
        </div>
        <Button variant="secondary" className="mt-4 w-full" onClick={cancel}>
          Cancel
        </Button>
        <SkipForNow onSkip={onDone} />
      </ConnectShell>
    )
  }

  // phase === 'denied' | 'expired'
  return (
    <ConnectShell>
      <p className="mt-4 text-sm text-red-500">
        {phase === 'denied' ? 'Google sign-in was denied.' : 'That code expired.'}
      </p>
      <Button className="mt-4 w-full" onClick={() => start.mutate()} disabled={start.isPending}>
        {start.isPending ? 'Starting…' : 'Retry'}
      </Button>
      <SkipForNow onSkip={onDone} />
    </ConnectShell>
  )
}

const COLORS = ['#ff7eb6', '#5b6cff', '#ffb13b', '#36c47a']

const PeopleStep = ({
  people,
  onDone,
}: {
  people: WizardState['people']
  onDone: (next: WizardState['people']) => void
}) => {
  const [draft, setDraft] = useState(people)
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Family members</h1>
        <p className="mt-1 text-sm text-[var(--text-dim)]">Up to four — leave blank to skip.</p>
        <div className="mt-4 space-y-3">
          {draft.map((p, idx) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="inline-block h-8 w-8 rounded-full" style={{ background: p.color }} />
              <Input
                value={p.name}
                placeholder={`Person ${idx + 1}`}
                onChange={(e) => {
                  const next = [...draft]
                  next[idx] = { ...p, name: e.target.value }
                  setDraft(next)
                }}
              />
              <select
                value={p.color}
                onChange={(e) => {
                  const next = [...draft]
                  next[idx] = { ...p, color: e.target.value }
                  setDraft(next)
                }}
                className="rounded-lg border border-[var(--text-dim)]/30 bg-white px-2 py-2 text-sm"
              >
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <Button className="mt-6 w-full" onClick={() => onDone(draft)}>
          Continue
        </Button>
      </Card>
    </div>
  )
}

const WeatherStep = ({
  weather,
  onDone,
}: {
  weather: WizardState['weather']
  onDone: (next: WizardState['weather']) => void
}) => {
  const [draft, setDraft] = useState(weather)
  const useGeolocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setDraft((d) => ({ ...d, lat: pos.coords.latitude, lon: pos.coords.longitude })),
      () => {},
    )
  }
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Weather location</h1>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          Used for the weather widget on the dashboard.
        </p>
        <div className="mt-4 space-y-3">
          <Input
            label="Label"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="e.g. Home"
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Latitude"
              type="number"
              value={String(draft.lat)}
              onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })}
            />
            <Input
              label="Longitude"
              type="number"
              value={String(draft.lon)}
              onChange={(e) => setDraft({ ...draft, lon: Number(e.target.value) })}
            />
          </div>
          <select
            value={draft.unit}
            onChange={(e) =>
              setDraft({ ...draft, unit: e.target.value as 'celsius' | 'fahrenheit' })
            }
            className="w-full rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm"
          >
            <option value="fahrenheit">Fahrenheit</option>
            <option value="celsius">Celsius</option>
          </select>
          <Button variant="ghost" className="w-full" onClick={useGeolocation}>
            Use this device's location
          </Button>
        </div>
        <Button className="mt-6 w-full" onClick={() => onDone(draft)}>
          Continue
        </Button>
      </Card>
    </div>
  )
}

const AlbumStep = ({ onDone }: { onDone: (id: string | null) => void }) => {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Photo slideshow</h1>
        <p className="mt-2 text-sm text-[var(--text-dim)]">
          The dashboard plays photos from a folder on the device. Drop your family photos into:
        </p>
        <code className="mt-3 block rounded-lg bg-gray-100 p-3 text-xs">
          /var/lib/dashboard/photos/
        </code>
        <p className="mt-3 text-xs text-[var(--text-dim)]">
          Or, in development, <code>packages/server/data/photos/</code>. JPG, PNG, WebP, AVIF, GIF
          all work — subfolders too. The dashboard rescans every hour.
        </p>
        <p className="mt-3 text-xs text-[var(--text-dim)]">
          (Google Photos' Ambient API requires Partner Program approval, so it isn't an option for
          personal projects.)
        </p>

        <div className="mt-6">
          <Button className="w-full" onClick={() => onDone(null)}>
            Continue
          </Button>
        </div>
      </Card>
    </div>
  )
}

const DoneStep = ({
  state,
  onComplete,
}: {
  state: WizardState
  onComplete: () => void
}) => {
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async () => {
      for (const person of state.people.filter((p) => p.name.trim().length > 0)) {
        await api.putPerson(person.id, { name: person.name, color: person.color })
      }
      return api.putSystem({
        firstRunComplete: true,
        weatherDefault: state.weather,
        // ambient device id is persisted server-side under accounts.ambient_device_id
        // by the wizard's AlbumStep — nothing for us to forward here.
      })
    },
    onSuccess: (result) => {
      // Seed the cache with fresh data before navigating so Shell's redirect
      // check (`system.firstRunComplete`) doesn't fire on the stale
      // pre-wizard value and bounce us straight back to /wizard.
      queryClient.setQueryData(['system'], result)
      queryClient.invalidateQueries({ queryKey: ['system'] })
      onComplete()
    },
  })
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold">Almost done</h1>
        <p className="mt-2 text-sm text-[var(--text-dim)]">
          Save your setup and the dashboard will come to life.
        </p>
        <Button className="mt-4 w-full" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Finish'}
        </Button>
      </Card>
    </div>
  )
}
