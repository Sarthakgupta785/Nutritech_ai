import { alive, db, deletePhoto, getUid, newId, patch, put, remove, savePhoto, stableId, sync } from './db'
import { api } from './api'
import { deviceTz, localDate, today } from './dates'
import { FOOD_BY_ID } from './foods'
import { per100From, scale, sum } from './nutrition'
import type { AiAnalysis, ItemDraft, Meal, MealItem, Reminder, ReminderEvent, Slot } from './types'

export const SLOT_LABEL: Record<Slot, string> = { breakfast: 'Breakfast', mid_morning: 'Mid-morning snack', lunch: 'Lunch', evening_snack: 'Evening snack', dinner: 'Dinner', other: 'Other meal' }
export const SLOTS: Slot[] = ['breakfast', 'mid_morning', 'lunch', 'evening_snack', 'dinner', 'other']

export const DEFAULT_REMINDERS: Omit<Reminder, 'id' | 'user_id' | 'updated_at'>[] = [
  { kind: 'hydration', slot: null, label: 'Morning hydration', time: '08:00', enabled: true, sort: 0 },
  { kind: 'meal', slot: 'breakfast', label: 'Breakfast', time: '09:00', enabled: true, sort: 1 },
  { kind: 'meal', slot: 'mid_morning', label: 'Mid-morning snack', time: '11:30', enabled: true, sort: 2 },
  { kind: 'meal', slot: 'lunch', label: 'Lunch', time: '13:30', enabled: true, sort: 3 },
  { kind: 'meal', slot: 'evening_snack', label: 'Evening snack', time: '16:30', enabled: true, sort: 4 },
  { kind: 'meal', slot: 'dinner', label: 'Dinner', time: '19:30', enabled: true, sort: 5 },
  { kind: 'review', slot: null, label: 'Daily nutrition review', time: '21:30', enabled: true, sort: 6 },
]

/** Best-guess meal slot for "now" from the reminder schedule. */
export function guessSlot(reminders: Reminder[], hhmm: string): Slot {
  const meals = reminders.filter(r => r.kind === 'meal' && r.slot).sort((a, b) => a.time.localeCompare(b.time))
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  let best: Slot = 'other', bestDiff = 91
  for (const r of meals) { const d = Math.abs(mins(r.time) - mins(hhmm)); if (d < bestDiff) { bestDiff = d; best = r.slot as Slot } }
  return best
}

