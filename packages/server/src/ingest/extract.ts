import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

/** File types Claude reads natively: PDFs as document blocks, the rest as
 * image blocks. Anything else (HEIC, Word docs) is rejected up front. */
export const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
export const SUPPORTED_MEDIA_TYPES = ['application/pdf', ...IMAGE_MEDIA_TYPES] as const
export type SupportedMediaType = (typeof SUPPORTED_MEDIA_TYPES)[number]

export interface IngestFile {
  name: string
  mediaType: SupportedMediaType
  /** Base64, no data: prefix. */
  data: string
}

export interface ExtractContext {
  /** The household's local date (YYYY-MM-DD) so "next Tuesday" or a
   * year-less "Oct 12" resolves to the right year. */
  today: string
  /** IANA zone of the browser that uploaded the files; context only. */
  timezone: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Times stay as local wall-clock strings: the admin's browser, which runs in
 * the household's timezone, turns them into epoch ms. The server can't —
 * the Pi's clock zone isn't necessarily the family's. */
export const ExtractedEventSchema = z.object({
  title: z.string().min(1),
  date: z.string().regex(DATE),
  endDate: z.string().regex(DATE).nullable(),
  startTime: z.string().regex(TIME).nullable(),
  endTime: z.string().regex(TIME).nullable(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  description: z.string().nullable(),
})
export type ExtractedEvent = z.infer<typeof ExtractedEventSchema>

const ExtractResultSchema = z.object({
  events: z.array(ExtractedEventSchema),
  notes: z.string().nullable(),
})
export type ExtractResult = z.infer<typeof ExtractResultSchema>

const nullable = (type: 'string') => ({ anyOf: [{ type }, { type: 'null' }] })

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events', 'notes'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'title',
          'date',
          'endDate',
          'startTime',
          'endTime',
          'allDay',
          'location',
          'description',
        ],
        properties: {
          title: { type: 'string', description: 'Short calendar title' },
          date: { type: 'string', description: 'Start date, YYYY-MM-DD' },
          endDate: {
            ...nullable('string'),
            description: 'Last day (inclusive) for multi-day events, YYYY-MM-DD; else null',
          },
          startTime: { ...nullable('string'), description: '24h HH:MM, null if all-day' },
          endTime: { ...nullable('string'), description: '24h HH:MM, null if unknown' },
          allDay: { type: 'boolean' },
          location: nullable('string'),
          description: {
            ...nullable('string'),
            description: 'Useful details: what to bring, dress code, contact, RSVP-by',
          },
        },
      },
    },
    notes: {
      ...nullable('string'),
      description: 'Anything ambiguous the family should double-check; null if none',
    },
  },
} as const

const SYSTEM = `You read flyers, school calendars, schedules, invitations and similar documents for a family's shared calendar, and pull out every dated event.

- One entry per occurrence. A recurring schedule ("every Tuesday in October", a season of games) becomes one entry per date listed or implied, as long as the dates can be determined from the document.
- Use the provided "today" to fill in a missing year: pick the next upcoming occurrence.
- Times are local wall-clock 24h HH:MM exactly as printed. Do not convert time zones.
- If no time is given, or the event spans whole days (holidays, no-school days, camps listed by day), set allDay true and both times null.
- Multi-day events with a single time span (e.g. a 3-day tournament) use date and endDate.
- Titles are short and specific ("Emma's soccer vs. Rovers", "No school — teacher in-service"), not the document's headline.
- Skip things that are not events: deadlines are events only if they are something to remember on that day (e.g. "Permission slip due").
- Never invent dates or times. If something is unclear, leave the field null and mention it in notes.
- If the documents contain no events, return an empty list and say why in notes.`

/** Narrow slice of the SDK client the extractor uses, so tests can stub it. */
export type ExtractClient = Pick<Anthropic, 'beta'>

export class ExtractError extends Error {}

export const createAnthropicClient = (apiKey: string): ExtractClient => new Anthropic({ apiKey })

export const extractEvents = async (
  client: ExtractClient,
  files: IngestFile[],
  ctx: ExtractContext,
): Promise<ExtractResult> => {
  const content: Anthropic.Beta.BetaContentBlockParam[] = []
  for (const f of files) {
    content.push({ type: 'text', text: `File: ${f.name}` })
    if (f.mediaType === 'application/pdf') {
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: f.data },
      })
    } else {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: f.mediaType, data: f.data },
      })
    }
  }
  content.push({
    type: 'text',
    text: `Today is ${ctx.today} (timezone ${ctx.timezone}). Extract the calendar events from the files above.`,
  })

  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    // On a safety decline, let the API retry on its recommended fallback
    // model instead of failing the upload.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content }],
  })

  if (response.stop_reason === 'refusal') {
    throw new ExtractError('Claude declined to read these files.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ExtractError('Too many events in one go — try uploading fewer files at a time.')
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new ExtractError('Claude returned an unreadable response.')
  }
  const parsed = ExtractResultSchema.safeParse(json)
  if (!parsed.success) {
    throw new ExtractError('Claude returned events in an unexpected shape.')
  }
  return parsed.data
}
