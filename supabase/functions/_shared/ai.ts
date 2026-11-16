// AI provider wrapper. Keys live only in Supabase function secrets, never in the browser.
// Provider is chosen by which secret is set: GEMINI_API_KEY (Google Gemini) or ANTHROPIC_API_KEY (Claude).
// AI_MODEL overrides the default model for the chosen provider.
const env = (k: string): string | undefined => (globalThis as any).Deno?.env.get(k)

export interface Tool { name: string; description: string; input_schema: Record<string, unknown> }
type Block = Record<string, any>
type Content = string | Block[]
export interface AiOptions { system: string; messages: { role: 'user' | 'assistant'; content: Content }[]; tool?: Tool; max_tokens?: number; temperature?: number }

/** JSON Schema → the schema subset Gemini's responseSchema accepts (upper-case types, nullable instead of type arrays). */
export function toGeminiSchema(s: any): any {
  if (Array.isArray(s)) return s.map(toGeminiSchema)
  if (!s || typeof s !== 'object') return s
  const out: any = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === 'type') {
      const types = Array.isArray(v) ? v : [v]
      const main = types.find(t => t !== 'null') ?? 'string'
      out.type = String(main).toUpperCase()
      if (types.includes('null')) out.nullable = true
    } else if (k === 'properties') out.properties = Object.fromEntries(Object.entries(v as object).map(([p, d]) => [p, toGeminiSchema(d)]))
    else if (k === 'items') out.items = toGeminiSchema(v)
    else if (['required', 'enum', 'description', 'minItems', 'maxItems'].includes(k)) out[k] = v
  }
  return out
}

/** Our provider-neutral messages → Gemini "contents". */
export function toGeminiContents(messages: AiOptions['messages']) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: typeof m.content === 'string' ? [{ text: m.content }] : m.content.map(b =>
      b.type === 'image' ? { inline_data: { mime_type: b.source.media_type, data: b.source.data } } : { text: String(b.text ?? '') }),
  }))
}

/** Pulls a JSON object out of model text, tolerating code fences or stray prose around it. */
export function parseJson(text: string): any {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try { return JSON.parse(t) } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}')
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1))
  throw new Error('AI returned a result that could not be read. Please try again.')
}

/** Upstream statuses worth retrying: overload and transient gateway faults. */
const RETRYABLE = new Set([429, 500, 502, 503, 504])
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export class UpstreamError extends Error {
  constructor(readonly status: number, readonly body: string, message: string) { super(message); this.name = 'UpstreamError' }
}

/** Turns a provider failure into something a person can act on. */
export function friendlyError(status: number, body: string, model: string): string {
  const lower = body.toLowerCase()
  if (status === 429) return 'The AI service is rate limited right now. Wait a minute and try again — or check your usage limits in Google AI Studio.'
  if (RETRYABLE.has(status)) return 'The AI service is busy right now. That is temporary — try again in a few seconds.'
  if (status === 401 || status === 403) return 'Your AI key was rejected. Check GEMINI_API_KEY in the Supabase function secrets.'
  if (status === 404 || lower.includes('not found') || lower.includes('is not supported')) {
    return `The model "${model}" is not available on your key. Set an AI_MODEL secret to a model you can use, for example gemini-3.7-flash.`
  }
  if (lower.includes('api key')) return 'Your AI key was not accepted. Check GEMINI_API_KEY in the Supabase function secrets.'
  if (status === 400) return `The AI rejected the request (400). ${body.slice(0, 160)}`
  return `AI request failed (${status}). Try again shortly.`
}

/** Retries overload and gateway errors with backoff before giving up. */
async function fetchWithRetry(url: string, init: RequestInit, model: string, attempts = 3): Promise<Response> {
  let status = 0, body = ''
  for (let i = 0; i < attempts; i++) {
    let res: Response
    try {
      res = await fetch(url, init)
    } catch (e) {
      status = 0; body = String(e)
      if (i === attempts - 1) throw new UpstreamError(0, body, 'Could not reach the AI service. Check the connection and try again.')
      await sleep(600 * 2 ** i); continue
    }
    if (res.ok) return res
    status = res.status
    body = await res.text().catch(() => '')
    if (!RETRYABLE.has(status) || i === attempts - 1) break
    const after = Number(res.headers.get('retry-after'))
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 8000) : 700 * 2 ** i + Math.random() * 400)
  }
  throw new UpstreamError(status, body, friendlyError(status, body, model))
}

