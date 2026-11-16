import { describe, expect, it } from 'vitest'
import { weightStats } from '../src/lib/analytics'
import { addDays, lastNDays, localDate, weekStart } from '../src/lib/dates'
import { draftFromFood, FOODS, FOOD_BY_ID, matchesAvoid, searchFoods } from '../src/lib/foods'
import { bmr, checkCalorieTarget, per100From, scale, suggestTargets, sum, tdee, withQuantity, workoutKcal } from '../src/lib/nutrition'
import { generateWorkout } from '../src/workouts/generator'
import { EXERCISES } from '../src/workouts/exercises'

const me = { sex: 'male' as const, age: 30, height_cm: 175, weight_kg: 93, activity: 'sedentary' as const }

describe('energy and targets', () => {
  it('Mifflin-St Jeor matches a hand calculation', () => {
    expect(bmr(me)).toBeCloseTo(10 * 93 + 6.25 * 175 - 5 * 30 + 5, 5) // 1878.75
    expect(tdee(me)).toBeCloseTo(1878.75 * 1.2, 5)
  })
  it('suggests a moderate deficit, never 1,200 kcal for this profile', () => {
    const s = suggestTargets(me)
    expect(s.targets.kcal).toBe(1800)
    expect(s.targets.protein_g).toBe(150)
    const macroKcal = s.targets.protein_g * 4 + s.targets.carbs_g * 4 + s.targets.fat_g * 9
    expect(Math.abs(macroKcal - s.targets.kcal)).toBeLessThan(60)
  })
  it('warns on restrictive calorie targets', () => {
    expect(checkCalorieTarget(1200, me).level).toBe('danger')
    expect(checkCalorieTarget(1550, me).level).toBe('danger') // below 85% of resting needs
    expect(checkCalorieTarget(1650, me).level).toBe('caution')
    expect(checkCalorieTarget(1800, me).level).toBe('ok')
  })
})

describe('food maths', () => {
  it('scales reference values by quantity', () => {
    const chicken = draftFromFood(FOOD_BY_ID.chicken_breast, 150)
    expect(chicken.kcal).toBe(248); expect(chicken.protein_g).toBe(46.5)
    const eggs = withQuantity(draftFromFood(FOOD_BY_ID.egg_whole), 100)
    expect(eggs.kcal).toBe(155)
  })
  it('the example plate from the brief adds up', () => {
    const plate = [draftFromFood(FOOD_BY_ID.chicken_breast, 150), draftFromFood(FOOD_BY_ID.brown_rice, 150), draftFromFood(FOOD_BY_ID.egg_whole, 100), draftFromFood(FOOD_BY_ID.cucumber, 50)]
    const t = sum(plate)
    expect(t.kcal).toBe(248 + 185 + 155 + 8)
    expect(Math.round(t.protein_g)).toBe(64)
  })
  it('per-100 round trip keeps AI items rescalable', () => {
    const p = per100From({ kcal: 300, protein_g: 20, carbs_g: 30, fat_g: 10, fibre_g: 2 }, 200)!
    expect(scale(p, 100).kcal).toBe(150)
  })
  it('every reference food is internally plausible (Atwater within tolerance)', () => {
    for (const f of FOODS) {
      const est = f.protein_g * 4 + f.carbs_g * 4 + f.fat_g * 9
      expect(Math.abs(est - f.kcal), f.name).toBeLessThanOrEqual(Math.max(22, f.kcal * 0.18))
      expect(f.servings.length, f.name).toBeGreaterThan(0)
    }
    expect(new Set(FOODS.map(f => f.id)).size).toBe(FOODS.length)
  })
  it('search and avoid list', () => {
    expect(searchFoods(FOODS, 'brown rice')[0].id).toBe('brown_rice')
    expect(searchFoods(FOODS, 'anda')[0].id).toBe('egg_whole')
    expect(matchesAvoid('Paneer tikka', ['Paneer', 'Bread'])).toBe('Paneer')
    expect(matchesAvoid('Chicken breast', ['Paneer', 'Bread'])).toBeNull()
  })
})

describe('dates', () => {
  it('buckets an instant by the given timezone', () => {
    const t = new Date('2026-11-15T20:30:00Z') // 02:00 next day in Kolkata
    expect(localDate(t, 'Asia/Kolkata')).toBe('2026-11-16')
    expect(localDate(t, 'America/New_York')).toBe('2026-11-15')
  })
  it('date arithmetic', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(weekStart('2026-11-16')).toBe('2026-11-16') // a Monday
    expect(weekStart('2026-11-22')).toBe('2026-11-16')
    expect(lastNDays('2026-11-16', 7)[0]).toBe('2026-11-10')
  })
})

describe('weight trend', () => {
  it('uses moving averages, not single days', () => {
    const logs = Array.from({ length: 14 }, (_, i) => ({ local_date: addDays('2026-11-01', i), weight_kg: 93 - i * 0.1 + [0.3, -0.3, 0.2, -0.2, 0.1, -0.1, 0][i % 7] })) // daily noise that averages out over a week
    const s = weightStats(logs, '2026-11-14')
    expect(s.weeklyChange!).toBeCloseTo(-0.7, 1)
    expect(s.series.at(-1)!.avg7).not.toBeNull()
    expect(weightStats(logs.slice(0, 2), '2026-11-02').weeklyChange).toBeNull()
  })
})

describe('workouts', () => {
  it('has all 22 exercises with complete instructions and at least two illustration frames', () => {
    expect(EXERCISES.length).toBe(22)
    for (const e of EXERCISES) {
      expect(e.frames.length, e.name).toBeGreaterThanOrEqual(2)
      for (const f of e.frames) expect(f.length, e.name).toBe(22)
      for (const k of ['start', 'posture', 'breathing', 'modification', 'safety'] as const) expect(e[k].length, `${e.name} ${k}`).toBeGreaterThan(10)
      expect(e.steps.length).toBeGreaterThanOrEqual(2); expect(e.mistakes.length).toBeGreaterThanOrEqual(2); expect(e.muscles.length).toBeGreaterThan(0)
    }
  })
  it('generates equipment-free routines that fit the time and honour low impact', () => {
    for (const minutes of [5, 10, 15, 20, 30] as const) {
      const w = generateWorkout({ level: 'beginner', minutes, focus: 'full', impact: 'low', category: 'fatloss', completed: 0 })
      expect(w.estMinutes).toBeLessThanOrEqual(minutes + 2)
      expect(w.estMinutes).toBeGreaterThanOrEqual(minutes * 0.6)
      expect(w.blocks.every(b => b.exercise.impact === 'low')).toBe(true)
      expect(w.blocks.every(b => b.exercise.level <= 2)).toBe(true)
    }
    expect(workoutKcal(20, 93, 3.5)).toBe(109)
  })
})
