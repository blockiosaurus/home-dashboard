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
            We use Google Calendar (read + write) and Google Photos (read) so the dashboard
            can show events and a slideshow.
          </p>
          {state.oauthStatus === 'idle' ? (
            <Button className="mt-4 w-full" onClick={() => start.mutate()}>
              Start
            </Button>
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
              OAuth {state.oauthStatus}. <button onClick={() => start.mutate()}>Retry</button>
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
    return (
      <AlbumStep
        onDone={(albumId) => setState((s) => ({ ...s, albumId, step: 'done' }))}
      />
    )

  // step === 'done'
  return <DoneStep state={state} onComplete={() => navigate('/editor')} />
}

// Placeholders that Task 12 will fill in. Right now they just render "Coming next."
const PeopleStep = ({
  people,
  onDone,
}: {
  people: WizardState['people']
  onDone: (next: WizardState['people']) => void
}) => (
  <div className="p-6">
    <p className="mb-4 text-sm">People step (Task 12).</p>
    <Button onClick={() => onDone(people)}>Continue</Button>
  </div>
)

const WeatherStep = ({
  weather,
  onDone,
}: {
  weather: WizardState['weather']
  onDone: (next: WizardState['weather']) => void
}) => (
  <div className="p-6">
    <p className="mb-4 text-sm">Weather step (Task 12).</p>
    <Button onClick={() => onDone(weather)}>Continue</Button>
  </div>
)

const AlbumStep = ({ onDone }: { onDone: (id: string | null) => void }) => (
  <div className="p-6">
    <p className="mb-4 text-sm">Album step (Task 12).</p>
    <Button onClick={() => onDone(null)}>Skip</Button>
  </div>
)

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
