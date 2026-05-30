import { useEffect, useMemo, useState } from 'react'

export interface SlideshowConfig {
  source?: 'local' | 'google-photos' | 'ambient'
  intervalMs?: number
  size?: 'w1200-h1200' | 'w800-h800' | 'w2000-h2000'
  shuffle?: boolean
}

export interface SlideshowData {
  baseUrls: string[]
  fetchedAt: number
}

const shuffleArr = <T,>(arr: T[]): T[] => {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
}

export const SlideshowView = ({
  config,
  data,
}: {
  config: SlideshowConfig
  data: SlideshowData | undefined
}) => {
  const [index, setIndex] = useState(0)
  const interval = config.intervalMs ?? 8000
  const size = config.size ?? 'w1200-h1200'
  const source = config.source ?? 'local'
  const shuffle = config.shuffle ?? true

  // Shuffle once per backend tick. fetchedAt changes every poll so the order
  // re-randomises without forcing a re-shuffle on unrelated re-renders.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keying on fetchedAt is intentional
  const images = useMemo(() => {
    const raw = data?.baseUrls ?? []
    return shuffle ? shuffleArr(raw) : raw
  }, [data?.fetchedAt, shuffle])

  useEffect(() => {
    if (images.length === 0) return
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), interval)
    return () => clearInterval(t)
  }, [images.length, interval])

  if (images.length === 0) {
    const hint =
      source === 'local'
        ? 'Drop photos into the local photos folder.'
        : source === 'ambient'
          ? 'Open the Google Photos app and pick photo sources for this dashboard.'
          : 'Slideshow source not configured.'
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center text-[var(--text-dim)]">
        <span className="text-sm font-semibold">No photos yet</span>
        <span className="text-xs">{hint}</span>
      </div>
    )
  }
  // Google Photos baseUrls (Library + Ambient APIs) need the `=w...-h...`
  // suffix; locally-served URLs are used as-is.
  const url = source === 'local' ? (images[index] ?? '') : `${images[index]}=${size}`
  return (
    <div
      className="h-full w-full bg-cover bg-center transition-opacity duration-700"
      style={{ backgroundImage: `url("${url}")` }}
      role="img"
      aria-label="Family photo"
    />
  )
}
