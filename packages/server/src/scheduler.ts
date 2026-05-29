type Job = () => unknown

export interface Scheduler {
  every: (intervalMs: number, job: Job) => void
  stop: () => void
}

export const createScheduler = (): Scheduler => {
  const timers: NodeJS.Timeout[] = []
  return {
    every: (intervalMs, job) => {
      const t = setInterval(() => {
        try {
          void job()
        } catch (err) {
          console.error('scheduled job failed', err)
        }
      }, intervalMs)
      timers.push(t)
    },
    stop: () => {
      for (const t of timers) clearInterval(t)
      timers.length = 0
    },
  }
}
