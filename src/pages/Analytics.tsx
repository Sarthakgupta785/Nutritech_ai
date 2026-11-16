import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { setWeight } from '../lib/actions'
import { weekStats, weightStats } from '../lib/analytics'
import { api } from '../lib/api'
import { alive, db, sync } from '../lib/db'
import { addDays, fmtDate, fmtShort, lastNDays, nowHHMM, today, weekStart } from '../lib/dates'
import { useDays, usePrefs, useReminders, useTargets } from '../lib/hooks'
import { Button, Card, Icon, Note, NumInput, Page, SectionTitle, Spinner, fmt } from '../components/ui'

const tip = { contentStyle: { borderRadius: 14, border: 'none', boxShadow: '0 8px 24px rgba(17,22,19,.12)', fontSize: 13 }, cursor: { fill: 'rgba(52,165,107,.08)' } }
const axis = { tick: { fontSize: 11, fill: '#8C958F' }, axisLine: false, tickLine: false } as const

export default function Analytics() {
  const [offset, setOffset] = useState(0) // weeks back
  const end = addDays(today(), -7 * offset)
  const dates = useMemo(() => lastNDays(end, 7), [end])
  const data = useDays(dates), targets = useTargets(), reminders = useReminders(), prefs = usePrefs()
  const stats = useMemo(() => weekStats(dates, data, targets, reminders, today(), nowHHMM()), [dates, data, targets, reminders])
  const weights = useLiveQuery(async () => alive(await db.weight_logs.toArray()), []) ?? []
  const ws = useMemo(() => weightStats(weights, today(), 30), [weights])
  const todayW = weights.find(w => w.local_date === today())
  const [kg, setKg] = useState(0)
  const workouts = useLiveQuery(async () => alive(await db.workouts.where('local_date').between(addDays(end, -13), end, true, true).toArray()), [end]) ?? []
  const chart = stats.days.map(d => ({ ...d, day: fmtShort(d.date), water_l: d.water_ml / 1000, kcalShown: d.hasData ? d.kcal : null, proteinShown: d.hasData ? d.protein_g : null }))
  const wkStart = weekStart(end)

  return (
    <Page title="Analytics">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-white p-1.5 shadow-card">
        <button aria-label="Earlier" className="flex h-10 w-10 items-center justify-center rounded-xl active:bg-ink-100" onClick={() => setOffset(offset + 1)}><Icon name="left" size={20} /></button>
        <div className="text-center font-semibold">{offset === 0 ? 'Last 7 days' : `${fmtDate(dates[0], { day: 'numeric', month: 'short' })} – ${fmtDate(end, { day: 'numeric', month: 'short' })}`}</div>
        <button aria-label="Later" disabled={offset === 0} className="flex h-10 w-10 items-center justify-center rounded-xl active:bg-ink-100 disabled:text-ink-200" onClick={() => setOffset(offset - 1)}><Icon name="right" size={20} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {([['Avg calories', stats.avg.kcal, targets?.kcal, 'kcal'], ['Avg protein', stats.avg.protein_g, targets?.protein_g, 'g'], ['Avg carbs', stats.avg.carbs_g, targets?.carbs_g, 'g'], ['Avg fat', stats.avg.fat_g, targets?.fat_g, 'g']] as const).map(([l, v, t, u]) => (
          <Card key={l}><div className="text-[13px] font-medium text-ink-500">{l}</div><div className="num mt-1 text-[26px] font-bold leading-8">{stats.daysWithData ? fmt(v) : '–'}<span className="text-sm font-semibold text-ink-500"> {u}</span></div><div className="text-xs text-ink-400">target {fmt(t ?? 0)} {u}</div></Card>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-ink-400">Averages cover the {stats.daysWithData} day{stats.daysWithData === 1 ? '' : 's'} with confirmed meals. Unlogged days are left out rather than counted as zero.</p>

      <SectionTitle>Calories</SectionTitle>
      <Card className="pl-1 pr-3">
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={chart} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEF1EE" />
            <XAxis dataKey="day" {...axis} /><YAxis {...axis} width={44} />
            <Tooltip {...tip} formatter={(v) => [`${fmt(Number(v))} kcal`, 'Calories']} />
            {targets && <ReferenceLine y={targets.kcal} stroke="#268556" strokeDasharray="5 4" label={{ value: 'Target', position: 'insideTopRight', fontSize: 11, fill: '#268556' }} />}
            <Bar dataKey="kcalShown" fill="#57BD85" radius={[8, 8, 3, 3]} maxBarSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <SectionTitle>Protein</SectionTitle>
      <Card className="pl-1 pr-3">
        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={chart} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEF1EE" />
            <XAxis dataKey="day" {...axis} /><YAxis {...axis} width={44} />
            <Tooltip {...tip} formatter={(v) => [`${fmt(Number(v))} g`, 'Protein']} />
            {targets && <ReferenceLine y={targets.protein_g} stroke="#268556" strokeDasharray="5 4" />}
            <Line dataKey="proteinShown" stroke="#268556" strokeWidth={3} dot={{ r: 4, fill: '#268556' }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <SectionTitle>Water</SectionTitle>
      <Card className="pl-1 pr-3">
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={chart} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#EEF1EE" />
            <XAxis dataKey="day" {...axis} /><YAxis {...axis} width={44} />
            <Tooltip {...tip} formatter={(v) => [`${fmt(Number(v), 2)} L`, 'Water']} />
            {targets && <ReferenceLine y={targets.water_ml / 1000} stroke="#0EA5E9" strokeDasharray="5 4" />}
            <Bar dataKey="water_l" fill="#7DD3FC" radius={[8, 8, 3, 3]} maxBarSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <SectionTitle>Consistency</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Card><div className="text-[13px] font-medium text-ink-500">Meal consistency</div><div className="num mt-1 text-[26px] font-bold">{stats.mealConsistency == null ? '–' : `${Math.round(stats.mealConsistency * 100)}%`}</div><div className="text-xs text-ink-400">scheduled meals logged</div></Card>
        <Card><div className="text-[13px] font-medium text-ink-500">Reminder completion</div><div className="num mt-1 text-[26px] font-bold">{stats.reminderCompletion == null ? '–' : `${Math.round(stats.reminderCompletion * 100)}%`}</div><div className="text-xs text-ink-400">reminders acted on</div></Card>
        <Card><div className="text-[13px] font-medium text-ink-500">Best-performing day</div><div className="mt-1 text-lg font-bold">{stats.best ? fmtDate(stats.best.date, { weekday: 'long' }) : '–'}</div>{stats.best && <Link className="text-xs font-semibold text-leaf-700" to={`/report/${stats.best.date}`}>{fmt(stats.best.kcal)} kcal · view report</Link>}</Card>
        <Card><div className="text-[13px] font-medium text-ink-500">Least consistent day</div><div className="mt-1 text-lg font-bold">{stats.leastConsistent ? fmtDate(stats.leastConsistent.date, { weekday: 'long' }) : '–'}</div>{stats.leastConsistent && <div className="text-xs text-ink-400">{stats.leastConsistent.logged} of {stats.leastConsistent.expected} meals logged</div>}</Card>
      </div>

      <SectionTitle>Weight</SectionTitle>
      <Card>
        <div className="flex items-end gap-3">
          <div className="flex-1"><div className="mb-1 text-[13px] font-medium text-ink-500">{todayW ? `Today: ${fmt(todayW.weight_kg, 1)} kg. Update:` : "Today's weight (kg)"}</div><NumInput value={kg || NaN} onChange={setKg} step={0.1} placeholder="e.g. 92.4" /></div>
          <Button size="lg" disabled={!(kg >= 20 && kg <= 400)} onClick={async () => { await setWeight(kg); setKg(0) }}>Save</Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{ws.latest != null ? fmt(ws.latest, 1) : '–'}</div><div className="text-xs text-ink-500">Latest kg</div></div>
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{ws.weeklyChange != null ? `${ws.weeklyChange > 0 ? '+' : ''}${fmt(ws.weeklyChange, 1)}` : '–'}</div><div className="text-xs text-ink-500">Weekly change</div></div>
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{ws.overall != null ? `${ws.overall > 0 ? '+' : ''}${fmt(ws.overall, 1)}` : '–'}</div><div className="text-xs text-ink-500">Overall</div></div>
        </div>
        {ws.entries > 1 && (
          <div className="-ml-3 mt-3">
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart data={ws.series.map(p => ({ ...p, label: fmtDate(p.date, { day: 'numeric', month: 'short' }) }))} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#EEF1EE" />
                <XAxis dataKey="label" {...axis} interval={6} /><YAxis {...axis} width={44} domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={v => fmt(Number(v), 0)} />
                <Tooltip {...tip} formatter={(v, n) => [`${fmt(Number(v), 1)} kg`, n === 'avg7' ? '7-day average' : 'Daily']} />
                <Scatter dataKey="kg" fill="#B7BEB9" />
                <Line dataKey="avg7" stroke="#268556" strokeWidth={3} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-xs leading-4 text-ink-400">Grey dots are daily weigh-ins; the green line is the 7-day average. Daily readings move with water, salt and meal timing, so only the average line says anything about fat loss. Weekly change compares this week's average with last week's and needs at least three weigh-ins in each.</p>
      </Card>

      <WeeklyReport weekStart={wkStart} />

      {prefs?.workouts_enabled !== false && <>
        <SectionTitle right={<Link to="/workouts" className="text-sm font-semibold text-leaf-700">Open</Link>}>Home workouts (optional)</SectionTitle>
        <WorkoutWeek workouts={workouts} end={end} />
      </>}

      <SectionTitle>Daily reports</SectionTitle>
      <div className="divide-y divide-ink-100 overflow-hidden rounded-3xl bg-white shadow-card">
        {[...stats.days].reverse().filter(d => d.date <= today()).map(d => (
          <Link key={d.date} to={`/report/${d.date}`} className="flex items-center justify-between px-4 py-3 active:bg-ink-50">
            <span className="font-medium">{fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            <span className="num flex items-center gap-2 text-sm text-ink-500">{d.hasData ? `${fmt(d.kcal)} kcal` : 'Unlogged'}<Icon name="right" size={16} className="text-ink-300" /></span>
          </Link>
        ))}
      </div>
    </Page>
  )
}

function WeeklyReport({ weekStart: start }: { weekStart: string }) {
  const row = useLiveQuery(async () => alive(await db.weekly_reports.where('week_start').equals(start).toArray())[0] ?? null, [start])
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  async function generate() {
    setBusy(true); setErr('')
    try { await sync(); await api('weekly_report', { week_start: start }); await sync() } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  const r = row?.report
  return (
    <>
      <SectionTitle>Weekly AI report · week of {fmtDate(start, { day: 'numeric', month: 'short' })}</SectionTitle>
      <Card>
        {r?.headline ? (
          <div className="space-y-3 text-[15px] leading-6 text-ink-700">
            <p className="text-[17px] font-semibold text-ink-900">{r.headline}</p>
            <p>{r.progress}</p><p>{r.nutrition}</p><p>{r.consistency}</p><p>{r.weight_trend}</p>
            <ul className="space-y-2">{r.improvements?.map((x, i) => <li key={i} className="flex gap-2"><Icon name="check" size={18} className="mt-1 shrink-0 text-leaf-600" />{x}</li>)}</ul>
          </div>
        ) : <p className="text-ink-500">An AI summary of this week's progress with a few improvements to try. It is also generated automatically on Sunday evening.</p>}
        {err && <div className="mt-3"><Note tone="danger">{err}</Note></div>}
        <Button variant="soft" block className="mt-3" disabled={busy} onClick={generate}>{busy ? <Spinner /> : <Icon name="sparkle" size={18} />}{r?.headline ? 'Regenerate' : 'Generate weekly report'}</Button>
      </Card>
    </>
  )
}

function WorkoutWeek({ workouts, end }: { workouts: import('../lib/types').Workout[]; end: string }) {
  const from = addDays(end, -6), prevFrom = addDays(end, -13)
  const cur = workouts.filter(w => w.local_date >= from), prev = workouts.filter(w => w.local_date >= prevFrom && w.local_date < from)
  const mins = (ws: typeof workouts) => ws.reduce((n, w) => n + w.duration_min, 0)
  const reps = (ws: typeof workouts) => ws.reduce((n, w) => n + w.exercises.filter(e => e.unit === 'reps').reduce((m, e) => m + e.sets.reduce((a, b) => a + b, 0), 0), 0)
  const sets = (ws: typeof workouts) => ws.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0)
  const names = [...new Set(cur.flatMap(w => w.exercises.map(e => e.name)))]
  const delta = (a: number, b: number) => (b === 0 && a === 0 ? '' : `${a - b >= 0 ? '+' : ''}${fmt(a - b)} vs previous week`)
  if (!cur.length && !prev.length) return <Card className="text-ink-500">No workouts logged in this period. That is completely fine; this section is optional.</Card>
  return (
    <Card>
      <div className="grid grid-cols-2 gap-3 text-center">
        {([['Workouts', cur.length, prev.length], ['Minutes', mins(cur), mins(prev)], ['Sets', sets(cur), sets(prev)], ['Total reps', reps(cur), reps(prev)]] as const).map(([l, a, b]) => (
          <div key={l} className="rounded-2xl bg-ink-50 py-2"><div className="num text-xl font-bold">{fmt(a)}</div><div className="text-xs text-ink-500">{l}</div><div className="text-[11px] text-ink-400">{delta(a, b)}</div></div>
        ))}
      </div>
      <div className="mt-3 text-sm text-ink-700"><b>Active days:</b> {new Set(cur.map(w => w.local_date)).size} of 7</div>
      {names.length > 0 && <div className="mt-1 text-sm text-ink-700"><b>Exercises:</b> {names.join(', ')}</div>}
    </Card>
  )
}
