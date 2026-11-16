import { addDays } from './util.ts'

const SLOT_NAMES: Record<string, string> = { breakfast: 'Breakfast', mid_morning: 'Mid-morning snack', lunch: 'Lunch', evening_snack: 'Evening snack', dinner: 'Dinner', other: 'Other' }
const r1 = (n: number) => Math.round(n * 10) / 10

export interface DaySummary {
  date: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number; water_ml: number
  meals_logged: number; slots: { slot: string; label: string; scheduled: string | null; status: 'logged' | 'skipped' | 'unlogged'; eaten_at?: string; kcal?: number }[]
  meals: { name: string; slot: string; time: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number; photo: boolean; items: string[] }[]
  added_fats_kcal: number; reminders: { completed: number; skipped: number; no_response: number }
  workout: { minutes: number; est_kcal: number; category: string } | null
}

/** Loads everything the AI may reason about for one user, from confirmed records only. */
export async function loadContext(sb: any, uid: string, date: string, days = 7) {
  const from = addDays(date, -(days - 1))
  const q = (t: string) => sb.from(t).select('*').eq('user_id', uid).is('deleted_at', null)
  const [profile, targets, prefs, meals, water, weights, reminders, events, workouts] = await Promise.all([
    q('profiles').maybeSingle(), q('nutrition_targets').maybeSingle(), q('user_preferences').maybeSingle(),
    q('meals').gte('local_date', from).lte('local_date', date).order('eaten_at'),
    q('water_logs').gte('local_date', from).lte('local_date', date),
    q('weight_logs').gte('local_date', addDays(date, -29)).lte('local_date', date).order('local_date'),
    q('reminders').order('time'), q('reminder_events').gte('local_date', from).lte('local_date', date),
    q('workouts').gte('local_date', from).lte('local_date', date),
  ])
  const mealRows: any[] = meals.data ?? []
  const ids = mealRows.map(m => m.id)
  const items: any[] = ids.length ? ((await q('meal_items').in('meal_id', ids)).data ?? []) : []
  const photos: any[] = ids.length ? ((await q('meal_photos').in('meal_id', ids)).data ?? []) : []
  const tz = profile.data?.timezone || 'UTC'
  const time = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
  const mealReminders = (reminders.data ?? []).filter((r: any) => r.kind === 'meal' && r.enabled)

  const summaries: DaySummary[] = []
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i)
    const dayMeals = mealRows.filter(m => m.local_date === d)
    const logged = dayMeals.filter(m => m.status === 'logged')
    const mealOut = logged.map(m => {
      const its = items.filter(x => x.meal_id === m.id).sort((a, b) => a.sort - b.sort)
      const s = (k: string) => its.reduce((n, x) => n + Number(x[k] || 0), 0)
      return { name: m.name || SLOT_NAMES[m.slot] || 'Meal', slot: m.slot, time: time(m.eaten_at), kcal: Math.round(s('kcal')), protein_g: r1(s('protein_g')), carbs_g: r1(s('carbs_g')), fat_g: r1(s('fat_g')), fibre_g: r1(s('fibre_g')),
        photo: photos.some(p => p.meal_id === m.id), items: its.map(x => `${x.name} ${Math.round(x.quantity)}${x.unit}${x.cooking_method ? ` (${x.cooking_method})` : ''} — ${Math.round(x.kcal)} kcal [${x.source}]`),
        fats: its.filter(x => /\b(oil|ghee|butter|mayo|mayonnaise)\b/i.test(x.name)).reduce((n, x) => n + Number(x.kcal || 0), 0) }
    })
    const tot = (k: string) => mealOut.reduce((n, m: any) => n + m[k], 0)
    const dayEvents = (events.data ?? []).filter((e: any) => e.local_date === d)
    const slots = mealReminders.map((r: any) => {
      const lm = logged.find(m => m.slot === r.slot), sk = dayMeals.find(m => m.slot === r.slot && m.status === 'skipped')
      const ev = dayEvents.find((e: any) => e.reminder_id === r.id)
      const status = lm ? 'logged' : (sk || ev?.status === 'skipped') ? 'skipped' : 'unlogged'
      return { slot: r.slot, label: r.label, scheduled: r.time, status, ...(lm ? { eaten_at: time(lm.eaten_at), kcal: mealOut.find(m => m.slot === r.slot)?.kcal } : {}) }
    })
    const w = (workouts.data ?? []).filter((x: any) => x.local_date === d)
    summaries.push({
      date: d, kcal: Math.round(tot('kcal')), protein_g: r1(tot('protein_g')), carbs_g: r1(tot('carbs_g')), fat_g: r1(tot('fat_g')), fibre_g: r1(tot('fibre_g')),
      water_ml: (water.data ?? []).filter((x: any) => x.local_date === d).reduce((n: number, x: any) => n + Number(x.amount_ml), 0),
      meals_logged: logged.length, slots: slots as any, meals: mealOut.map(({ fats: _f, ...m }: any) => m),
      added_fats_kcal: Math.round(mealOut.reduce((n, m: any) => n + m.fats, 0)),
      reminders: { completed: slots.filter((s: any) => s.status === 'logged').length, skipped: slots.filter((s: any) => s.status === 'skipped').length, no_response: slots.filter((s: any) => s.status === 'unlogged').length },
      workout: w.length ? { minutes: w.reduce((n: number, x: any) => n + Number(x.duration_min), 0), est_kcal: w.reduce((n: number, x: any) => n + Number(x.est_kcal), 0), category: w.map((x: any) => x.category).join(', ') } : null,
    })
  }
  const p = profile.data, t = targets.data, pr = prefs.data
  return {
    tz,
    profile: p ? { name: p.name, sex: p.sex, age: p.age, height_cm: Number(p.height_cm), weight_kg: Number(p.weight_kg), activity: p.activity, goal: p.goal } : null,
    targets: t ? { kcal: Number(t.kcal), protein_g: Number(t.protein_g), carbs_g: Number(t.carbs_g), fat_g: Number(t.fat_g), fibre_g: Number(t.fibre_g), water_ml: Number(t.water_ml) } : null,
    preferences: pr ? { diet: pr.diet, preferred_foods: pr.preferred, avoid_foods: pr.avoid, whey_max_scoops_per_day: pr.whey_max_scoops } : null,
    today: summaries[summaries.length - 1], history: summaries.slice(0, -1),
    weights: (weights.data ?? []).map((x: any) => ({ date: x.local_date, kg: Number(x.weight_kg) })),
  }
}