export async function createDraftMeal(opts: { slot: Slot; date?: string; photo?: Blob; noPhoto?: boolean; items?: ItemDraft[]; name?: string }): Promise<string> {
  const id = newId(), now = new Date()
  const date = opts.date ?? today()
  // Logging for a past day keeps that day; the timestamp defaults to noon so it can be corrected.
  const eaten_at = date === today() ? now.toISOString() : new Date(`${date}T12:00:00`).toISOString()
  await put('meals', { id, local_date: date, slot: opts.slot, name: opts.name ?? '', eaten_at, status: 'draft', no_photo: Boolean(opts.noPhoto), ai_analysis: null, ai_feedback: null, notes: null })
  if (opts.photo) await savePhoto(id, opts.photo)
  if (opts.items?.length) await replaceItems(id, opts.items)
  return id
}
export async function replaceItems(mealId: string, items: ItemDraft[]) {
  const old = alive(await db.meal_items.where('meal_id').equals(mealId).toArray())
  for (const o of old) await remove('meal_items', o.id)
  let sort = 0
  for (const it of items) await put('meal_items', { ...it, id: newId(), meal_id: mealId, sort: sort++ })
}
/** The single place a meal becomes "logged". Confirmed items become the source of truth for all totals. */
export async function confirmMeal(meal: Meal, changes: Partial<Meal>, items: ItemDraft[]) {
  await replaceItems(meal.id, items)
  const eaten_at = changes.eaten_at ?? meal.eaten_at
  await patch('meals', meal.id, { ...changes, status: 'logged', local_date: localDate(new Date(eaten_at), deviceTz()) })
  const slot = changes.slot ?? meal.slot
  const date = localDate(new Date(eaten_at), deviceTz())
  const reminder = alive(await db.reminders.toArray()).find(r => r.kind === 'meal' && r.slot === slot)
  if (reminder) await setReminderStatus(reminder.id, date, 'completed')
  void requestMealFeedback(meal.id)
}
async function requestMealFeedback(mealId: string) {
  try {
    const meal = await db.meals.get(mealId); if (!meal) return
    const items = alive(await db.meal_items.where('meal_id').equals(mealId).toArray())
    await sync()
    const { feedback } = await api<{ feedback: string }>('meal_feedback', { date: meal.local_date,
      meal: { name: meal.name, slot: meal.slot, totals: sum(items), items: items.map(i => `${i.name} ${i.quantity}${i.unit} ${i.kcal} kcal`) } })
    await patch('meals', mealId, { ai_feedback: feedback })
  } catch { /* feedback is optional; the daily report still covers this meal */ }
}
export async function deleteMeal(mealId: string) {
  for (const i of await db.meal_items.where('meal_id').equals(mealId).toArray()) await remove('meal_items', i.id)
  await deletePhoto(mealId)
  await remove('meals', mealId)
}
export async function markSkipped(slot: Slot, date: string) {
  await put('meals', { id: newId(), local_date: date, slot, name: SLOT_LABEL[slot], eaten_at: new Date().toISOString(), status: 'skipped', no_photo: true, ai_analysis: null, ai_feedback: null, notes: null })
  const reminder = alive(await db.reminders.toArray()).find(r => r.kind === 'meal' && r.slot === slot)
  if (reminder) await setReminderStatus(reminder.id, date, 'skipped')
}
export async function setReminderStatus(reminderId: string, date: string, status: ReminderEvent['status'], snoozeMin?: number) {
  const id = await stableId(`rev:${reminderId}:${date}`)
  const cur = await db.reminder_events.get(id)
  await put('reminder_events', { id, reminder_id: reminderId, local_date: date, status, pushed_at: cur?.pushed_at ?? null,
    snoozed_until: status === 'snoozed' ? new Date(Date.now() + (snoozeMin ?? 10) * 60000).toISOString() : null })
  if (status === 'snoozed') void sync() // the server needs to know now, so it can re-send on time
}
export async function addWater(ml: number, date = today()) {
  if (!(ml > 0)) return
  await put('water_logs', { id: newId(), local_date: date, amount_ml: Math.min(Math.round(ml), 5000), logged_at: new Date().toISOString() })
}
export async function setWeight(kg: number, date = today()) {
  await put('weight_logs', { id: await stableId(`weight:${getUid()}:${date}`), local_date: date, weight_kg: kg, deleted_at: null })
}

/** Convert an AI analysis into editable draft items. Reference values are used wherever the AI matched a known food. */
export function draftsFromAnalysis(a: AiAnalysis): ItemDraft[] {
  return a.items.map(it => {
    const qty = Math.max(1, Math.round(it.grams))
    const ref = it.ref_id ? FOOD_BY_ID[it.ref_id] : undefined
    if (ref) {
      const per100 = { kcal: ref.kcal, protein_g: ref.protein_g, carbs_g: ref.carbs_g, fat_g: ref.fat_g, fibre_g: ref.fibre_g }
      return { name: it.name, quantity: qty, unit: ref.unit, per100, source: ref.source, food_ref: ref.id, cooking_method: it.cooking_method, confidence: it.confidence, ...scale(per100, qty) }
    }
    const m = { kcal: Math.round(it.kcal), protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g, fibre_g: it.fibre_g }
    return { name: it.name, quantity: qty, unit: it.unit, per100: per100From(m, qty), source: 'ai', food_ref: null, cooking_method: it.cooking_method, confidence: it.confidence, ...m }
  })
}
export const itemToDraft = ({ name, quantity, unit, per100, source, food_ref, cooking_method, confidence, kcal, protein_g, carbs_g, fat_g, fibre_g }: MealItem): ItemDraft =>
  ({ name, quantity, unit, per100, source, food_ref, cooking_method, confidence, kcal, protein_g, carbs_g, fat_g, fibre_g })
