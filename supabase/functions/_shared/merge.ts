// Merging two independent analyses of the same photo. Kept separate from the request handler
// so the edge cases — disagreement, items seen by only one pass, macro rescaling — can be tested.
export interface PassItem { name: string; grams: number; unit?: string; ref_id?: string | null; confidence?: number; portion_unclear?: boolean; note?: string; kcal?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fibre_g?: number; [k: string]: unknown }
export interface Pass { items: PassItem[]; questions?: unknown[]; overall_confidence?: number; [k: string]: unknown }

/** Portions differing by more than this fraction of their mean are worth the user's attention. */
export const DISAGREE = 0.18

export const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Two independent passes over the same photo. Where they agree the estimate is trustworthy;
 * where they diverge the user is told which item to check, which is more useful than a
 * marginally better average. Items only one pass saw are flagged as uncertain, not dropped.
 */
export function mergePasses(a: Pass, b: Pass): Pass {
  const used = new Set<number>()
  const other: any[] = b.items ?? []
  const items = (a.items ?? []).map((it: any) => {
    let j = it.ref_id ? other.findIndex((o, i) => !used.has(i) && o.ref_id === it.ref_id) : -1
    if (j < 0) j = other.findIndex((o, i) => !used.has(i) && norm(o.name) === norm(it.name))
    if (j < 0) j = other.findIndex((o, i) => { const x = norm(o.name), y = norm(it.name); return !used.has(i) && x.length > 2 && y.length > 2 && (x.includes(y) || y.includes(x)) })
    if (j < 0) {
      return { ...it, confidence: Math.min(it.confidence ?? 0.5, 0.45), portion_unclear: true,
        note: [it.note, 'Only one of two passes saw this item, so check whether it belongs here.'].filter(Boolean).join(' ') }
    }
    used.add(j)
    const o = other[j]
    const ga = Number(it.grams) || 0, gb = Number(o.grams) || 0, mean = (ga + gb) / 2
    if (!mean) return it
    const spread = Math.abs(ga - gb) / mean
    const grams = Math.round(mean)
    const scale = ga > 0 ? grams / ga : 1
    const merged = { ...it, grams,
      kcal: Math.round((it.kcal ?? 0) * scale),
      protein_g: Math.round((it.protein_g ?? 0) * scale * 10) / 10,
      carbs_g: Math.round((it.carbs_g ?? 0) * scale * 10) / 10,
      fat_g: Math.round((it.fat_g ?? 0) * scale * 10) / 10,
      fibre_g: Math.round((it.fibre_g ?? 0) * scale * 10) / 10,
      confidence: Math.min(it.confidence ?? 0.6, Math.max(0.15, 1 - spread * 1.6)) }
    if (spread > DISAGREE) {
      return { ...merged, portion_unclear: true,
        note: `The two estimates differed — ${Math.round(ga)} g and ${Math.round(gb)} g. Worth checking this one.` }
    }
    return merged
  })
  // Anything only the second pass saw is worth surfacing too, clearly marked.
  const extras = other.filter((_, i) => !used.has(i)).map((o: any) => ({ ...o,
    confidence: Math.min(o.confidence ?? 0.5, 0.45), portion_unclear: true,
    note: 'Only one of two passes saw this item, so check whether it belongs here.' }))
  return { ...a, items: [...items, ...extras],
    questions: (a.questions ?? []).length ? a.questions : (b.questions ?? []),
    overall_confidence: items.length ? items.reduce((n: number, x: any) => n + (x.confidence ?? 0.5), 0) / items.length : a.overall_confidence,
    passes: 2 }
}
