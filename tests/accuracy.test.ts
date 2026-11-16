import { describe, expect, it } from 'vitest'
import { buildAccuracy, calibrationFrom, median, pairItems } from '../src/lib/accuracy'
import type { AiAnalysis, MealItem } from '../src/lib/types'

const aiItem = (name: string, grams: number, ref_id: string | null = null) =>
  ({ name, grams, unit: 'g' as const, ref_id, cooking_method: null, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0, confidence: 0.8, portion_unclear: false })
const analysis = (items: any[]): AiAnalysis => ({ meal_name: 'm', items, questions: [], assumptions: '', overall_confidence: 0.8, analysed_at: '' })
const item = (name: string, quantity: number, food_ref: string | null = null) => ({ name, quantity, unit: 'g', food_ref } as MealItem)

describe('AI vs confirmed matching', () => {
  it('matches on reference id even when the user renamed the food', () => {
    const r = pairItems(analysis([aiItem('Brown rice', 150, 'brown_rice')]), [item('Rice (mum made)', 220, 'brown_rice')])
    expect(r.pairs).toHaveLength(1)
    expect(r.pairs[0].got.quantity).toBe(220)
  })
  it('falls back to name, then containment, and reports the leftovers', () => {
    const r = pairItems(
      analysis([aiItem('Chicken breast', 120), aiItem('Mint raita', 60), aiItem('Ghost food', 10)]),
      [item('Chicken breast', 160), item('Mint raita, homemade', 80), item('Papad', 15)])
    expect(r.pairs.map(p => p.got.name)).toEqual(['Chicken breast', 'Mint raita, homemade'])
    expect(r.unmatchedAi.map(a => a.name)).toEqual(['Ghost food'])   // the AI saw something that was not there
    expect(r.unmatchedItems.map(i => i.name)).toEqual(['Papad'])      // the user added what the AI missed
  })
  it('does not reuse one confirmed item for two AI items', () => {
    const r = pairItems(analysis([aiItem('Egg', 50), aiItem('Egg', 50)]), [item('Egg', 100)])
    expect(r.pairs).toHaveLength(1)
    expect(r.unmatchedAi).toHaveLength(1)
  })
})

describe('accuracy report', () => {
  const meals = [
    { local_date: '2026-11-10', ai_analysis: analysis([aiItem('Brown rice', 100, 'brown_rice'), aiItem('Chicken breast', 150, 'chicken_breast')]),
      items: [item('Brown rice', 150, 'brown_rice'), item('Chicken breast', 150, 'chicken_breast')] },
    { local_date: '2026-11-11', ai_analysis: analysis([aiItem('Brown rice', 120, 'brown_rice'), aiItem('Chicken breast', 140, 'chicken_breast')]),
      items: [item('Brown rice', 180, 'brown_rice'), item('Chicken breast', 140, 'chicken_breast')] },
    { local_date: '2026-11-12', ai_analysis: null, items: [item('Oats', 40)] },   // no photo analysis: ignored
  ]
  it('measures bias per food and overall', () => {
    const r = buildAccuracy(meals as any)
    expect(r.meals).toBe(2)
    expect(r.pairs).toHaveLength(4)
    const rice = r.foods.find(f => f.key === 'brown_rice')!
    expect(rice.n).toBe(2)
    expect(rice.factor).toBeCloseTo(1.5, 2)          // consistently 50% more rice than estimated
    expect(rice.medianConfirmed).toBe(165)
    const chicken = r.foods.find(f => f.key === 'chicken_breast')!
    expect(chicken.factor).toBe(1)                    // chicken is estimated correctly
    expect(r.accepted).toBe(2)                        // chicken was left alone both times
    expect(r.corrected).toBe(2)                       // rice was corrected both times
    expect(r.medianCorrectionPct).toBe(50)            // and by 50% each time
    expect(r.medianBiasPct).toBe(50)                  // consistently upward
    expect(r.medianAbsErrorPct).toBe(25)              // across everything, halved by the untouched items
  })
  it('separates accepted portions from corrected ones, so zeros cannot hide a big error', () => {
    // nine items accepted, one wrong by 60%: the plain median says 0%, which would be misleading
    const items = Array.from({ length: 9 }, (_, i) => aiItem('f' + i, 100))
    const got = Array.from({ length: 9 }, (_, i) => item('f' + i, 100))
    const r = buildAccuracy([{ local_date: 'd', ai_analysis: analysis([...items, aiItem('rice', 100)]), items: [...got, item('rice', 160)] }] as any)
    expect(r.medianAbsErrorPct).toBe(0)
    expect(r.accepted).toBe(9); expect(r.corrected).toBe(1)
    expect(r.medianCorrectionPct).toBe(60)
  })
  it('counts what the AI missed and what it invented', () => {
    const r = buildAccuracy([{ local_date: 'd', ai_analysis: analysis([aiItem('Ghost', 10)]), items: [item('Real food', 50)] }] as any)
    expect(r.removedByUser).toBe(1); expect(r.addedByUser).toBe(1); expect(r.pairs).toHaveLength(0)
  })
  it('calibration only includes foods seen more than once', () => {
    const r = buildAccuracy(meals as any)
    const c = calibrationFrom(r)
    expect(c.map(x => x.ref_id).sort()).toEqual(['brown_rice', 'chicken_breast'])
    expect(c.find(x => x.ref_id === 'brown_rice')!.your_typical_g).toBe(165)
    expect(calibrationFrom(r, 3)).toEqual([])
  })
  it('empty history yields no numbers rather than false confidence', () => {
    const r = buildAccuracy([])
    expect(r.medianAbsErrorPct).toBeNull(); expect(r.medianCorrectionPct).toBeNull()
    expect(r.foods).toEqual([]); expect(median([])).toBe(0)
  })
})
