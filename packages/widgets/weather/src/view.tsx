export interface WeatherConfig {
  lat: number
  lon: number
  unit?: 'celsius' | 'fahrenheit'
  label?: string
}

export interface WeatherData {
  current: { temperature: number; weatherCode: number; isDay: boolean; windSpeed: number }
  today: { high: number; low: number }
  fetchedAt: number
}

const codeToEmoji = (code: number, isDay: boolean): string => {
  if (code === 0) return isDay ? '☀️' : '🌙'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌧️'
  if (code <= 99) return '⛈️'
  return '☁️'
}

export const WeatherView = ({
  config,
  data,
}: {
  config: WeatherConfig
  data: WeatherData | undefined
}) => {
  const unit = config.unit === 'celsius' ? '°C' : '°F'
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-dim)]">
        Loading weather…
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center p-3 text-center">
      <div className="text-4xl leading-none">{codeToEmoji(data.current.weatherCode, data.current.isDay)}</div>
      <div className="mt-1 text-3xl font-extrabold" style={{ color: 'var(--accent)' }}>
        {Math.round(data.current.temperature)}
        {unit}
      </div>
      <div className="text-xs text-[var(--text-dim)]">
        H {Math.round(data.today.high)}
        {unit} · L {Math.round(data.today.low)}
        {unit}
      </div>
      {config.label ? <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--text-dim)]">{config.label}</div> : null}
    </div>
  )
}
