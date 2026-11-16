import { EXERCISES, type Exercise, type Group } from './exercises'

export type Category = 'beginner' | 'fatloss' | 'strength'
export type Focus = 'full' | Group
export interface GenOptions { level: 'beginner' | 'intermediate'; minutes: 5 | 10 | 15 | 20 | 30; focus: Focus; impact: 'low' | 'regular'; category: Category; completed: number; seed?: string }
export interface Block { exercise: Exercise; sets: number; target: number; unit: 'reps' | 'sec'; rest: number; warmup?: boolean }
export interface GeneratedWorkout { title: string; category: Category; difficulty: string; blocks: Block[]; estMinutes: number; muscles: string[]; met: number; options: GenOptions }

export const CATEGORY_LABEL: Record<Category, { title: string; blurb: string }> = {
  beginner: { title: 'Beginner', blurb: 'Gentle, simple moves with generous rests' },
  fatloss: { title: 'Fat-loss and general fitness', blurb: 'Steady circuits that keep you moving' },
  strength: { title: 'Strength and muscle preservation', blurb: 'Slower sets to keep muscle while losing fat' },
}

function rng(seed: string) { let h = 2166136261; for (const c of seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000 } }
const shuffle = <T,>(xs: T[], r: () => number) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }
const workSeconds = (b: Pick<Block, 'target' | 'unit'> & { exercise: Exercise }) => (b.unit === 'sec' ? b.target : b.target * 3.2) * (b.exercise.perSide ? 2 : 1)
export const blockSeconds = (b: Block) => b.sets * (workSeconds(b) + b.rest)

/**
 * Builds an equipment-free routine that fits the chosen time. Difficulty rises slowly with the number
 * of workouts already completed (a rep or a few seconds every third session, capped), never by jumps.
 */
export function generateWorkout(o: GenOptions): GeneratedWorkout {
  const r = rng(o.seed ?? `${o.category}-${o.minutes}-${o.focus}-${o.impact}-${o.completed}`)
  const maxLevel = o.category === 'beginner' ? (o.level === 'beginner' ? 1 : 2) : o.level === 'beginner' ? 2 : 3
  const pool = EXERCISES.filter(e => e.level <= maxLevel && (o.impact === 'regular' || e.impact === 'low'))
  const by = (g: Group) => shuffle(pool.filter(e => e.group === g && e.id !== 'arm_circles' && e.id !== 'march'), r)
  const progress = Math.min(Math.floor(o.completed / 3), 4)
  const rest = o.category === 'strength' ? 40 : o.category === 'fatloss' ? 20 : 30
  const sets = o.category === 'strength' ? 3 : o.minutes <= 5 ? 1 : 2
  const scale = o.category === 'beginner' ? 0.8 : 1
  const mk = (e: Exercise): Block => {
    const cap = Math.round(e.base * 1.5)
    const target = Math.min(cap, Math.max(e.unit === 'sec' ? 10 : 4, Math.round(e.base * scale) + (e.unit === 'sec' ? progress * 5 : progress)))
    return { exercise: e, sets, target, unit: e.unit, rest }
  }

  // Order of muscle groups: full body rotates through all; a focus alternates the focus with support work.
  const order: Group[] = o.focus === 'full'
    ? (o.category === 'fatloss' ? ['cardio', 'lower', 'cardio', 'upper', 'core'] : o.category === 'strength' ? ['lower', 'upper', 'core', 'lower', 'upper'] : ['lower', 'upper', 'core', 'cardio'])
    : o.focus === 'cardio' ? ['cardio', 'cardio', 'lower'] : [o.focus, o.focus, o.focus === 'core' ? 'lower' : 'core']
  const queues: Record<Group, Exercise[]> = { upper: by('upper'), lower: by('lower'), core: by('core'), cardio: by('cardio') }
  const used: Record<Group, number> = { upper: 0, lower: 0, core: 0, cardio: 0 }

  const blocks: Block[] = []
  const march = EXERCISES.find(e => e.id === 'march')!, circles = EXERCISES.find(e => e.id === 'arm_circles')!
  blocks.push({ exercise: march, sets: 1, target: o.minutes <= 5 ? 40 : 60, unit: 'sec', rest: 10, warmup: true })
  if (o.minutes >= 10) blocks.push({ exercise: circles, sets: 1, target: 30, unit: 'sec', rest: 10, warmup: true })

  const budget = o.minutes * 60
  let total = blocks.reduce((n, b) => n + blockSeconds(b), 0), i = 0, guard = 0
  while (total < budget - 45 && guard++ < 60) {
    const g = order[i++ % order.length]; const q = queues[g]; if (!q.length) continue
    const b = mk(q[used[g]++ % q.length])
    while (b.sets > 1 && total + blockSeconds(b) > budget + 30) b.sets--
    if (total + blockSeconds(b) > budget + 60) break
    blocks.push(b); total += blockSeconds(b)
  }
  const main = blocks.filter(b => !b.warmup)
  const met = main.length ? main.reduce((n, b) => n + b.exercise.met * blockSeconds(b), 0) / main.reduce((n, b) => n + blockSeconds(b), 0) : 3
  const focusName = o.focus === 'full' ? 'Full body' : { upper: 'Upper body', lower: 'Lower body', core: 'Core', cardio: 'Cardio' }[o.focus]
  return {
    title: `${o.minutes}-minute ${focusName.toLowerCase()} ${o.category === 'strength' ? 'strength' : o.category === 'fatloss' ? 'circuit' : 'starter'}`,
    category: o.category, difficulty: maxLevel === 1 ? 'Beginner' : maxLevel === 2 ? 'Moderate' : 'Challenging',
    blocks, estMinutes: Math.round(total / 60), muscles: [...new Set(main.flatMap(b => b.exercise.muscles))].slice(0, 6),
    // Rests are included in the duration, so the effective intensity is reduced accordingly.
    met: Math.round(met * 0.85 * 10) / 10, options: o,
  }
}

/** Today's suggestion rotates the three categories by date and backs off after consecutive training days. */
export function suggestForToday(date: string, level: 'beginner' | 'intermediate', completed: number, trainedYesterday: boolean, trainedDayBefore: boolean): { workout: GeneratedWorkout; note: string | null } {
  const dayNum = Math.floor(new Date(date + 'T12:00:00Z').getTime() / 86400000)
  const restful = trainedYesterday && trainedDayBefore
  const category: Category = restful || completed < 3 ? 'beginner' : (['fatloss', 'strength', 'beginner'] as const)[dayNum % 3]
  const workout = generateWorkout({ level, minutes: restful ? 10 : completed < 3 ? 10 : 15, focus: 'full', impact: 'low', category, completed, seed: `${date}-${category}` })
  return { workout, note: restful ? 'You have trained two days in a row. A rest day or this gentle session is a good choice today.' : null }
}
