import { useEffect, useState } from 'react'

export interface SlideshowConfig {
  intervalMs?: number
  size?: 'w1200-h1200' | 'w800-h800' | 'w2000-h2000'
}

export interface SlideshowData {
  baseUrls: string[]
  fetchedAt: number
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
  const images = data?.baseUrls ?? []

  useEffect(() => {
    if (images.length === 0) return
    const t = setInterval(() => setIndex((i) => (i + 1) % images.length), interval)
    return () => clearInterval(t)
  }, [images.length, interval])

  if (images.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-dim)]">
        No photos yet
      </div>
    )
  }
  const url = `${images[index]}=${size}`
  return (
    <div
      className="h-full w-full bg-cover bg-center transition-opacity duration-700"
      style={{ backgroundImage: `url(${url})` }}
      role="img"
      aria-label="Family photo"
    />
  )
}
