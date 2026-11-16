import { describe, expect, it } from 'vitest'
import { DISAGREE, mergePasses, type PassItem } from '../supabase/functions/_shared/merge.ts'

const it_ = (name: string, grams: number, extra: Partial<PassItem> = {}): PassItem =>
  ({ name, grams, ref_id: null, confidence: 0.8, kcal: grams, protein_g: grams / 10, carbs_g: grams / 5, fat_g: grams / 20, fibre_g: grams / 50, ...extra })
const pass = (items: PassItem[]) => ({ items, questions: [], overall_confidence: 0.8 })

describe('merging two analysis passes', () => {
  it('averages close estimates, keeps confidence high and says nothing', () => {
    const m = mergePasses(pass([it_('Brown rice', 150)]), pass([it_('Brown rice', 160)]))
    expect(m.items[0].grams).toBe(155)
    expect(m.items[0].note).toBeUndefined()
    expect(m.items[0].portion_unclear).toBeFalsy()
    expect(m.items[0].confidence!).toBeGreaterThan(0.7)
  })
  it('rescales the macros to the merged amount', () => {
    const m = mergePasses(pass([it_('Rice', 100)]), pass([it_('Rice', 200)]))
    expect(m.items[0].grams).toBe(150)
    expect(m.items[0].kcal).toBe(150)          // was 100 for 100 g
    expect(m.items[0].protein_g).toBe(15)      // 10 → 15
  })
  it('flags a real disagreement, naming both numbers', () => {
    const m = mergePasses(pass([it_('Dal', 100)]), pass([it_('Dal', 200)]))
    expect(m.items[0].portion_unclear).toBe(true)
    expect(m.items[0].note).toMatch(/100 g and 200 g/)
    expect(m.items[0].confidence!).toBeLessThan(0.45)
  })
  it('leaves a borderline difference alone', () => {
    const m = mergePasses(pass([it_('Roti', 100)]), pass([it_('Roti', 115)]))  // 14% spread, under the threshold
    expect(15 / 107.5).toBeLessThan(DISAGREE)
    expect(m.items[0].note).toBeUndefined()
  })
  it('matches on reference id even when the two passes named it differently', () => {
    const m = mergePasses(pass([it_('Chicken breast', 150, { ref_id: 'chicken_breast' })]),
                          pass([it_('Grilled chicken', 170, { ref_id: 'chicken_breast' })]))
    expect(m.items).toHaveLength(1)
    expect(m.items[0].grams).toBe(160)
  })
  it('keeps items only one pass saw, marked as needing a look', () => {
    const m = mergePasses(pass([it_('Rice', 150), it_('Pickle', 10)]), pass([it_('Rice', 150), it_('Papad', 15)]))
    const names = m.items.map(i => i.name)
    expect(names).toEqual(['Rice', 'Pickle', 'Papad'])
    expect(m.items[0].note).toBeUndefined()
    for (const n of ['Pickle', 'Papad']) {
      const x = m.items.find(i => i.name === n)!
      expect(x.portion_unclear).toBe(true)
      expect(x.note).toMatch(/one of two passes/i)
      expect(x.confidence!).toBeLessThanOrEqual(0.45)
    }
  })
  it('reports two passes and an averaged overall confidence', () => {
    const m = mergePasses(pass([it_('Rice', 150)]), pass([it_('Rice', 150)]))
    expect(m.passes).toBe(2)
    expect(m.overall_confidence).toBeGreaterThan(0.5)
  })
  it('survives an empty second pass without losing the first', () => {
    const m = mergePasses(pass([it_('Rice', 150)]), pass([]))
    expect(m.items).toHaveLength(1)
    expect(m.items[0].note).toMatch(/one of two passes/i)
  })
})
