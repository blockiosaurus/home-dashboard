import { Button, Card, Input } from '@dashboard/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

type Step = 'oauth' | 'people' | 'weather' | 'album' | 'done'

interface WizardState {
  step: Step
  deviceCode: string | null
  userCode: string | null
  verificationUrl: string | null
  oauthStatus: 'idle' | 'pending' | 'ok' | 'denied' | 'expired'
  people: Array<{ id: string; name: string; color: string }>
  weather: { lat: number; lon: number; unit: 'celsius' | 'fahrenheit'; label: string }
  albumId: string | null
}

const initial: WizardState = {
  step: 'oauth',
  deviceCode: null,
  userCode: null,
  verificationUrl: null,
  oauthStatus: 'idle',
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

  const start = useMutation({
    mutationFn: api.oauthStart,
    onSuccess: (res) =>
      setState((s) => ({
        ...s,
        deviceCode: res.deviceCode,
        userCode: res.userCode,
        verificationUrl: res.verificationUrl,
        oauthStatus: 'pending',
      })),
  })

  useEffect(() => {
    if (state.oauthStatus !== 'pending' || !state.deviceCode) return
    const id = setInterval(async () => {
      const res = await api.oauthPoll(state.deviceCode as string)
      if (res.status === 'ok') {
        setState((s) => ({ ...s, oauthStatus: 'ok', step: 'people' }))
        clearInterval(id)
      } else if (res.status === 'denied' || res.status === 'expired') {
        setState((s) => ({ ...s, oauthStatus: res.status }))
        clearInterval(id)
      }
    }, 5000)
    return () => clearInterval(id)
  }, [state.oauthStatus, state.deviceCode])

  if (state.step === 'oauth') {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <h1 className="text-2xl font-bold">Connect Google</h1>
          <p className="mt-2 text-sm text-[var(--text-dim)]">
            We use Google Calendar (read + write) and Google Photos (read) so the dashboard can show
            events and a slideshow.
          </p>
          {state.oauthStatus === 'idle' ? (
            <>
              <Button
                className="mt-4 w-full"
                onClick={() => start.mutate()}
                disabled={start.isPending}
              >
                {start.isPending ? 'Starting…' : 'Start'}
              </Button>
              {start.isError ? (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  {start.error instanceof Error ? start.error.message : 'Something went wrong.'}
                  <br />
                  <span className="text-xs text-red-600">
                    Make sure <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>{' '}
                    are set in the server environment, then restart the dashboard service.
                  </span>
                </p>
              ) : null}
            </>
          ) : state.oauthStatus === 'pending' ? (
            <div className="mt-4 space-y-2">
              <p>1. On any device, visit:</p>
              <a
                className="block break-all rounded-lg bg-gray-100 p-2 text-sm font-mono"
                href={state.verificationUrl ?? '#'}
                target="_blank"
                rel="noreferrer"
              >
                {state.verificationUrl}
              </a>
              <p>2. Enter this code:</p>
              <div className="rounded-lg bg-[var(--accent)] p-3 text-center text-2xl font-bold tracking-widest text-white">
                {state.userCode}
              </div>
              <p className="text-xs text-[var(--text-dim)]">Waiting for Google…</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-red-500">
              OAuth {state.oauthStatus}.{' '}
              <button type="button" onClick={() => start.mutate()}>
                Retry
              </button>
            </p>
          )}
        </Card>
      </div>
    )
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
  const { data, isLoading, isError } = useQuery({ queryKey: ['albums'], queryFn: api.getAlbums })
  const [selected, setSelected] = useState<string | null>(null)
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-bold">Photo slideshow</h1>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          Pick a shared album to play on the dashboard.
        </p>
        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-[var(--text-dim)]/20">
          {isLoading ? (
            <div className="p-3 text-sm text-[var(--text-dim)]">Loading albums…</div>
          ) : isError ? (
            <div className="p-3 text-sm text-red-500">Could not load albums.</div>
          ) : (
            (data?.albums ?? []).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelected(a.id)}
                className={`block w-full px-3 py-2 text-left text-sm ${selected === a.id ? 'bg-[var(--accent)] text-white' : 'hover:bg-gray-50'}`}
              >
                {a.title}
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => onDone(null)}>
            Skip
          </Button>
          <Button className="flex-1" disabled={!selected} onClick={() => onDone(selected)}>
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
  const save = useMutation({
    mutationFn: async () => {
      for (const person of state.people.filter((p) => p.name.trim().length > 0)) {
        await api.putPerson(person.id, { name: person.name, color: person.color })
      }
      await api.putSystem({
        firstRunComplete: true,
        weatherDefault: state.weather,
        photosAlbumId: state.albumId,
      })
    },
    onSuccess: onComplete,
  })
  useQuery({ queryKey: ['system'], queryFn: api.getSystem }) // warm cache
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