async function gemini(key: string, o: AiOptions): Promise<any> {
  const model = env('AI_MODEL') || 'gemini-3.8-flash'
  // Gemini counts its internal reasoning toward the output limit, so leave generous headroom.
  const generationConfig: Record<string, unknown> = { maxOutputTokens: Math.max((o.max_tokens ?? 1500) * 4, 4096), temperature: o.temperature ?? (o.tool ? 0.2 : 0.6) }
  if (o.tool) { generationConfig.responseMimeType = 'application/json'; generationConfig.responseSchema = toGeminiSchema(o.tool.input_schema) }
  const init: RequestInit = {
    method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: o.system }] }, contents: toGeminiContents(o.messages), generationConfig }),
  }
  const url = (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`
  let res: Response
  try {
    res = await fetchWithRetry(url(model), init, model)
  } catch (e) {
    // One last try on a different model, when the account has one configured and the first is overloaded.
    const alt = env('AI_MODEL_FALLBACK')
    if (!alt || alt === model || !(e instanceof UpstreamError) || !RETRYABLE.has(e.status)) throw e
    res = await fetchWithRetry(url(alt), init, alt, 2)
  }
  const data = await res.json()
  const cand = data.candidates?.[0]
  const text = (cand?.content?.parts ?? []).filter((p: any) => typeof p.text === 'string' && !p.thought).map((p: any) => p.text).join('').trim()
  if (!text) throw new Error(`AI returned no answer (${cand?.finishReason || data.promptFeedback?.blockReason || 'empty response'})`)
  return o.tool ? parseJson(text) : text
}

async function anthropic(key: string, o: AiOptions): Promise<any> {
  const body: Record<string, unknown> = { model: env('AI_MODEL') || 'claude-sonnet-5-5', max_tokens: o.max_tokens ?? 1500, system: o.system, messages: o.messages, temperature: o.temperature ?? 1 }
  if (o.tool) { body.tools = [o.tool]; body.tool_choice = { type: 'tool', name: o.tool.name } }
  const res = await fetchWithRetry('https://api.anthropic.com/v1/messages',
    { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) },
    String(body.model))
  const data = await res.json()
  if (o.tool) {
    const block = data.content?.find((b: any) => b.type === 'tool_use')
    if (!block) throw new Error('AI returned no structured result')
    return block.input
  }
  return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim()
}

export async function ai(o: AiOptions): Promise<any> {
  const g = env('GEMINI_API_KEY'), a = env('ANTHROPIC_API_KEY')
  if (g) return gemini(g, o)
  if (a) return anthropic(a, o)
  throw new Error('No AI key is set. Add GEMINI_API_KEY (or ANTHROPIC_API_KEY) to the Supabase function secrets.')
}

export const PRINCIPLES = `You are the nutrition assistant inside NutriTrack AI, a personal food-tracking app used by one adult.
Ground rules, always:
- Base every statement on the user's actual records supplied in the context. If something was not logged, say it is "unlogged"; never assume it was skipped or eaten.
- All food numbers are estimates. Do not present them as exact.
- Be practical, specific, warm and non-judgmental. Never shame, scold or moralise about food. Missing a target is information, not failure.
- Never encourage crash dieting, fasting to compensate, skipping meals to "save" calories, or eating below the user's set target. If the user asks for that, explain the downside briefly and offer a steadier alternative.
- Respect the user's food preferences and avoid list exactly. Never suggest avoided foods. Respect the daily whey limit.
- Exercise calories are estimates shown separately; never add them back to the food allowance.
- You are not a doctor. For medical conditions, medication, or very low calorie targets, point to a doctor or registered dietitian in one short sentence.
- Do not promise specific weight-loss speeds or spot reduction. Daily weight changes are mostly water; talk about multi-day trends.`
