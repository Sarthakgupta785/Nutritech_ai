import { describe, expect, it } from 'vitest'
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
