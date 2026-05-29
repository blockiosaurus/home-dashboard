import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWeather } from './weather-client'

const fetchMock = vi.fn()
vi.mock('undici', () => ({ fetch: (...a: unknown[]) => fetchMock(...a) }))

afterEach(() => fetchMock.mockReset())

describe('fetchWeather', () => {
  it('queries Open-Meteo and normalises the response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          current: { temperature_2m: 72.3, weather_code: 0, is_day: 1, wind_speed_10m: 5 },
          daily: { time: ['2026-05-29'], temperature_2m_min: [60], temperature_2m_max: [78] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const out = await fetchWeather({ lat: 40.7, lon: -74.0, unit: 'fahrenheit' })
    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain('latitude=40.7')
    expect(url).toContain('longitude=-74')
    expect(url).toContain('temperature_unit=fahrenheit')
    expect(out.current.temperature).toBe(72.3)
    expect(out.current.isDay).toBe(true)
    expect(out.today.high).toBe(78)
    expect(out.today.low).toBe(60)
  })
})
