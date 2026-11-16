import { addDays } from './dates'
import type { DayData } from './hooks'
import type { Reminder, Targets, WeightLog } from './types'

export interface DayStat { date: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number; water_ml: number; logged: number; expected: number; hasData: boolean; score: number }
export interface WeekStats {
  days: DayStat[]; daysWithData: number
  avg: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; water_ml: number }
  mealConsistency: number | null; reminderCompletion: number | null; best: DayStat | null; leastConsistent: DayStat | null
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** nowDate/nowHHMM bound which reminders count as "due" so today's upcoming meals are not counted as missed. */
export function weekStats(dates: string[], data: Record<string, DayData>, targets: Targets | undefined, reminders: Reminder[], nowDate: string, nowHHMM: string): WeekStats {
  const slots = reminders.filter(r => r.kind === 'meal' && r.enabled && r.slot)
  let due = 0, completed = 0
  const days: DayStat[] = dates.map(date => {
    const d = data[date]; const t = d?.totals
    const loggedSlots = slots.filter(r => d?.meals.some(m => m.slot === r.slot && m.status === 'logged'))
    const dueSlots = date > nowDate ? [] : slots.filter(r => date < nowDate || r.time <= nowHHMM)
    for (const r of reminders.filter(x => x.enabled && x.kind !== 'review')) {
      if (date > nowDate || (date === nowDate && r.time > nowHHMM)) continue
      due++
      const ev = d?.events.find(e => e.reminder_id === r.id)
      if (ev?.status === 'completed' || (r.kind === 'meal' && loggedSlots.includes(r))) completed++
    }
    const hasData = Boolean(d?.meals.some(m => m.status === 'logged'))
    // Day score (0–100): half for calories within ±10% of target, a quarter each for protein ≥ 90% and meals logged.
    let score = 0
    if (hasData && targets && t) {
      const calDev = Math.abs(t.kcal - targets.kcal) / targets.kcal
      score = 50 * Math.max(0, 1 - Math.max(0, calDev - 0.1) / 0.3) + 25 * Math.min(1, t.protein_g / (targets.protein_g * 0.9)) + 25 * (dueSlots.length ? loggedSlots.length / Math.max(dueSlots.length, loggedSlots.length) : 1)
    }
    return { date, kcal: t?.kcal ?? 0, protein_g: t?.protein_g ?? 0, carbs_g: t?.carbs_g ?? 0, fat_g: t?.fat_g ?? 0, fibre_g: t?.fibre_g ?? 0, water_ml: d?.water ?? 0, logged: loggedSlots.length, expected: dueSlots.length, hasData, score: Math.round(score) }
  })
  const withData = days.filter(d => d.hasData)
  const expected = days.reduce((n, d) => n + d.expected, 0)
  const pastWithSlots = days.filter(d => d.expected > 0)
  return {
    days, daysWithData: withData.length,
    // Averages use only days that have confirmed meals, so an unlogged day does not look like a zero-calorie day.
    avg: { kcal: mean(withData.map(d => d.kcal)), protein_g: mean(withData.map(d => d.protein_g)), carbs_g: mean(withData.map(d => d.carbs_g)), fat_g: mean(withData.map(d => d.fat_g)), water_ml: mean(days.filter(d => d.water_ml > 0).map(d => d.water_ml)) },
    mealConsistency: expected ? Math.min(1, days.reduce((n, d) => n + Math.min(d.logged, d.expected), 0) / expected) : null,
    reminderCompletion: due ? completed / due : null,
    best: withData.length ? withData.reduce((a, b) => (b.score > a.score ? b : a)) : null,
    leastConsistent: pastWithSlots.length > 1 ? pastWithSlots.reduce((a, b) => (b.logged / b.expected < a.logged / a.expected ? b : a)) : null,
  }
}

export interface WeightPoint { date: string; kg: number | null; avg7: number | null }
export interface WeightStats { series: WeightPoint[]; latest: number | null; weeklyChange: number | null; overall: number | null; entries: number }
/** 7-day moving average smooths out day-to-day water and food-weight swings; trends are read from it, never from single days. */
export function weightStats(logs: Pick<WeightLog, 'local_date' | 'weight_kg'>[], end: string, span = 30): WeightStats {
  const by = new Map(logs.map(l => [l.local_date, l.weight_kg]))
  const avgAt = (date: string, min = 1): number | null => {
    const xs: number[] = []
    for (let i = 0; i < 7; i++) { const v = by.get(addDays(date, -i)); if (v != null) xs.push(v) }
    return xs.length >= min ? mean(xs) : null
  }
  const series: WeightPoint[] = []
  for (let i = span - 1; i >= 0; i--) { const date = addDays(end, -i); series.push({ date, kg: by.get(date) ?? null, avg7: avgAt(date) }) }
  const sorted = [...logs].sort((a, b) => a.local_date.localeCompare(b.local_date))
  const thisWeek = avgAt(end, 3), lastWeek = avgAt(addDays(end, -7), 3)
  const first = sorted[0], lastAvg = avgAt(sorted[sorted.length - 1]?.local_date ?? end)
  const firstAvg = first ? mean(sorted.filter(l => l.local_date <= addDays(first.local_date, 6)).map(l => l.weight_kg)) : null
  return {
    series, entries: sorted.length, latest: sorted.length ? sorted[sorted.length - 1].weight_kg : null,
    weeklyChange: thisWeek != null && lastWeek != null ? thisWeek - lastWeek : null,
    overall: sorted.length >= 8 && firstAvg != null && lastAvg != null ? lastAvg - firstAvg : null,
  }
}
