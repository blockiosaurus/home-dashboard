type Job = () => unknown

export interface Scheduler {
  every: (intervalMs: number, job: Job) => void
  stop: () => void
}

export const createScheduler = (): Scheduler => {
  const timers: NodeJS.Timeout[] = []
  return {
    every: (intervalMs, job) => {
      const run = () => {
        try {
          // Wrap in Promise.resolve so both sync throws and async rejections
          // land in the same catch. Otherwise an unhandled rejection from an
          // async job will crash the process.
          Promise.resolve(job()).catch((err) =>
            console.error('scheduled job rejected', err),
          )
        } catch (err) {
          console.error('scheduled job failed', err)
        }
      }
      const t = setInterval(run, intervalMs)
      timers.push(t)
    },
    stop: () => {
      for (const t of timers) clearInterval(t)
      timers.length = 0
    },
  }
}
