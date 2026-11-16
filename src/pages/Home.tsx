import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addWater, guessSlot, markSkipped, setReminderStatus } from '../lib/actions'
import { alive, db, remove } from '../lib/db'
import { fmtDate, fmtHHMM, nowHHMM, today } from '../lib/dates'
import { mealSlots, slotStatus, useDay, useLoggingStreak, useNow, usePrefs, useProfile, useReminders, useSyncState, useTargets } from '../lib/hooks'
import { bigVolumeUnit, fmtBigVolume, unitsOf, volumeUnit, waterPresets } from '../lib/units'
import { Bar, Button, Card, Icon, NumInput, Ring, Sheet, Skeleton, SkeletonCard, cx, fmt } from '../components/ui'

export default function Home() {
  const nav = useNavigate()
  useNow()
  const date = today(), hhmm = nowHHMM()
  const profile = useProfile(), targets = useTargets(), prefs = usePrefs(), reminders = useReminders()
  const day = useDay(date), sync = useSyncState()
  const workouts = useLiveQuery(async () => alive(await db.workouts.where('local_date').equals(date).toArray()), [date]) ?? []
  const report = useLiveQuery(async () => alive(await db.daily_reports.where('local_date').equals(date).toArray())[0], [date])
  const streak = useLoggingStreak()
  const u = unitsOf(prefs)
  const presets = waterPresets(u)
  const [waterOpen, setWaterOpen] = useState(false), [custom, setCustom] = useState(300)
  if (!targets) return <HomeSkeleton />

  const t = day.totals, remaining = targets.kcal - t.kcal
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const slots = mealSlots(reminders)
  const done = slots.filter(r => slotStatus(day, r.slot!) === 'logged').length
  const enabled = reminders.filter(r => r.enabled)
  const next = enabled.find(r => r.time > hhmm)
  // A scheduled meal whose time has passed and that has no outcome yet.
  const due = slots.filter(r => r.time <= hhmm && slotStatus(day, r.slot!) === 'unlogged')
    .filter(r => { const ev = day.events.find(e => e.reminder_id === r.id); return !ev || ev.status === 'sent' || (ev.status === 'snoozed' && (ev.snoozed_until ?? '') < new Date().toISOString()) }).pop()
  const reviewTime = reminders.find(r => r.kind === 'review')?.time ?? '21:30'
  const workoutDone = workouts.length > 0

  const macros = [
    { label: 'Protein', v: t.protein_g, max: targets.protein_g, color: 'bg-leaf-500' },
    { label: 'Carbs', v: t.carbs_g, max: targets.carbs_g, color: 'bg-sky-400' },
    { label: 'Fat', v: t.fat_g, max: targets.fat_g, color: 'bg-amber-400' },
  ]
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-32" style={{ paddingTop: 'calc(var(--safe-t) + 14px)' }}>
      <header className="mb-4 flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">{fmtDate(date)}</div>
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">{greeting}{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}</h1>
        </div>
        {(!sync.online || sync.pending > 0) && (
          <span className="mt-1 flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-ink-500 shadow-card"><Icon name="cloud" size={14} />{sync.online ? 'Syncing' : 'Offline'}</span>
        )}
      </header>

      <Card className="flex flex-col items-center pb-5 pt-6">
        <Ring value={t.kcal} max={targets.kcal} size={208} stroke={16}>
          <div className="text-[13px] font-medium text-ink-500">{remaining >= 0 ? 'Remaining' : 'Over target'}</div>
          <div className="num text-[46px] font-bold leading-[50px]">{fmt(Math.abs(remaining))}</div>
          <div className="text-[13px] font-medium text-ink-500">kcal</div>
        </Ring>
        <div className="mt-4 flex w-full justify-around text-center">
          <div><div className="num text-xl font-bold">{fmt(t.kcal)}</div><div className="text-xs text-ink-500">Eaten</div></div>
          <div className="w-px bg-ink-100" />
          <div><div className="num text-xl font-bold">{fmt(targets.kcal)}</div><div className="text-xs text-ink-500">Target</div></div>
          <div className="w-px bg-ink-100" />
          <div><div className="num text-xl font-bold">{done}/{slots.length}</div><div className="text-xs text-ink-500">Meals</div></div>
        </div>
      </Card>

      <Card className="mt-3 space-y-3.5">
        {macros.map(m => (
          <div key={m.label}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[15px] font-semibold">{m.label}</span>
              <span className="num text-[15px]"><b>{fmt(m.v)}</b><span className="text-ink-500"> / {fmt(m.max)} g</span></span>
            </div>
            <Bar value={m.v} max={m.max} color={m.color} />
          </div>
        ))}
        <div className="text-[11px] text-ink-400">All food values are estimates from your confirmed entries.</div>
      </Card>

      {streak.week.length > 0 && (
        <Card className="mt-3 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-800"><Icon name="flame" size={22} /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{streak.current === 0 ? 'Start a logging streak' : `${streak.current} day${streak.current === 1 ? '' : 's'} in a row`}</div>
            <div className="text-[13px] text-ink-500">{streak.current === 0 ? 'Log one meal today to begin.' : streak.best > streak.current ? `Your best is ${streak.best} days.` : 'This is your best run so far.'}</div>
          </div>
          <div className="flex shrink-0 gap-1">
            {streak.week.map(d => <div key={d.date} className={cx('h-5 w-2 rounded-full', d.logged ? 'bg-leaf-500' : 'bg-ink-200')} title={d.date} />)}
          </div>
        </Card>
      )}

      {due && (
        <Card className="mt-3 border border-leaf-200 bg-leaf-50">
          <div className="flex items-center gap-2 text-leaf-900"><Icon name="bell" size={20} /><b>{due.label}</b><span className="text-sm text-leaf-800">was due at {fmtHHMM(due.time)}</span></div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => nav(`/meal/new?slot=${due.slot}`)}><Icon name="camera" size={16} />Log now</Button>
            <Button size="sm" variant="outline" onClick={() => setReminderStatus(due.id, date, 'snoozed', 15)}>Snooze 15</Button>
            <Button size="sm" variant="outline" onClick={() => markSkipped(due.slot!, date)}>Skipped</Button>
          </div>
        </Card>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card onClick={() => setWaterOpen(true)}>
          <div className="flex items-center gap-1.5 text-sky-600"><Icon name="drop" size={18} /><span className="text-[13px] font-semibold">Water</span></div>
          <div className="num mt-2 text-2xl font-bold">{fmtBigVolume(day.water, u).replace(/ .*/, '')}<span className="text-base font-semibold text-ink-500"> / {fmtBigVolume(targets.water_ml, u, 1)}</span></div>
          <div className="mt-2"><Bar value={day.water} max={targets.water_ml} color="bg-sky-400" /></div>
          <div className="mt-3 flex gap-2">
            {presets.map(w => <Button key={w.label} size="sm" variant="soft" className="flex-1 !bg-sky-50 !text-sky-700" onClick={e => { e.stopPropagation(); void addWater(w.ml) }}>{w.label}</Button>)}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-leaf-700"><Icon name="clock" size={18} /><span className="text-[13px] font-semibold">Next reminder</span></div>
          {next ? <>
            <div className="num mt-2 text-2xl font-bold">{fmtHHMM(next.time)}</div>
            <div className="text-[15px] text-ink-700">{next.label}</div>
          </> : <div className="mt-2 text-[15px] text-ink-700">All done for today. Reminders resume tomorrow.</div>}
          <Link to="/profile#reminders" className="mt-3 inline-block text-sm font-semibold text-leaf-700">Edit schedule</Link>
        </Card>
      </div>

      <Button block size="lg" className="mt-3" onClick={() => nav(`/meal/new?slot=${guessSlot(reminders, hhmm)}`)}><Icon name="camera" size={20} />Add meal</Button>

      <Card className="mt-3" onClick={() => nav(`/report/${date}`)}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-leaf-50 text-leaf-700"><Icon name="sparkle" size={22} /></div>
          <div className="flex-1"><div className="font-semibold">Daily report</div><div className="text-sm text-ink-500">{report ? 'Ready. Tap to read it.' : `Generated at ${fmtHHMM(reviewTime)}, or open it any time.`}</div></div>
          <Icon name="right" size={18} className="text-ink-300" />
        </div>
      </Card>

      {prefs?.workouts_enabled !== false && (
        <Card className="mt-3" onClick={() => nav('/workouts')}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-100 text-ink-700"><Icon name="dumbbell" size={22} /></div>
            <div className="flex-1">
              <div className="font-semibold">Home workout <span className="text-xs font-medium text-ink-400">optional</span></div>
              <div className="text-sm text-ink-500">{workoutDone ? `Done today · ${fmt(workouts.reduce((n, w) => n + w.duration_min, 0))} min · ~${fmt(workouts.reduce((n, w) => n + w.est_kcal, 0))} kcal est., not added to your food budget` : 'Not done today. Only if you feel like it.'}</div>
            </div>
            {workoutDone ? <Icon name="check" size={20} className="text-leaf-600" /> : <Icon name="right" size={18} className="text-ink-300" />}
          </div>
        </Card>
      )}

      <Sheet open={waterOpen} onClose={() => setWaterOpen(false)} title="Water">
        <div className="grid grid-cols-2 gap-3">
          {presets.map(w => <Button key={w.label} variant="outline" size="lg" onClick={() => addWater(w.ml)}>{w.label.replace('+', '+ ')}{u === 'metric' ? ' ml' : ''}</Button>)}
        </div>
        <div className="mt-3 flex gap-3"><NumInput value={custom} onChange={setCustom} aria-label={`Custom amount in ${volumeUnit(u)}`} /><Button size="lg" className="shrink-0" onClick={() => { void addWater(u === 'imperial' ? Math.round(custom * 29.5735) : custom); setWaterOpen(false) }}>Add {volumeUnit(u)}</Button></div>
        <WaterList date={date} />
      </Sheet>
      <div className="mt-6 text-center text-[11px] text-ink-400">NutriTrack gives estimates and general guidance, not medical advice.</div>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-32" style={{ paddingTop: 'calc(var(--safe-t) + 14px)' }}>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-8 w-56" />
      <Card className="mt-4 flex flex-col items-center py-8"><Skeleton className="h-52 w-52 !rounded-full" /><Skeleton className="mt-5 h-5 w-64" /></Card>
      <SkeletonCard className="mt-3" lines={3} />
      <div className="mt-3 grid grid-cols-2 gap-3"><SkeletonCard lines={2} /><SkeletonCard lines={2} /></div>
    </div>
  )
}

function WaterList({ date }: { date: string }) {
  const logs = useLiveQuery(async () => alive(await db.water_logs.where('local_date').equals(date).toArray()).sort((a, b) => b.logged_at.localeCompare(a.logged_at)), [date]) ?? []
  if (!logs.length) return null
  return (
    <div className="mt-4 divide-y divide-ink-100 rounded-2xl bg-surface">
      {logs.map(l => (
        <div key={l.id} className="flex items-center justify-between px-4 py-2.5">
          <span className="num font-semibold">{l.amount_ml} ml</span>
          <span className="text-sm text-ink-500">{new Date(l.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <button aria-label="Remove" className="text-ink-400" onClick={() => remove('water_logs', l.id)}><Icon name="trash" size={18} /></button>
        </div>
      ))}
    </div>
  )
}
