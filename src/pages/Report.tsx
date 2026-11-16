import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts'
import { MealThumb } from '../components/MealBits'
import { SLOT_LABEL } from '../lib/actions'
import { api } from '../lib/api'
import { alive, db, sync } from '../lib/db'
import { fmtDate, fmtHHMM, fmtTime, nowHHMM, today } from '../lib/dates'
import { mealSlots, slotStatus, useDay, useReminders, useTargets } from '../lib/hooks'
import { pct } from '../lib/nutrition'
import { Bar, Button, Card, Icon, Note, Page, SectionTitle, Spinner, fmt } from '../components/ui'

const QUESTIONS: [key: keyof import('../lib/types').DailyAi, q: string][] = [
  ['calorie_target', 'Did I stay within my calorie target?'], ['protein', 'Did I get enough protein?'], ['carb_fat_balance', 'Were carbs and fats balanced?'],
  ['strongest_meal', 'Which meal was my strongest?'], ['meal_to_improve', 'Which meal could be improved?'], ['schedule', 'Did I follow my meal schedule?'],
  ['missed_meals', 'Did I miss any meals?'], ['oil_and_extras', 'Too much oil or unnecessary calories?'], ['adjustments', 'What got in the way?'], ['improve_tomorrow', 'What should I improve tomorrow?'],
]

