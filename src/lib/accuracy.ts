import type { AiAnalysis, MealItem } from './types'

/**
 * Compares what the AI proposed for a meal photo against what the user confirmed.
 * Those pairs are the only ground truth the app has, and they drive two things:
 * the accuracy view, and the per-food calibration sent back into the next analysis.
 */
export interface Pair { name: string; ref: string | null; ai: number; confirmed: number; unit: string; date: string }
export interface FoodStat { key: string; name: string; n: number; medianAi: number; medianConfirmed: number; factor: number }
export interface AccuracyReport {
  meals: number; pairs: Pair[]
  accepted: number                   // portions you left exactly as estimated
  corrected: number                  // portions you changed
  medianAbsErrorPct: number | null   // across every item, direction ignored
  medianCorrectionPct: number | null // across only the ones you changed — the honest headline
  medianBiasPct: number | null       // positive = the AI under-estimates your portions
  foods: FoodStat[]
  addedByUser: number                // foods the AI missed entirely
  removedByUser: number              // foods the AI saw that were not there
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
export function median(xs: number[]): number {
  if (!xs.length) return 0
  const a = [...xs].sort((x, y) => x - y), m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** Greedy match: reference id first, then exact name, then a containment fallback. */
export function pairItems(analysis: AiAnalysis, items: Pick<MealItem, 'name' | 'quantity' | 'unit' | 'food_ref'>[]) {
  const used = new Set<number>(), pairs: { ai: AiAnalysis['items'][number]; got: (typeof items)[number] }[] = []
  const unmatchedAi: AiAnalysis['items'] = []
  const find = (test: (it: (typeof items)[number]) => boolean) => items.findIndex((it, i) => !used.has(i) && test(it))
  for (const a of analysis.items) {
    let i = a.ref_id ? find(it => it.food_ref === a.ref_id) : -1
    if (i < 0) i = find(it => norm(it.name) === norm(a.name))
    if (i < 0) i = find(it => { const x = norm(it.name), y = norm(a.name); return x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x)) })
    if (i < 0) { unmatchedAi.push(a); continue }
    used.add(i); pairs.push({ ai: a, got: items[i] })
  }
  return { pairs, unmatchedAi, unmatchedItems: items.filter((_, i) => !used.has(i)) }
}

export function buildAccuracy(meals: { local_date: string; ai_analysis: AiAnalysis | null; items: MealItem[] }[]): AccuracyReport {
  const pairs: Pair[] = []
  let addedByUser = 0, removedByUser = 0, counted = 0
  for (const m of meals) {
    if (!m.ai_analysis?.items?.length || !m.items.length) continue
    counted++
    const { pairs: ps, unmatchedAi, unmatchedItems } = pairItems(m.ai_analysis, m.items)
    removedByUser += unmatchedAi.length
    addedByUser += unmatchedItems.length
    for (const { ai, got } of ps) {
      if (!(ai.grams > 0) || !(got.quantity > 0)) continue
      pairs.push({ name: got.name, ref: got.food_ref ?? null, ai: ai.grams, confirmed: got.quantity, unit: got.unit, date: m.local_date })
    }
  }
  const errs = pairs.map(p => ((p.confirmed - p.ai) / p.ai) * 100)
  // An untouched portion is weak evidence the estimate was right — it may just not have been checked.
  // Reporting the two groups separately avoids a pile of zeros hiding a large error on the foods you do fix.
  const changed = errs.filter(e => Math.abs(e) >= 2)
  const byFood = new Map<string, Pair[]>()
  for (const p of pairs) {
    const key = p.ref ?? norm(p.name)
    byFood.set(key, [...(byFood.get(key) ?? []), p])
  }
  const foods: FoodStat[] = [...byFood.entries()]
    .map(([key, ps]) => ({
      key, name: ps[ps.length - 1].name, n: ps.length,
      medianAi: Math.round(median(ps.map(p => p.ai))),
      medianConfirmed: Math.round(median(ps.map(p => p.confirmed))),
      factor: median(ps.map(p => p.confirmed / p.ai)),
    }))
    .sort((a, b) => b.n - a.n || Math.abs(b.factor - 1) - Math.abs(a.factor - 1))
  return {
    meals: counted, pairs, foods, addedByUser, removedByUser,
    accepted: errs.length - changed.length, corrected: changed.length,
    medianAbsErrorPct: errs.length ? Math.round(median(errs.map(Math.abs))) : null,
    medianCorrectionPct: changed.length ? Math.round(median(changed.map(Math.abs))) : null,
    medianBiasPct: changed.length ? Math.round(median(changed)) : null,
  }
}

export interface Calibration { name: string; ref_id: string | null; your_typical_g: number; ai_typical_g: number; samples: number }
/**
 * The hint sent with the next photo: how much of each food this user actually logs.
 * Only foods seen at least twice, so one odd correction cannot skew an estimate.
 */
export function calibrationFrom(report: AccuracyReport, minSamples = 2, max = 25): Calibration[] {
  return report.foods
    .filter(f => f.n >= minSamples && f.medianConfirmed > 0)
    .slice(0, max)
    .map(f => ({ name: f.name, ref_id: f.key.includes(' ') ? null : f.key, your_typical_g: f.medianConfirmed, ai_typical_g: f.medianAi, samples: f.n }))
}
