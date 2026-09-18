import { Button, Input } from '@dashboard/ui'
import { useState } from 'react'
import { WizardCard, WizardFooter } from './WizardCard'
import type { WeatherDraft } from './state'

export const WeatherStep = ({
  weather,
  onBack,
  onContinue,
}: {
  weather: WeatherDraft
  onBack: () => void
  onContinue: (next: WeatherDraft) => void
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
    <WizardCard
      title="Weather location"
      subtitle="Used for the weather widget on the dashboard."
      footer={<WizardFooter onBack={onBack} onContinue={() => onContinue(draft)} />}
    >
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
          onChange={(e) => setDraft({ ...draft, unit: e.target.value as 'celsius' | 'fahrenheit' })}
          className="w-full rounded-lg border border-[var(--text-dim)]/30 bg-white px-3 py-2 text-sm"
        >
          <option value="fahrenheit">Fahrenheit</option>
          <option value="celsius">Celsius</option>
        </select>
        <Button variant="ghost" className="w-full" onClick={useGeolocation}>
          Use this device's location
        </Button>
      </div>
    </WizardCard>
  )
}
