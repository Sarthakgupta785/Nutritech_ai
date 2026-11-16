import { api } from '../lib/api'
import { patch, sync } from '../lib/db'
import type { Workout, WorkoutAi } from '../lib/types'
import { EX_BY_ID, GROUP_LABEL, type Group } from './exercises'
import type { GeneratedWorkout } from './generator'

const KEY = 'nt_workout'
export interface StoredWorkout { title: string; category: string; difficulty: string; met: number; blocks: { id: string; sets: number; target: number; unit: 'reps' | 'sec'; rest: number; warmup?: boolean }[] }
export function stashWorkout(w: GeneratedWorkout) {
  const s: StoredWorkout = { title: w.title, category: w.category, difficulty: w.difficulty, met: w.met, blocks: w.blocks.map(b => ({ id: b.exercise.id, sets: b.sets, target: b.target, unit: b.unit, rest: b.rest, warmup: b.warmup })) }
  sessionStorage.setItem(KEY, JSON.stringify(s))
}
export function readWorkout(): StoredWorkout | null { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { return null } }
export const clearWorkout = () => sessionStorage.removeItem(KEY)

/** Rule-based feedback used offline and as a fallback; the AI version replaces it when available. */
export function localFeedback(w: Pick<Workout, 'exercises' | 'effort' | 'duration_min'>, consecutiveDays: number): WorkoutAi {
  const groups = new Map<Group, number>()
  const muscles = new Set<string>()
  for (const e of w.exercises) { const ex = EX_BY_ID[e.exercise_id]; if (!ex) continue; groups.set(ex.group, (groups.get(ex.group) ?? 0) + e.sets.length); ex.muscles.forEach(m => muscles.add(m)) }
  const all: Group[] = ['upper', 'lower', 'core', 'cardio']
  const missing = all.filter(g => !groups.has(g))
  const effort = w.effort ?? 5
  return {
    muscles: muscles.size ? `You trained: ${[...muscles].join(', ')}.` : 'This session was logged without exercise details.',
    balance: !groups.size ? 'Add exercise details next time for a balance check.' : missing.length === 0 ? 'Well balanced: upper body, lower body, core and cardio were all included.' : `Covered ${[...groups.keys()].map(g => GROUP_LABEL[g].toLowerCase()).join(', ')}. Not included: ${missing.map(g => GROUP_LABEL[g].toLowerCase()).join(', ')}.`,
    difficulty: effort >= 9 ? 'That was very hard for you. Choose an easier level or shorter session next time.' : effort >= 7 ? 'Challenging but manageable. Stay at this level until it feels like a 5–6.' : effort >= 4 ? 'The difficulty looks about right.' : 'This felt easy. You could add a few minutes or a couple of reps next time, if you want to.',
    improve: 'Keep every rep controlled. If your form slipped near the end, stop one or two reps earlier next time.',
    complement: missing.length ? `A short ${GROUP_LABEL[missing[0]].toLowerCase()} session would round this out.` : 'A relaxed walk or a rest day pairs well with this.',
    recovery: consecutiveDays >= 3 || effort >= 8 ? 'Take a rest day tomorrow, or keep it to an easy walk. Muscles adapt while you recover.' : 'Drink some water and have a protein-containing meal within your normal targets. A rest day whenever you feel like it is fine.',
  }
}
export async function requestWorkoutFeedback(w: Workout) {
  try {
    await sync()
    const { feedback } = await api<{ feedback: WorkoutAi }>('workout_feedback', { date: w.local_date, workout: { category: w.category, difficulty: w.difficulty, duration_min: w.duration_min, effort: w.effort, notes: w.notes, exercises: w.exercises.map(e => ({ name: e.name, sets: e.sets, unit: e.unit, muscles: EX_BY_ID[e.exercise_id]?.muscles })) } })
    await patch('workouts', w.id, { ai_feedback: feedback })
  } catch { /* the rule-based feedback already saved stays in place */ }
}