export default function Report() {
  const { date = today() } = useParams()
  const nav = useNavigate()
  const day = useDay(date), targets = useTargets(), reminders = useReminders()
  const row = useLiveQuery(async () => alive(await db.daily_reports.where('local_date').equals(date).toArray())[0] ?? null, [date])
  const workouts = useLiveQuery(async () => alive(await db.workouts.where('local_date').equals(date).toArray()), [date]) ?? []
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const tried = useRef(false)

  async function generate() {
    setBusy(true); setErr('')
    try { await sync(); await api('daily_report', { date }); await sync() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  // Opening today's report after the review time (or any past day) generates it once if it does not exist yet.
  const reviewTime = reminders.find(r => r.kind === 'review')?.time ?? '21:30'
  useEffect(() => {
    if (tried.current || row === undefined || row !== null || !day.loaded || !navigator.onLine) return
    if (date < today() || (date === today() && nowHHMM() >= reviewTime)) { tried.current = true; void generate() }
  }, [row, day.loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!targets) return null
  const t = day.totals
  const slots = mealSlots(reminders)
  const statuses = slots.map(r => ({ r, s: slotStatus(day, r.slot!) }))
  const completed = statuses.filter(x => x.s === 'logged').length, skipped = statuses.filter(x => x.s === 'skipped').length
  const unlogged = statuses.filter(x => x.s === 'unlogged' || x.s === 'draft').length
  const macros = [
    { name: 'Calories', v: t.kcal, max: targets.kcal, unit: 'kcal', fill: '#34A56B', bar: 'bg-leaf-500' },
    { name: 'Protein', v: t.protein_g, max: targets.protein_g, unit: 'g', fill: '#268556', bar: 'bg-leaf-600' },
    { name: 'Carbs', v: t.carbs_g, max: targets.carbs_g, unit: 'g', fill: '#38BDF8', bar: 'bg-sky-400' },
    { name: 'Fat', v: t.fat_g, max: targets.fat_g, unit: 'g', fill: '#FBBF24', bar: 'bg-amber-400' },
    { name: 'Fibre', v: t.fibre_g, max: targets.fibre_g, unit: 'g', fill: '#A78BFA', bar: 'bg-violet-400' },
    { name: 'Water', v: day.water / 1000, max: targets.water_ml / 1000, unit: 'L', fill: '#7DD3FC', bar: 'bg-sky-300' },
  ]
  const radial = macros.slice(0, 4).map(m => ({ name: m.name, value: Math.min(pct(m.v, m.max), 100), fill: m.fill })).reverse()
  const r = row?.report
  const stale = row && day.meals.some(m => m.updated_at > row.updated_at)
  const logged = day.meals.filter(m => m.status === 'logged')

  return (
    <Page title="Daily report" back subtitle={fmtDate(date)}>
      <Card>
        <div className="flex items-center gap-2">
          <div className="h-[150px] w-[150px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart data={radial} innerRadius="38%" outerRadius="100%" startAngle={90} endAngle={-270} barSize={9}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={6} background={{ fill: '#EEF1EE' }} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5">
            {macros.slice(0, 4).map(m => (
              <div key={m.name} className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ background: m.fill }} /><span className="flex-1 text-ink-700">{m.name}</span><b className="num">{pct(m.v, m.max)}%</b></div>
            ))}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{completed}</div><div className="text-xs text-ink-500">Meals logged</div></div>
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{skipped}</div><div className="text-xs text-ink-500">Skipped</div></div>
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{unlogged}</div><div className="text-xs text-ink-500">Unlogged</div></div>
        </div>
      </Card>

      <SectionTitle>Actual vs target</SectionTitle>
      <Card className="space-y-3">
        {macros.map(m => (
          <div key={m.name}>
            <div className="mb-1 flex items-baseline justify-between text-[15px]"><span className="font-semibold">{m.name}</span><span className="num"><b>{fmt(m.v, m.unit === 'L' ? 2 : 0)}</b><span className="text-ink-500"> / {fmt(m.max, m.unit === 'L' ? 1 : 0)} {m.unit}</span></span></div>
            <Bar value={m.v} max={m.max} color={m.bar} />
          </div>
        ))}
        {workouts.length > 0 && <div className="border-t border-ink-100 pt-3 text-sm text-ink-700"><b>Optional workout:</b> {fmt(workouts.reduce((n, w) => n + w.duration_min, 0))} min, about {fmt(workouts.reduce((n, w) => n + w.est_kcal, 0))} kcal (estimate). Shown separately and not subtracted from food.</div>}
      </Card>

      <SectionTitle>AI assessment</SectionTitle>
      {busy && <Card className="flex items-center gap-3"><Spinner /><span className="text-ink-700">Writing your report…</span></Card>}
      {err && <Note tone="danger">{err}</Note>}
      {r?.headline && !busy && (
        <>
          <Card><p className="text-[19px] font-semibold leading-7">{r.headline}</p></Card>
          <Card className="mt-3 bg-leaf-600 text-white">
            <div className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-white/80">Tomorrow's action plan</div>
            <ol className="space-y-2.5">{r.action_plan?.map((a, i) => <li key={i} className="flex gap-3"><span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold">{i + 1}</span><span className="text-[16px] leading-6">{a}</span></li>)}</ol>
          </Card>
          <div className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-3xl bg-white shadow-card">
            {QUESTIONS.map(([k, q]) => r[k] ? <div key={k} className="px-4 py-3"><div className="text-[13px] font-semibold text-leaf-700">{q}</div><div className="mt-0.5 leading-6 text-ink-700">{String(r[k])}</div></div> : null)}
          </div>
        </>
      )}
      {!r?.headline && !busy && <Card><p className="text-ink-500">{date === today() ? `Your report is written automatically at ${fmtHHMM(reviewTime)}. You can also generate it now from what is logged so far.` : 'No report was generated for this day yet.'}</p></Card>}
      {stale && !busy && <div className="mt-3"><Note>Meals changed after this report was written. Regenerate to include the latest entries.</Note></div>}
      <Button variant="soft" block className="mt-3" disabled={busy} onClick={generate}><Icon name="sparkle" size={18} />{r?.headline ? 'Regenerate report' : 'Generate report now'}</Button>

      <SectionTitle>Meal by meal</SectionTitle>
      <div className="space-y-3">
        {logged.map(m => (
          <Card key={m.id} onClick={() => nav(`/meal/${m.id}`)} className="flex items-center gap-3">
            <MealThumb mealId={m.id} hasPhoto={m.hasPhoto} className="h-20 w-20 rounded-2xl" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-leaf-700">{SLOT_LABEL[m.slot]} · {fmtTime(m.eaten_at)}</div>
              <div className="truncate font-semibold">{m.name}</div>
              <div className="num text-sm text-ink-500">{fmt(m.totals.kcal)} kcal · P {fmt(m.totals.protein_g)} · C {fmt(m.totals.carbs_g)} · F {fmt(m.totals.fat_g)} g</div>
            </div>
            <Icon name="right" size={18} className="text-ink-300" />
          </Card>
        ))}
        {statuses.filter(x => x.s !== 'logged').map(({ r: rem, s }) => (
          <div key={rem.id} className="flex items-center justify-between rounded-2xl border border-dashed border-ink-200 px-4 py-3 text-sm"><span className="font-medium text-ink-700">{rem.label}</span><span className="text-ink-400">{s === 'skipped' ? 'Marked skipped' : s === 'draft' ? 'Started, not confirmed' : 'Unlogged'}</span></div>
        ))}
      </div>
      <p className="mt-5 text-center text-[11px] text-ink-400">Food values are estimates from your confirmed entries. General guidance only, not medical advice.</p>
    </Page>
  )
}
