import { Button, Card, Input } from '@dashboard/ui'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { type ProposedEvent, api } from '../api'
import { isImportable, localToday, prepareUpload, toEventSpan } from '../import-events'

interface Draft extends ProposedEvent {
  key: number
  include: boolean
  calendarId: string
}

const selectClass = 'rounded-lg border border-[var(--text-dim)]/30 bg-white px-2 py-2 text-sm'

/** AI ingress: drop the flyers, school calendars, PDFs and invitation photos
 * the family gets handed, let Claude read the events off them, then review
 * and add the ones you want. Nothing is written until "Add" — Claude's read
 * is a proposal, not a calendar entry. */
export const ImportEvents = () => {
  const system = useQuery({ queryKey: ['system'], queryFn: api.getSystem })
  const calendarsQuery = useQuery({ queryKey: ['calendars'], queryFn: api.getCalendars })
  const calendars = calendarsQuery.data?.calendars ?? []
  const defaultCalendarId = (calendars.find((c) => c.visible) ?? calendars[0])?.id ?? ''

  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [notes, setNotes] = useState<string | null>(null)
  const [added, setAdded] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = Array.from(list).filter(isImportable)
    setFiles((prev) => [...prev, ...next])
    setAdded(null)
  }

  const extract = useMutation({
    mutationFn: async () => {
      const uploads = await Promise.all(files.map(prepareUpload))
      return api.extractEvents({
        files: uploads,
        today: localToday(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    },
    onSuccess: (result) => {
      setDrafts(
        result.events.map((e, i) => ({
          ...e,
          key: i,
          include: true,
          calendarId: defaultCalendarId,
        })),
      )
      setNotes(result.notes)
    },
  })

  const save = useMutation({
    mutationFn: async (rows: Draft[]) => {
      for (const d of rows) {
        const span = toEventSpan(d)
        if (!span) throw new Error(`invalid dates on ${d.title}`)
        await api.createEvent({
          calendarId: d.calendarId,
          title: d.title.trim(),
          ...(d.location ? { location: d.location } : {}),
          ...(d.description ? { description: d.description } : {}),
          ...span,
        })
        // Drop each row as soon as it lands so a retry after a partial
        // failure doesn't add the earlier ones twice.
        setDrafts((prev) => prev.filter((p) => p.key !== d.key))
      }
      return rows.length
    },
    onSuccess: (n) => {
      setAdded(n)
      setDrafts([])
      setNotes(null)
      setFiles([])
    },
  })

  const update = (key: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))

  const isValid = (d: Draft) => d.title.trim().length > 0 && d.calendarId && toEventSpan(d)
  const selected = drafts.filter((d) => d.include)
  const canSave = selected.length > 0 && selected.every(isValid) && !save.isPending

  if (system.data && !system.data.aiImportConfigured) {
    return (
      <div className="p-6">
        <Card>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
            Import events
          </h3>
          <p className="mt-3 text-sm">
            AI import isn't set up yet. Add an Anthropic API key to the server's env file and
            restart:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-100 p-3 text-xs">
            {
              'sudo nano /etc/dashboard/env\n# ANTHROPIC_API_KEY=sk-ant-...\nsudo systemctl restart dashboard'
            }
          </pre>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-6">
      <Card>
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
          Import events
        </h3>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          Drop in school calendars, sports schedules, party invitations — PDFs or photos. Claude
          reads the dates off them and you pick what to add.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            addFiles(e.dataTransfer.files)
          }}
          className={`mt-4 flex min-h-32 w-full flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-sm ${dragging ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--text-dim)]/30'}`}
        >
          <span className="font-semibold">Drop files here or tap to choose</span>
          <span className="text-[var(--text-dim)]">PDF, JPG, PNG, HEIC — up to 10 at once</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/*,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {files.length > 0 ? (
          <ul className="mt-3 space-y-1 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2">
                <span className="truncate">{f.name}</span>
                <Button
                  variant="ghost"
                  onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-4 flex items-center gap-3">
          <Button
            disabled={files.length === 0 || files.length > 10 || extract.isPending}
            onClick={() => extract.mutate()}
          >
            {extract.isPending ? 'Reading…' : 'Find events'}
          </Button>
          {files.length > 10 ? (
            <span className="text-sm text-red-600">Ten files at a time, please.</span>
          ) : null}
          {extract.error ? (
            <span className="text-sm text-red-600">{extract.error.message}</span>
          ) : null}
          {added !== null ? (
            <span className="text-sm text-green-700">
              Added {added} event{added === 1 ? '' : 's'}.
            </span>
          ) : null}
        </div>
      </Card>

      {extract.isSuccess && (drafts.length > 0 || notes) ? (
        <Card>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-dim)]">
            Found {drafts.length} event{drafts.length === 1 ? '' : 's'}
          </h3>
          {notes ? (
            <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notes}</p>
          ) : null}
          {calendars.length === 0 ? (
            <p className="mt-2 text-sm text-red-600">
              Connect a Google account in Settings first — events need a calendar to go on.
            </p>
          ) : null}
          <div className="mt-3 space-y-3">
            {drafts.map((d) => (
              <div
                key={d.key}
                className={`space-y-2 rounded-xl border p-3 ${d.include && !isValid(d) ? 'border-red-400' : 'border-gray-200'} ${d.include ? '' : 'opacity-50'}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={d.include}
                    onChange={(e) => update(d.key, { include: e.target.checked })}
                    className="h-5 w-5"
                    aria-label="Include this event"
                  />
                  <Input
                    value={d.title}
                    onChange={(e) => update(d.key, { title: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    label="Date"
                    type="date"
                    value={d.date}
                    onChange={(e) => update(d.key, { date: e.target.value })}
                  />
                  {d.endDate !== null ? (
                    <Input
                      label="Until"
                      type="date"
                      value={d.endDate}
                      onChange={(e) => update(d.key, { endDate: e.target.value || null })}
                    />
                  ) : null}
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={d.allDay}
                      onChange={(e) =>
                        update(d.key, {
                          allDay: e.target.checked,
                          ...(e.target.checked ? {} : { startTime: d.startTime ?? '09:00' }),
                        })
                      }
                    />
                    All day
                  </label>
                  {!d.allDay ? (
                    <>
                      <Input
                        label="Start"
                        type="time"
                        value={d.startTime ?? ''}
                        onChange={(e) => update(d.key, { startTime: e.target.value || null })}
                      />
                      <Input
                        label="End"
                        type="time"
                        value={d.endTime ?? ''}
                        onChange={(e) => update(d.key, { endTime: e.target.value || null })}
                      />
                    </>
                  ) : null}
                  <select
                    value={d.calendarId}
                    onChange={(e) => update(d.key, { calendarId: e.target.value })}
                    className={selectClass}
                    aria-label="Calendar"
                  >
                    {calendars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary}
                      </option>
                    ))}
                  </select>
                </div>
                {d.location ? (
                  <p className="text-sm text-[var(--text-dim)]">📍 {d.location}</p>
                ) : null}
                {d.description ? (
                  <p className="whitespace-pre-line text-sm text-[var(--text-dim)]">
                    {d.description}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          {drafts.length > 0 ? (
            <div className="mt-4 flex items-center gap-3">
              <Button disabled={!canSave} onClick={() => save.mutate(selected)}>
                {save.isPending
                  ? 'Adding…'
                  : `Add ${selected.length} event${selected.length === 1 ? '' : 's'}`}
              </Button>
              {save.error ? (
                <span className="text-sm text-red-600">
                  Some events couldn't be saved. Try again.
                </span>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
