// NutriTrack AI — reminder scheduler. Called once a minute by pg_cron (see migrations/0003_cron.sql).
// Sends due reminders as Web Push in each user's own timezone, delivers snoozed reminders, and
// generates the nightly (and Sunday weekly) AI report before the review notification goes out.
// Deploy with:  supabase functions deploy tick --no-verify-jwt   (it is protected by CRON_SECRET instead)
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generateDaily, generateWeekly } from '../_shared/reports.ts'
import { json, localDate, localMinutes, localWeekday, stableId, weekdayIndex, weekStart } from '../_shared/util.ts'
import { sendPush, vapidFromEnv } from '../_shared/webpush.ts'

// Supabase provides legacy SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY and, on newer projects,
// SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS (comma separated). Accept whichever exists.
function envKey(...names: string[]): string {
  for (const n of names) { const v = Deno.env.get(n); if (v) return v.split(',')[0].trim() }
  return ''
}
const ANON_KEY = () => envKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS')
const SERVICE_KEY = () => envKey('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS')

const WINDOW_MIN = 20 // a reminder is still delivered if the scheduler was late by up to this many minutes

const COPY: Record<string, { title: string; body: string }> = {
  hydration: { title: 'Hydration 💧', body: 'Time for a glass of water.' },
  breakfast: { title: 'Breakfast time 🍳', body: 'Take a photo of your breakfast to log it.' },
  mid_morning: { title: 'Mid-morning snack 🍎', body: 'Time for your snack. Snap a photo to log it.' },
  lunch: { title: 'Lunch time 🍛', body: 'Take a photo of your lunch to log it.' },
  evening_snack: { title: 'Evening snack 🥜', body: 'Time for your snack. Snap a photo to log it.' },
  dinner: { title: 'Dinner time 🍽️', body: 'Take a photo of your dinner to log it.' },
  review: { title: 'Your daily report is ready 📊', body: 'See how today went and get three ideas for tomorrow.' },
}

/** A reminder's push text. Hydration and weight use the user's own label, so extra ones added
 *  through the day don't all announce themselves as the morning reminder. */
function copyFor(r: { kind: string; slot: string | null; label: string }): { title: string; body: string } {
  if (r.kind === 'meal') return COPY[r.slot ?? ''] ?? { title: r.label, body: 'Tap to log this meal.' }
  if (r.kind === 'hydration') return { title: `${r.label} 💧`, body: COPY.hydration.body }
  if (r.kind === 'weight') return { title: `${r.label} ⚖️`, body: 'Log your weight so the weekly trend stays accurate.' }
  return COPY[r.kind] ?? { title: r.label, body: 'Tap to open NutriTrack.' }
}

Deno.serve(async req => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, SERVICE_KEY())
  const vapid = vapidFromEnv(k => Deno.env.get(k))
  const now = new Date()
  const stats = { pushed: 0, snoozed: 0, reports: 0, removed: 0, errors: [] as string[] }

  async function push(uid: string, payload: Record<string, unknown>) {
    if (!vapid) { stats.errors.push('VAPID keys missing'); return }
    const { data: subs } = await sb.from('push_subscriptions').select('*').eq('user_id', uid).is('deleted_at', null)
    for (const s of subs ?? []) {
      try {
        const status = await sendPush(s, payload, vapid)
        if (status === 404 || status === 410) { await sb.from('push_subscriptions').delete().eq('id', s.id); stats.removed++ }
        else if (status >= 200 && status < 300) stats.pushed++
        else stats.errors.push(`push ${status}`)
      } catch (e) { stats.errors.push(String(e)) }
    }
  }

  try {
    const [{ data: profiles }, { data: reminders }] = await Promise.all([
      sb.from('profiles').select('id, timezone').is('deleted_at', null),
      sb.from('reminders').select('*').eq('enabled', true).is('deleted_at', null),
    ])
    const tzOf = new Map((profiles ?? []).map((p: any) => [p.id, p.timezone || 'UTC']))

    // 1. Scheduled reminders
    for (const r of reminders ?? []) {
      const tz = tzOf.get(r.user_id); if (!tz) continue
      const [h, m] = String(r.time).split(':').map(Number)
      const late = localMinutes(now, tz) - (h * 60 + m)
      if (late < 0 || late > WINDOW_MIN) continue
      if (r.weekday !== null && r.weekday !== undefined && r.weekday !== weekdayIndex(now, tz)) continue
      const date = localDate(now, tz)
      const id = await stableId(`rev:${r.id}:${date}`)
      const { data: ev } = await sb.from('reminder_events').select('*').eq('id', id).maybeSingle()
      if (ev && (ev.pushed_at || ev.status !== 'sent')) continue // already delivered, snoozed, or the user already dealt with it
      if (r.kind === 'meal') { // no nagging if this meal is already logged or marked skipped
        const { data: done } = await sb.from('meals').select('id').eq('user_id', r.user_id).eq('local_date', date).eq('slot', r.slot).in('status', ['logged', 'skipped']).is('deleted_at', null).limit(1)
        if (done?.length) { await sb.from('reminder_events').upsert({ id, user_id: r.user_id, reminder_id: r.id, local_date: date, status: 'completed', pushed_at: now.toISOString() }); continue }
      }
      // Claim first so an overlapping run cannot double-send.
      const { error } = await sb.from('reminder_events').upsert({ id, user_id: r.user_id, reminder_id: r.id, local_date: date, status: 'sent', pushed_at: now.toISOString() })
      if (error) { stats.errors.push(error.message); continue }

      const copy = copyFor(r)
      let url = `/remind/${r.id}/${date}`
      if (r.kind === 'review') {
        try {
          await generateDaily(sb, r.user_id, date); stats.reports++
          if (localWeekday(now, tz) === 'Sun') { await generateWeekly(sb, r.user_id, weekStart(date)); stats.reports++ }
        } catch (e) { stats.errors.push(`report: ${e}`) }
        url = `/report/${date}`
      }
      await push(r.user_id, { title: copy.title, body: copy.body, url, tag: `r-${r.id}`,
        actions: r.kind === 'meal' ? [{ action: 'snooze10', title: 'Snooze 10 min' }, { action: 'snooze15', title: 'Snooze 15 min' }] : [] })
    }

    // 2. Snoozed reminders that are now due
    const { data: snoozed } = await sb.from('reminder_events').select('*, reminders(*)').eq('status', 'snoozed').lte('snoozed_until', now.toISOString()).is('deleted_at', null)
    for (const ev of snoozed ?? []) {
      const r = (ev as any).reminders; if (!r) continue
      await sb.from('reminder_events').update({ status: 'sent', snoozed_until: null, pushed_at: now.toISOString() }).eq('id', ev.id)
      const copy = copyFor(r)
      await push(ev.user_id, { title: copy.title, body: `Snoozed reminder. ${copy.body}`, url: `/remind/${r.id}/${ev.local_date}`, tag: `r-${r.id}`,
        actions: [{ action: 'snooze10', title: 'Snooze 10 min' }, { action: 'snooze15', title: 'Snooze 15 min' }] })
      stats.snoozed++
    }
  } catch (e) { stats.errors.push(String(e)) }
  return json(stats)
})
