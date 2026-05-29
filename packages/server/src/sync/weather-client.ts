import { fetch } from 'undici'

export interface WeatherInput {
  lat: number
  lon: number
  unit: 'celsius' | 'fahrenheit'
}

export interface WeatherData {
  current: { temperature: number; weatherCode: number; isDay: boolean; windSpeed: number }
  today: { high: number; low: number }
  fetchedAt: number
}

export const fetchWeather = async (input: WeatherInput): Promise<WeatherData> => {
  const params = new URLSearchParams({
    latitude: String(input.lat),
    longitude: String(input.lon),
    current: 'temperature_2m,weather_code,is_day,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    temperature_unit: input.unit,
    wind_speed_unit: 'mph',
    timezone: 'auto',
    forecast_days: '1',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`open-meteo failed: ${res.status}`)
  const j = (await res.json()) as {
    current: {
      temperature_2m: number
      weather_code: number
      is_day: number
      wind_speed_10m: number
    }
    daily: { temperature_2m_min: number[]; temperature_2m_max: number[] }
  }
  return {
    current: {
      temperature: j.current.temperature_2m,
      weatherCode: j.current.weather_code,
      isDay: j.current.is_day === 1,
      windSpeed: j.current.wind_speed_10m,
    },
    today: {
      high: j.daily.temperature_2m_max[0] ?? 0,
      low: j.daily.temperature_2m_min[0] ?? 0,
    },
    fetchedAt: Date.now(),
  }
}
