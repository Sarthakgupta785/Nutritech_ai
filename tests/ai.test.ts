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

describe('OpenAI-compatible provider (Ollama, OpenRouter, Groq, Mistral)', () => {
  const realFetch = globalThis.fetch
  let seen: any[] = []
  function stubEnv(vars: Record<string, string>) { (globalThis as any).Deno = { env: { get: (k: string) => vars[k] } } }
  function stubFetch(responses: { status: number; body: any }[]) {
    let i = 0
    seen = []
    globalThis.fetch = (async (url: any, init: any) => {
      seen.push({ url: String(url), body: JSON.parse(init.body), headers: init.headers })
      const r = responses[Math.min(i++, responses.length - 1)]
      return new Response(JSON.stringify(r.body), { status: r.status })
    }) as typeof fetch
  }
  afterEach(() => { globalThis.fetch = realFetch; delete (globalThis as any).Deno })

  const reply = (content: string) => ({ status: 200, body: { choices: [{ message: { content } }] } })

  it('sends images as data URLs and reads the reply', async () => {
    const { ai } = await import('../supabase/functions/_shared/ai.ts')
    stubEnv({ OPENAI_BASE_URL: 'http://localhost:11434/v1/', AI_MODEL: 'qwen3-vl:8b' })
    stubFetch([reply('a plate of dal')])
    const out = await ai({ system: 'sys', messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: 'what is this' }] }] })
    expect(out).toBe('a plate of dal')
    expect(seen[0].url).toBe('http://localhost:11434/v1/chat/completions')   // trailing slash handled
    expect(seen[0].body.model).toBe('qwen3-vl:8b')
    expect(seen[0].body.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(seen[0].body.messages[1].content[0]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } })
  }, 15000)

  it('asks for JSON and states the schema, since strict mode is not portable', async () => {
    const { ai } = await import('../supabase/functions/_shared/ai.ts')
    stubEnv({ OPENAI_BASE_URL: 'https://openrouter.ai/api/v1', OPENAI_API_KEY: 'sk-x', AI_MODEL: 'some/model' })
    stubFetch([reply('```json\n{"grams": 150}\n```')])
    const tool = { name: 't', description: 'd', input_schema: { type: 'object', properties: { grams: { type: 'number' } } } }
    await expect(ai({ system: 'sys', messages: [{ role: 'user', content: 'hi' }], tool })).resolves.toEqual({ grams: 150 })
    expect(seen[0].body.response_format).toEqual({ type: 'json_object' })
    expect(seen[0].body.messages[0].content).toContain('"grams"')      // schema reached the prompt
    expect(seen[0].headers.Authorization).toBe('Bearer sk-x')
  }, 15000)

  it('works against a local Ollama with no key at all', async () => {
    const { ai } = await import('../supabase/functions/_shared/ai.ts')
    stubEnv({ OPENAI_BASE_URL: 'http://localhost:11434/v1' })
    stubFetch([reply('ok')])
    await expect(ai({ system: 's', messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe('ok')
  }, 15000)

  it('picks the provider by name, then by whichever key exists', async () => {
    const { pickProvider } = await import('../supabase/functions/_shared/ai.ts')
    stubEnv({ GEMINI_API_KEY: 'g', OPENAI_BASE_URL: 'http://x/v1', AI_PROVIDER: 'openai' })
    expect(pickProvider()).toBe('openai')
    stubEnv({ GEMINI_API_KEY: 'g', OPENAI_BASE_URL: 'http://x/v1' })
    expect(pickProvider()).toBe('gemini')
    stubEnv({ OPENAI_BASE_URL: 'http://x/v1' })
    expect(pickProvider()).toBe('openai')
    stubEnv({})
    expect(() => pickProvider()).toThrow(/No AI provider configured/)
  })

  it('fails over to a second provider when the first is overloaded', async () => {
    const { ai } = await import('../supabase/functions/_shared/ai.ts')
    stubEnv({ GEMINI_API_KEY: 'g', OPENAI_BASE_URL: 'http://localhost:11434/v1', AI_FALLBACK_PROVIDER: 'openai' })
    let n = 0
    globalThis.fetch = (async (url: any) => {
      n++
      if (String(url).includes('generativelanguage')) return new Response('{"error":"busy"}', { status: 503 })
      return new Response(JSON.stringify({ choices: [{ message: { content: 'from the local model' } }] }), { status: 200 })
    }) as typeof fetch
    await expect(ai({ system: 's', messages: [{ role: 'user', content: 'hi' }] })).resolves.toBe('from the local model')
    expect(n).toBeGreaterThan(1)   // Gemini retried, then the fallback answered
  }, 20000)

  it('does not fail over for a misconfiguration, only for overload', async () => {
    const { ai } = await import('../supabase/functions/_shared/ai.ts')
    stubEnv({ GEMINI_API_KEY: 'bad', OPENAI_BASE_URL: 'http://localhost:11434/v1', AI_FALLBACK_PROVIDER: 'openai' })
    globalThis.fetch = (async () => new Response('{"error":{"message":"API key not valid"}}', { status: 401 })) as typeof fetch
    await expect(ai({ system: 's', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/key was rejected/i)
  }, 15000)
})
