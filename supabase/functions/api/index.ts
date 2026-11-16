// NutriTrack AI — authenticated API for the app. Every action requires the signed-in user's JWT.
// Secrets used (Supabase → Edge Functions → Secrets): GEMINI_API_KEY (or ANTHROPIC_API_KEY), AI_MODEL (optional),
// FDC_API_KEY (optional), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { ai, PRINCIPLES } from '../_shared/ai.ts'
import { loadContext } from '../_shared/context.ts'
import { generateDaily, generateWeekly } from '../_shared/reports.ts'
import { cors, json, localDate } from '../_shared/util.ts'
import { sendPush, vapidFromEnv } from '../_shared/webpush.ts'

// Supabase provides legacy SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY and, on newer projects,
// SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS (comma separated). Accept whichever exists.
function envKey(...names: string[]): string {
  for (const n of names) { const v = Deno.env.get(n); if (v) return v.split(',')[0].trim() }
  return ''
}
const ANON_KEY = () => envKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS')
const SERVICE_KEY = () => envKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS')

const num = { type: 'number' }, str = { type: 'string' }

const ANALYZE_TOOL = {
  name: 'meal_analysis', description: 'Foods visible in a meal photo with estimated portions and nutrition',
  input_schema: { type: 'object', required: ['meal_name', 'items', 'questions', 'assumptions', 'overall_confidence'],
    properties: {
      meal_name: { ...str, description: 'Short descriptive name, e.g. "Chicken, brown rice and eggs"' },
      items: { type: 'array', items: { type: 'object', required: ['name', 'grams', 'unit', 'ref_id', 'cooking_method', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'confidence', 'portion_unclear'],
        properties: {
          name: str, grams: { ...num, description: 'Estimated amount in grams (or ml for liquids)' }, unit: { type: 'string', enum: ['g', 'ml'] },
          ref_id: { type: ['string', 'null'], description: 'id from the reference list if this is clearly that food as prepared, otherwise null' },
          cooking_method: { type: ['string', 'null'], description: 'raw, boiled, steamed, grilled, roasted, pan-fried, deep-fried, curry, baked, or null if unknown' },
          kcal: num, protein_g: num, carbs_g: num, fat_g: num, fibre_g: num,
          confidence: { ...num, description: '0–1 confidence in identity AND portion together' },
          portion_unclear: { type: 'boolean', description: 'true when the amount cannot be judged well from the photo' },
          note: { ...str, description: 'Optional short note, e.g. what made the portion hard to judge' },
        } } },
      questions: { type: 'array', maxItems: 3, items: { type: 'object', required: ['question', 'kind'], properties: { question: str, kind: { type: 'string', enum: ['oil', 'sauce', 'other'] } } },
        description: 'Only questions whose answer would change the estimate materially: hidden cooking oil/ghee/butter, dressings, sauces, sugar in drinks' },
      assumptions: { ...str, description: 'One or two sentences on the main assumptions (plate size, cooked vs raw, oil assumed or not)' },
      overall_confidence: num,
    } },
}

async function analyzeMeal(b: any) {
  if (!b.image) throw new Error('No image supplied')
  const refs = Array.isArray(b.refs) ? b.refs.slice(0, 200).map((r: any) => `${r.id}: ${r.name}`).join('\n') : ''
  const out = await ai({
    system: `You estimate the contents of meal photographs for a food diary. Be careful and honest about uncertainty.
- List every distinct visible food, drink, sauce, chutney and visible oil/butter separately.
- Estimate amounts in grams (ml for liquids) of the food as served, using plate, bowl, cutlery and hand size as scale cues. A photo cannot give exact weights: set portion_unclear true and lower confidence when depth, stacking or bowls hide volume.
- Nutrition values are estimates for the estimated amount. Do NOT include invisible cooking fat in a food's numbers; instead ask about it in "questions" when the dish looks pan-fried, deep-fried, sautéed or curry-based, or when a dressing/sauce may be present.
- Identify the cooking method only when visible cues support it; otherwise null.
- Set ref_id only for a confident match to the reference list. For mixed dishes not in the list use null.
- If the image contains no food, return an empty items array and explain in assumptions.
- Context only (do not let it override what you see): ${String(b.hint || 'no extra context').slice(0, 300)}`,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: b.media_type || 'image/jpeg', data: b.image } },
      { type: 'text', text: `Reference food ids:\n${refs}\n\nAnalyse this meal photo.` },
    ] }],
    tool: ANALYZE_TOOL, max_tokens: 2500,
  })
  return { ...out, analysed_at: new Date().toISOString() }
}

