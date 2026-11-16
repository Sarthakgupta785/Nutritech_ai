import { ai, PRINCIPLES } from './ai.ts'
import { loadContext } from './context.ts'
import { addDays, stableId } from './util.ts'

const str = { type: 'string' }
const DAILY_TOOL = {
  name: 'daily_report', description: 'Structured end-of-day nutrition report',
  input_schema: { type: 'object', required: ['headline', 'calorie_target', 'protein', 'carb_fat_balance', 'strongest_meal', 'meal_to_improve', 'schedule', 'missed_meals', 'oil_and_extras', 'adjustments', 'improve_tomorrow', 'action_plan'],
    properties: {
      headline: { ...str, description: 'One encouraging, honest sentence summarising the day' },
      calorie_target: { ...str, description: 'Did they stay within the calorie target? Use the numbers.' },
      protein: { ...str, description: 'Was protein sufficient versus target?' },
      carb_fat_balance: { ...str, description: 'Were carbs and fats balanced versus targets?' },
      strongest_meal: { ...str, description: 'Which logged meal was strongest and why' },
      meal_to_improve: { ...str, description: 'Which logged meal could be improved and one concrete tweak' },
      schedule: { ...str, description: 'Did meal times follow the schedule? Compare eaten_at to scheduled.' },
      missed_meals: { ...str, description: 'Skipped meals (explicitly marked) and unlogged slots, kept distinct' },
      oil_and_extras: { ...str, description: 'Added oil/fats/sauces/extra calories, based only on logged items' },
      adjustments: { ...str, description: 'What got in the way today, phrased as neutral observations rather than faults' },
      improve_tomorrow: { ...str, description: 'The main thing to do differently tomorrow' },
      action_plan: { type: 'array', minItems: 3, maxItems: 3, items: str, description: 'Exactly three specific, doable actions for tomorrow that fit the preferences' },
    } },
}

export async function generateDaily(sb: any, uid: string, date: string) {
  const ctx = await loadContext(sb, uid, date, 7)
  const day = ctx.today
  const nothing = day.meals_logged === 0
  const report = await ai({
    system: `${PRINCIPLES}\n\nWrite the end-of-day report. Each field is 1–3 short sentences in plain language, addressed to the user as "you". ${nothing ? 'No meals were logged today: say so plainly without judgment, do not analyse food that is not there, and make the action plan about making logging easy tomorrow.' : ''}`,
    messages: [{ role: 'user', content: `Report date: ${date}\n\nRecords (JSON):\n${JSON.stringify(ctx)}` }],
    tool: DAILY_TOOL, max_tokens: 1400,
  })
  const row = { id: await stableId(`daily:${uid}:${date}`), user_id: uid, local_date: date, summary: { day, targets: ctx.targets }, report, deleted_at: null }
  const { error } = await sb.from('daily_reports').upsert(row)
  if (error) throw new Error(error.message)
  return row
}

const WEEKLY_TOOL = {
  name: 'weekly_report', description: 'Structured weekly progress report',
  input_schema: { type: 'object', required: ['headline', 'progress', 'nutrition', 'consistency', 'weight_trend', 'improvements'],
    properties: {
      headline: str, progress: { ...str, description: 'Overall progress this week in 2–3 sentences' },
      nutrition: { ...str, description: 'Average calories and macros versus targets' },
      consistency: { ...str, description: 'Meal logging, schedule and hydration consistency; unlogged is not skipped' },
      weight_trend: { ...str, description: 'Weight trend using multi-day averages only; if fewer than 4 weigh-ins say there is not enough data' },
      improvements: { type: 'array', minItems: 2, maxItems: 4, items: str },
    } },
}

export async function generateWeekly(sb: any, uid: string, start: string) {
  const end = addDays(start, 6)
  const ctx = await loadContext(sb, uid, end, 7)
  const days = [...ctx.history, ctx.today]
  const report = await ai({
    system: `${PRINCIPLES}\n\nWrite the weekly report for ${start} to ${end}. Only count days that have logged meals when averaging intake, and say how many days that was. Each text field is 2–3 short sentences.`,
    messages: [{ role: 'user', content: JSON.stringify({ ...ctx, today: undefined, history: undefined, days }) }],
    tool: WEEKLY_TOOL, max_tokens: 1200,
  })
  const row = { id: await stableId(`weekly:${uid}:${start}`), user_id: uid, week_start: start, summary: { days, targets: ctx.targets, weights: ctx.weights }, report, deleted_at: null }
  const { error } = await sb.from('weekly_reports').upsert(row)
  if (error) throw new Error(error.message)
  return row
}
