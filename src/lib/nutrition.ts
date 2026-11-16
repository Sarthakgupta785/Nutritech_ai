import type { ItemDraft, Macros, Profile } from './types'

export const ZERO: Macros = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
export const ACTIVITY: Record<Profile['activity'], { factor: number; label: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary (desk job, no structured exercise)' },
  light: { factor: 1.375, label: 'Lightly active (1–3 light sessions/week)' },
  moderate: { factor: 1.55, label: 'Moderately active (3–5 sessions/week)' },
  active: { factor: 1.725, label: 'Very active (6–7 sessions/week)' },
}

/** Mifflin-St Jeor resting energy estimate (kcal/day). */
export function bmr(p: Pick<Profile, 'sex' | 'age' | 'height_cm' | 'weight_kg'>): number {
  return 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + (p.sex === 'male' ? 5 : -161)
}
export function tdee(p: Pick<Profile, 'sex' | 'age' | 'height_cm' | 'weight_kg' | 'activity'>): number { return bmr(p) * ACTIVITY[p.activity].factor }

const round = (n: number, step: number) => Math.round(n / step) * step

/** Starting-point targets. Assumptions are returned so the UI can show them. */
export function suggestTargets(p: Pick<Profile, 'sex' | 'age' | 'height_cm' | 'weight_kg' | 'activity'>) {
  const rest = bmr(p), maintenance = tdee(p)
  const floor = p.sex === 'male' ? 1500 : 1200
  const kcal = Math.max(round(maintenance * 0.8, 50), floor)
  const protein_g = round(Math.min(p.weight_kg * 1.6, 180), 5)
  const fat_g = round((kcal * 0.27) / 9, 5)
  const carbs_g = Math.max(round((kcal - protein_g * 4 - fat_g * 9) / 4, 5), 50)
  const fibre_g = Math.max(25, round((kcal / 1000) * 14, 1))
  const water_ml = round(Math.min(Math.max(p.weight_kg * 33, 2000), 3500), 250)
  return {
    bmr: Math.round(rest), tdee: Math.round(maintenance), deficit: Math.round(maintenance - kcal),
    targets: { kcal, protein_g, carbs_g, fat_g, fibre_g, water_ml },
    assumptions: [
      `Resting energy (Mifflin-St Jeor equation): about ${Math.round(rest)} kcal/day.`,
      `Activity multiplier ×${ACTIVITY[p.activity].factor} (${ACTIVITY[p.activity].label.toLowerCase()}) gives estimated maintenance of about ${Math.round(maintenance)} kcal/day.`,
      `Suggested intake is roughly 20% below maintenance (${kcal} kcal), a moderate deficit intended to protect muscle.`,
      `Protein about 1.6 g per kg body weight (${protein_g} g) to help preserve muscle; fat about 27% of calories; carbohydrates fill the remainder.`,
      'Equations like this are commonly off by 10% or more for an individual. Treat these as a starting point and adjust with a doctor or registered dietitian.',
    ],
  }
}

export interface TargetCheck { level: 'ok' | 'caution' | 'danger'; message: string }
/** Flags calorie targets that are too restrictive to adopt without supervision. */
export function checkCalorieTarget(kcal: number, p: Pick<Profile, 'sex' | 'age' | 'height_cm' | 'weight_kg' | 'activity'>): TargetCheck {
  const rest = bmr(p), maintenance = tdee(p), floor = p.sex === 'male' ? 1500 : 1200
  if (kcal < floor) return { level: 'danger', message: `${kcal} kcal is below ${floor} kcal, the level under which diets are generally only recommended with medical supervision. Very low intakes risk muscle loss, nutrient gaps and rebound eating.` }
  if (kcal < rest * 0.85) return { level: 'danger', message: `${kcal} kcal is well below your estimated resting needs (~${Math.round(rest)} kcal). That is an aggressive deficit; please only use it if a professional has set it for you.` }
  if (kcal < maintenance * 0.75) return { level: 'caution', message: `This is a deficit of about ${Math.round((1 - kcal / maintenance) * 100)}% below estimated maintenance (~${Math.round(maintenance)} kcal). Deficits beyond ~25% make it harder to keep muscle and stay consistent.` }
  return { level: 'ok', message: '' }
}

export function sum(items: Macros[]): Macros {
  const t = { ...ZERO }
  for (const i of items) { t.kcal += i.kcal || 0; t.protein_g += i.protein_g || 0; t.carbs_g += i.carbs_g || 0; t.fat_g += i.fat_g || 0; t.fibre_g += i.fibre_g || 0 }
  return t
}
export function scale(per100: Macros, qty: number): Macros {
  const f = qty / 100, r = (n: number) => Math.round(n * f * 10) / 10
  return { kcal: Math.round(per100.kcal * f), protein_g: r(per100.protein_g), carbs_g: r(per100.carbs_g), fat_g: r(per100.fat_g), fibre_g: r(per100.fibre_g) }
}
export function per100From(m: Macros, qty: number): Macros | null {
  if (!qty || qty <= 0) return null
  const f = 100 / qty
  return { kcal: m.kcal * f, protein_g: m.protein_g * f, carbs_g: m.carbs_g * f, fat_g: m.fat_g * f, fibre_g: m.fibre_g * f }
}
/** Change quantity; rescales nutrition when a per-100 basis exists. */
export function withQuantity(item: ItemDraft, quantity: number): ItemDraft {
  if (!item.per100) return { ...item, quantity }
  return { ...item, quantity, ...scale(item.per100, quantity) }
}
/** MET-based estimate of exercise energy. Always displayed as an estimate, never netted against food. */
export function workoutKcal(minutes: number, weightKg: number, met: number): number { return Math.round(met * weightKg * (minutes / 60)) }
export const pct = (v: number, target: number) => (target > 0 ? Math.round((v / target) * 100) : 0)
