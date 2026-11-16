import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseJson, toGeminiContents, toGeminiSchema } from '../supabase/functions/_shared/ai.ts'

describe('Gemini adapter', () => {
  it('converts JSON Schema to the Gemini schema subset', () => {
    const s = toGeminiSchema({ type: 'object', required: ['items'], properties: {
      items: { type: 'array', maxItems: 3, items: { type: 'object', required: ['name'], properties: { name: { type: 'string', description: 'n' }, ref_id: { type: ['string', 'null'] }, unit: { type: 'string', enum: ['g', 'ml'] }, ok: { type: 'boolean' }, kcal: { type: 'number' } } } } } })
    expect(s.type).toBe('OBJECT'); expect(s.required).toEqual(['items'])
    const item = s.properties.items.items
    expect(s.properties.items).toMatchObject({ type: 'ARRAY', maxItems: 3 })
    expect(item.properties.ref_id).toEqual({ type: 'STRING', nullable: true })
    expect(item.properties.unit).toEqual({ type: 'STRING', enum: ['g', 'ml'] })
    expect(item.properties.name).toEqual({ type: 'STRING', description: 'n' })
    expect(JSON.stringify(s)).not.toContain('"null"')
  })
  it('maps chat turns and images', () => {
    const c = toGeminiContents([{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } }, { type: 'text', text: 'hi' }] }, { role: 'assistant', content: 'yo' }])
    expect(c[0]).toEqual({ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } }, { text: 'hi' }] })
    expect(c[1]).toEqual({ role: 'model', parts: [{ text: 'yo' }] })
  })
  it('reads JSON even when wrapped', () => {
    expect(parseJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(parseJson('Here you go: {"a":{"b":2}} thanks')).toEqual({ a: { b: 2 } })
    expect(() => parseJson('nope')).toThrow()
  })
})

describe('scheduler helpers', () => {
  it('weekdayIndex is Monday-based and timezone aware', async () => {
    const { weekdayIndex } = await import('../supabase/functions/_shared/util.ts')
    expect(weekdayIndex(new Date('2026-11-16T12:00:00Z'), 'Asia/Kolkata')).toBe(0) // a Monday
    expect(weekdayIndex(new Date('2026-11-22T12:00:00Z'), 'Asia/Kolkata')).toBe(6) // the Sunday
    // 20:00 UTC Sunday is already Monday in Kolkata
    expect(weekdayIndex(new Date('2026-11-22T20:00:00Z'), 'Asia/Kolkata')).toBe(0)
    expect(weekdayIndex(new Date('2026-11-22T20:00:00Z'), 'America/New_York')).toBe(6)
  })
})

describe('AI transport resilience', () => {
  const realFetch = globalThis.fetch
  const okBody = { candidates: [{ content: { parts: [{ text: 'hello' }] } }] }
  function stub(responses: { status: number; body?: any; headers?: Record<string, string> }[]) {
    let i = 0
    globalThis.fetch = (async () => {
      const r = responses[Math.min(i++, responses.length - 1)]
      return new Response(JSON.stringify(r.body ?? { error: { message: 'busy' } }), { status: r.status, headers: r.headers })
    }) as typeof fetch
    return () => i
  }
  beforeEach(() => { (globalThis as any).Deno = { env: { get: (k: string) => (k === 'GEMINI_API_KEY' ? 'test-key' : undefined) } } })
  afterEach(() => { globalThis.fetch = realFetch; delete (globalThis as any).Deno })

  it('retries a 503 overload and succeeds', async () => {
    const { ai } = await import('../supabase/functions/_shared/ai.ts')
    const calls = stub([{ status: 503 }, { status: 503 }, { status: 200, body: okBody }])
    await expect(ai({ system: 's', messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe('hello')
    expect(calls()).toBe(3)
  }, 15000)

  it('gives up after repeated overload, with a readable message and no raw JSON', async () => {
    const { ai } = await import('../supabase/functions/_shared/ai.ts')
    stub([{ status: 503 }])
    await expect(ai({ system: 's', messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toThrow(/busy right now/i)
  }, 15000)

  it('does not retry a 400, and explains a bad key or model', async () => {
    const { ai, friendlyError } = await import('../supabase/functions/_shared/ai.ts')
    const calls = stub([{ status: 400, body: { error: { message: 'bad request' } } }])
    await expect(ai({ system: 's', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow()
    expect(calls()).toBe(1)
    expect(friendlyError(403, '', 'm')).toMatch(/key was rejected/i)
    expect(friendlyError(404, 'model not found', 'gemini-x')).toMatch(/not available on your key/i)
    expect(friendlyError(429, '', 'm')).toMatch(/rate limited/i)
  }, 15000)
})
