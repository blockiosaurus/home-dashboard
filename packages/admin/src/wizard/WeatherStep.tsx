import { Button } from '@dashboard/ui'
import { useState } from 'react'
import { LocationPicker } from '../components/LocationPicker'
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
  const [location, setLocation] = useState(weather.location)
  const [unit, setUnit] = useState(weather.unit)

  return (
    <WizardCard
      title="Weather location"
      subtitle="Used for the weather widget on the dashboard."
      footer={
        <div>
          <WizardFooter
            onBack={onBack}
            onContinue={() => onContinue({ location, unit })}
            continueDisabled={location === null}
          />
          {location === null ? (
            <p className="mt-2 text-center text-xs text-red-600">Pick a location to continue</p>
          ) : null}
        </div>
      }
    >
      <div className="mt-4 space-y-4">
        <LocationPicker value={location} onChange={setLocation} />
        <div className="flex gap-3">
          <Button
            variant={unit === 'fahrenheit' ? 'primary' : 'secondary'}
            className="flex-1 py-2"
            onClick={() => setUnit('fahrenheit')}
          >
            °F
          </Button>
          <Button
            variant={unit === 'celsius' ? 'primary' : 'secondary'}
            className="flex-1 py-2"
            onClick={() => setUnit('celsius')}
          >
            °C
          </Button>
        </div>
      </div>
    </WizardCard>
  )
}
