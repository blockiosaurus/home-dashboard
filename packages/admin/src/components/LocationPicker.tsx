import { Button, Input } from '@dashboard/ui'
import { useEffect, useRef, useState } from 'react'

/** A resolved location: latitude/longitude plus a human-readable label shown
 * back to the user (e.g. "Springfield, Illinois" or a device-location /
 * manual-coordinates fallback). Exported so both the wizard's weather step
 * and the weather widget config form (Task 8) can share one value shape. */
export interface LocationValue {
  lat: number
  lon: number
  label: string
}

interface GeocodeResult {
  id: number
  name: string
  latitude: number
  longitude: number
  admin1?: string
  country?: string
}

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 300

const regionOf = (r: GeocodeResult) => r.admin1 || r.country || ''

const rowLabel = (r: GeocodeResult) =>
  [r.name, r.admin1, r.country].filter((part): part is string => Boolean(part)).join(', ')

/** Self-contained location search + picker. Debounces a free-text search
 * against the Open-Meteo geocoding API (no key, CORS-enabled), falls back to
 * a manual lat/lon disclosure, and offers the device's own location when the
 * page is loaded over a secure context. Renders the current selection as a
 * chip with a "Change" action once one is set. */
export const LocationPicker = ({
  value,
  onChange,
}: {
  value: LocationValue | null
  onChange: (value: LocationValue | null) => void
}) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [showCoords, setShowCoords] = useState(false)
  const [manualLat, setManualLat] = useState('')
  const [manualLon, setManualLon] = useState('')
  const [geoError, setGeoError] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([])
      setSearchError(false)
      setSearching(false)
      return
    }
    setSearching(true)
    setSearchError(false)
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      try {
        const url = `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}&count=6&language=en&format=json`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`geocode search failed (${res.status})`)
        const body = (await res.json()) as { results?: GeocodeResult[] }
        if (requestId.current !== id) return
        setResults(body.results ?? [])
      } catch {
        if (requestId.current !== id) return
        setResults([])
        setSearchError(true)
      } finally {
        if (requestId.current === id) setSearching(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const selectResult = (r: GeocodeResult) => {
    const region = regionOf(r)
    onChange({
      lat: r.latitude,
      lon: r.longitude,
      label: region ? `${r.name}, ${region}` : r.name,
    })
    setQuery('')
    setResults([])
  }

  const useDeviceLocation = () => {
    setGeoError(false)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: 'Current location',
        })
      },
      () => setGeoError(true),
    )
  }

  const applyManualCoords = () => {
    const lat = Number(manualLat)
    const lon = Number(manualLon)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
    onChange({ lat, lon, label: `${lat.toFixed(2)}, ${lon.toFixed(2)}` })
    setManualLat('')
    setManualLon('')
    setShowCoords(false)
  }

  if (value) {
    return (
      <div className="flex min-h-10 items-center gap-2 rounded-lg bg-[var(--accent)]/10 px-3 py-2">
        <span className="flex-1 truncate text-sm font-semibold">{value.label}</span>
        <Button variant="ghost" className="py-2" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Input
        label="Search for your town or city"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. Springfield"
      />
      {searching ? <p className="text-xs text-[var(--text-dim)]">Searching…</p> : null}
      {searchError ? (
        <p className="text-xs text-red-600">
          Couldn't search right now. Check the connection and try again.
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="divide-y divide-[var(--text-dim)]/10 overflow-hidden rounded-lg border border-[var(--text-dim)]/20">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => selectResult(r)}
                className="block min-h-10 w-full px-3 py-2 text-left text-sm hover:bg-[var(--accent)]/10"
              >
                {rowLabel(r)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {typeof window !== 'undefined' && window.isSecureContext ? (
        <Button variant="ghost" className="w-full py-2" onClick={useDeviceLocation}>
          Use this device's location
        </Button>
      ) : null}
      {geoError ? (
        <p className="text-xs text-red-600">
          Your browser blocked location access. Search for your town instead.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setShowCoords((s) => !s)}
        className="min-h-10 text-xs text-[var(--accent)] underline decoration-dotted"
      >
        Enter coordinates instead
      </button>
      {showCoords ? (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Latitude"
            type="number"
            value={manualLat}
            onChange={(e) => setManualLat(e.target.value)}
          />
          <Input
            label="Longitude"
            type="number"
            value={manualLon}
            onChange={(e) => setManualLon(e.target.value)}
          />
          <Button variant="secondary" className="col-span-2" onClick={applyManualCoords}>
            Use these coordinates
          </Button>
        </div>
      ) : null}
    </div>
  )
}
