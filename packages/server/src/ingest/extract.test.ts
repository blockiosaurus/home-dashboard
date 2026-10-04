import { describe, expect, it, vi } from 'vitest'
import { type ExtractClient, ExtractError, extractEvents } from './extract'

const fakeClient = (response: unknown) => {
  const create = vi.fn().mockResolvedValue(response)
  return { client: { beta: { messages: { create } } } as unknown as ExtractClient, create }
}

const ctx = { today: '2026-10-04', timezone: 'America/Chicago' }

const event = {
  title: 'Picture day',
  date: '2026-10-15',
  endDate: null,
  startTime: null,
  endTime: null,
  allDay: true,
  location: null,
  description: 'Wear the blue shirt',
}

describe('extractEvents', () => {
  it('sends PDFs as documents and images as images, and parses the JSON reply', async () => {
    const { client, create } = fakeClient({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify({ events: [event], notes: null }) }],
    })
    const result = await extractEvents(
      client,
      [
        { name: 'flyer.pdf', mediaType: 'application/pdf', data: 'cGRm' },
        { name: 'invite.jpg', mediaType: 'image/jpeg', data: 'anBn' },
      ],
      ctx,
    )
    expect(result).toEqual({ events: [event], notes: null })

    const params = create.mock.calls[0]?.[0]
    const types = params.messages[0].content.map((b: { type: string }) => b.type)
    expect(types).toEqual(['text', 'document', 'text', 'image', 'text'])
    expect(params.messages[0].content.at(-1).text).toContain('2026-10-04')
    expect(params.output_config.format.type).toBe('json_schema')
  })

  it('raises ExtractError on a refusal', async () => {
    const { client } = fakeClient({ stop_reason: 'refusal', content: [] })
    await expect(extractEvents(client, [], ctx)).rejects.toBeInstanceOf(ExtractError)
  })

  it('raises ExtractError when the reply fails validation', async () => {
    const { client } = fakeClient({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: JSON.stringify({ events: [{ ...event, date: 'Oct 15' }], notes: null }),
        },
      ],
    })
    await expect(extractEvents(client, [], ctx)).rejects.toBeInstanceOf(ExtractError)
  })
})
