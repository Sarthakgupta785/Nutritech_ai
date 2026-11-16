import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { addDays, lastNDays, today } from './dates'
import { alive, db, getSyncState, getUid, loadPhoto, onSync, type SyncState } from './db'
import { sum, ZERO } from './nutrition'
import type { Macros, Meal, MealItem, Reminder, ReminderEvent, Slot } from './types'

export const useProfile = () => useLiveQuery(() => db.profiles.get(getUid()), [])
export const useTargets = () => useLiveQuery(() => db.nutrition_targets.get(getUid()), [])
export const usePrefs = () => {
  const p = useLiveQuery(() => db.user_preferences.get(getUid()), [])
  return p ? { ...p, units: p.units ?? 'metric' } : p
}
export const useReminders = () => useLiveQuery(async () => alive(await db.reminders.toArray()).sort((a, b) => a.time.localeCompare(b.time)), []) ?? []

export interface DayData {
  meals: (Meal & { items: MealItem[]; totals: Macros; hasPhoto: boolean })[]
  totals: Macros; water: number; events: ReminderEvent[]; loaded: boolean
}
const EMPTY: DayData = { meals: [], totals: ZERO, water: 0, events: [], loaded: false }

export async function loadDay(date: string): Promise<DayData> {
  const meals = alive(await db.meals.where('local_date').equals(date).toArray()).sort((a, b) => a.eaten_at.localeCompare(b.eaten_at))
  const out = []
  for (const m of meals) {
    const items = alive(await db.meal_items.where('meal_id').equals(m.id).toArray()).sort((a, b) => a.sort - b.sort)
    const hasPhoto = alive(await db.meal_photos.where('meal_id').equals(m.id).toArray()).length > 0
    out.push({ ...m, items, totals: sum(items), hasPhoto })
  }
  const water = alive(await db.water_logs.where('local_date').equals(date).toArray()).reduce((n, w) => n + w.amount_ml, 0)
  const events = alive(await db.reminder_events.where('local_date').equals(date).toArray())
  // Only confirmed ("logged") meals count toward totals.
  return { meals: out, totals: sum(out.filter(m => m.status === 'logged').map(m => m.totals)), water, events, loaded: true }
}
export const useDay = (date: string): DayData => useLiveQuery(() => loadDay(date), [date]) ?? EMPTY
export const useDays = (dates: string[]): Record<string, DayData> =>
  useLiveQuery(async () => Object.fromEntries(await Promise.all(dates.map(async d => [d, await loadDay(d)] as const))), [dates.join(',')]) ?? {}

export type SlotStatus = 'logged' | 'skipped' | 'draft' | 'unlogged'
export function slotStatus(day: DayData, slot: Slot): SlotStatus {
  const ms = day.meals.filter(m => m.slot === slot)
  if (ms.some(m => m.status === 'logged')) return 'logged'
  if (ms.some(m => m.status === 'skipped')) return 'skipped'
  if (ms.some(m => m.status === 'draft')) return 'draft'
  return 'unlogged'
}
export const mealSlots = (reminders: Reminder[]) => reminders.filter(r => r.kind === 'meal' && r.enabled && r.slot)

export function usePhotoUrl(mealId: string | undefined, enabled = true): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const version = useLiveQuery(async () => (mealId ? (await db.meal_photos.where('meal_id').equals(mealId).toArray()).map(p => p.updated_at + (p.deleted_at ?? '')).join() : ''), [mealId])
  useEffect(() => {
    if (!mealId || !enabled) { setUrl(null); return }
    let live = true, made: string | null = null
    void loadPhoto(mealId).then(b => { if (live && b) { made = URL.createObjectURL(b); setUrl(made) } else if (live) setUrl(null) })
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [mealId, enabled, version])
  return url
}
export function useSyncState(): SyncState {
  const [s, set] = useState(getSyncState())
  useEffect(() => onSync(set), [])
  return s
}
export function useNow(intervalMs = 30000): Date {
  const [now, set] = useState(new Date())
  useEffect(() => { const t = setInterval(() => set(new Date()), intervalMs); return () => clearInterval(t) }, [intervalMs])
  return now
}

export interface StreakInfo { current: number; best: number; week: { date: string; logged: boolean }[] }
const NO_STREAK: StreakInfo = { current: 0, best: 0, week: [] }

/** Consecutive days with at least one confirmed meal. Today not being logged yet does not break it. */
export function useLoggingStreak(): StreakInfo {
  return useLiveQuery(async () => {
    const now = today(), from = addDays(now, -89)
    const rows = alive(await db.meals.where('local_date').between(from, now, true, true).toArray())
    const days = new Set(rows.filter(m => m.status === 'logged').map(m => m.local_date))
    let current = 0
    for (let d = days.has(now) ? now : addDays(now, -1); days.has(d); d = addDays(d, -1)) current++
    let best = 0, run = 0
    for (let i = 0; i < 90; i++) { if (days.has(addDays(from, i))) { run++; if (run > best) best = run } else run = 0 }
    return { current, best: Math.max(best, current), week: lastNDays(now, 7).map(date => ({ date, logged: days.has(date) })) }
  }, []) ?? NO_STREAK
}