async function foodSearch(q: string) {
  const key = Deno.env.get('FDC_API_KEY') || 'DEMO_KEY'
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&pageSize=20&dataType=${encodeURIComponent('Foundation,SR Legacy')}&query=${encodeURIComponent(q)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`USDA search failed (${res.status})`)
  const data = await res.json()
  const pick = (ns: any[], ...ids: number[]) => { for (const id of ids) { const n = ns.find(x => x.nutrientId === id); if (n && typeof n.value === 'number') return n.value } return null }
  return (data.foods ?? []).map((f: any) => {
    const ns = f.foodNutrients ?? []
    const kcal = pick(ns, 1008, 2048, 2047)
    return kcal == null ? null : { fdc_id: f.fdcId, name: f.description, kcal, protein_g: pick(ns, 1003) ?? 0, carbs_g: pick(ns, 1005) ?? 0, fat_g: pick(ns, 1004) ?? 0, fibre_g: pick(ns, 1079) ?? 0 }
  }).filter(Boolean)
}

const WORKOUT_TOOL = {
  name: 'workout_feedback', description: 'Feedback on a completed home workout',
  input_schema: { type: 'object', required: ['muscles', 'balance', 'difficulty', 'improve', 'complement', 'recovery'],
    properties: { muscles: str, balance: str, difficulty: str, improve: str, complement: str, recovery: str } },
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const auth = req.headers.get('Authorization') ?? ''
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, ANON_KEY(), { global: { headers: { Authorization: auth } } })
    const { data: { user } } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
    if (!user) return json({ error: 'Not signed in' }, 401)
    const b = await req.json()
    const tz = (await sb.from('profiles').select('timezone').eq('id', user.id).maybeSingle()).data?.timezone || 'UTC'
    const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '') ? b.date : localDate(new Date(), tz)

    switch (b.action) {
      case 'analyze_meal': return json({ analysis: await analyzeMeal(b) })
      case 'food_search': return json({ foods: await foodSearch(String(b.q || '').slice(0, 80)) })
      case 'daily_report': return json({ report: await generateDaily(sb, user.id, date) })
      case 'weekly_report': return json({ report: await generateWeekly(sb, user.id, b.week_start) })
      case 'meal_feedback': {
        const ctx = await loadContext(sb, user.id, date, 1)
        const text = await ai({ system: `${PRINCIPLES}\n\nGive feedback on one meal in at most 2 short sentences: what is good about it for the user's goal, and one optional small tweak. No lists.`,
          messages: [{ role: 'user', content: `Targets: ${JSON.stringify(ctx.targets)}\nPreferences: ${JSON.stringify(ctx.preferences)}\nDay so far: ${ctx.today.kcal} kcal, ${ctx.today.protein_g} g protein\nMeal: ${JSON.stringify(b.meal)}` }], max_tokens: 200 })
        return json({ feedback: text })
      }
      case 'coach': {
        const ctx = await loadContext(sb, user.id, date, 7)
        const history = (Array.isArray(b.messages) ? b.messages : []).slice(-14).map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 4000) }))
        while (history.length && history[0].role !== 'user') history.shift()
        if (!history.length) throw new Error('No message')
        const t = ctx.targets, d = ctx.today
        const remaining = t ? `Remaining today versus target: ${Math.round(t.kcal - d.kcal)} kcal, ${Math.round(t.protein_g - d.protein_g)} g protein, ${Math.round(t.carbs_g - d.carbs_g)} g carbs, ${Math.round(t.fat_g - d.fat_g)} g fat.` : ''
        const text = await ai({
          system: `${PRINCIPLES}\n\nYou are chatting as the user's coach. Answer the actual question first, using their numbers. Keep replies short (under 150 words unless they ask for detail), plain text, no markdown headings. When suggesting food, give portions in grams and approximate calories and protein, and keep suggestions within what remains today.\n\nToday is ${date}. ${remaining}\n\nUser records (JSON):\n${JSON.stringify(ctx)}`,
          messages: history, max_tokens: 700,
        })
        return json({ reply: text })
      }
      case 'workout_feedback': {
        const ctx = await loadContext(sb, user.id, date, 7)
        const recent = [...ctx.history, ctx.today].filter(x => x.workout).map(x => ({ date: x.date, ...x.workout }))
        const out = await ai({ system: `${PRINCIPLES}\n\nGive feedback on an optional, equipment-free home workout by a beginner. One or two short sentences per field. "recovery" should suggest rest when they trained on several consecutive days or reported high effort. Never pressure the user to train more; workouts are optional.`,
          messages: [{ role: 'user', content: `Workout: ${JSON.stringify(b.workout)}\nRecent workouts: ${JSON.stringify(recent)}\nProfile: ${JSON.stringify(ctx.profile)}` }], tool: WORKOUT_TOOL, max_tokens: 700 })
        return json({ feedback: out })
      }
      case 'test_push': {
        const vapid = vapidFromEnv(k => Deno.env.get(k))
        if (!vapid) throw new Error('VAPID keys are not set in Supabase function secrets')
        const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', user.id).is('deleted_at', null)
        if (!subs?.length) throw new Error('This device has no push subscription yet')
        const results = await Promise.all(subs.map(s => sendPush(s, { title: 'NutriTrack AI', body: 'Notifications are working.', url: '/', tag: 'test' }, vapid)))
        return json({ sent: results.filter(s => s >= 200 && s < 300).length, statuses: results })
      }
      default: return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
