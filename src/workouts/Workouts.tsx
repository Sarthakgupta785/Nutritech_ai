import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { alive, db, patch, remove } from '../lib/db'
import { addDays, fmtDate, fmtShort, lastNDays, today } from '../lib/dates'
import { usePrefs, useProfile } from '../lib/hooks'
import { workoutKcal } from '../lib/nutrition'
import type { Workout } from '../lib/types'
import { Button, Card, Icon, Note, Page, SectionTitle, Segmented, Sheet, cx, fmt } from '../components/ui'
import { SAFETY_NOTE } from './exercises'
import { Still } from './Figure'
import { CATEGORY_LABEL, generateWorkout, suggestForToday, type Category, type Focus, type GeneratedWorkout, type GenOptions } from './generator'
import { stashWorkout } from './shared'

export default function Workouts() {
  const nav = useNavigate()
  const profile = useProfile(), prefs = usePrefs()
  const all = useLiveQuery(async () => alive(await db.workouts.toArray()).sort((a, b) => b.started_at.localeCompare(a.started_at)), []) ?? []
  const date = today()
  const days = new Set(all.map(w => w.local_date))
  const level = prefs?.fitness_level ?? 'beginner'
  const suggestion = useMemo(() => suggestForToday(date, level, all.length, days.has(addDays(date, -1)), days.has(addDays(date, -2))), [date, level, all.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const [opts, setOpts] = useState<Omit<GenOptions, 'completed' | 'level'>>({ minutes: 10, focus: 'full', impact: 'low', category: 'beginner' })
  const [preview, setPreview] = useState<GeneratedWorkout | null>(null)
  const [detail, setDetail] = useState<Workout | null>(null)
  const kg = profile?.weight_kg ?? 80

  let streak = 0
  for (let d = days.has(date) ? date : addDays(date, -1); days.has(d); d = addDays(d, -1)) streak++
  const week = lastNDays(date, 7)
  const start = (w: GeneratedWorkout) => { stashWorkout(w); nav('/workouts/session') }
  const gen = () => setPreview(generateWorkout({ ...opts, level, completed: all.length, seed: `${Date.now()}` }))
  const Chips = <T extends string | number>({ value, set, options }: { value: T; set: (v: T) => void; options: [T, string][] }) => (
    <div className="flex flex-wrap gap-2">{options.map(([v, l]) => <button key={String(v)} onClick={() => set(v)} className={cx('h-10 rounded-xl px-3.5 text-sm font-semibold', v === value ? 'bg-leaf-600 text-white' : 'bg-ink-100 text-ink-700')}>{l}</button>)}</div>
  )

  return (
    <Page title="Home Workouts" back="/" subtitle="Optional · no equipment needed">
      <WorkoutCard w={suggestion.workout} kg={kg} label="Today's suggested workout" onStart={() => start(suggestion.workout)} />
      {suggestion.note && <div className="mt-3"><Note>{suggestion.note}</Note></div>}
      {days.has(date) && <div className="mt-3"><Note>You already logged a workout today. Nothing more is needed.</Note></div>}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card><div className="text-[13px] font-medium text-ink-500">Streak</div><div className="num mt-1 text-[26px] font-bold">{streak}<span className="text-sm font-semibold text-ink-500"> day{streak === 1 ? '' : 's'}</span></div><div className="text-xs text-ink-400">Rest days are part of training</div></Card>
        <Card>
          <div className="text-[13px] font-medium text-ink-500">This week</div>
          <div className="mt-2 grid grid-cols-7 gap-1">{week.map(d => <div key={d} className="flex flex-col items-center gap-1"><div className={cx('h-4 w-4 rounded-full', days.has(d) ? 'bg-leaf-500' : 'bg-ink-100')} /><span className="text-[10px] text-ink-400">{fmtShort(d).slice(0, 1)}</span></div>)}</div>
        </Card>
      </div>

      <SectionTitle>Build a workout</SectionTitle>
      <Card className="space-y-4">
        <div className="space-y-2">
          {(Object.keys(CATEGORY_LABEL) as Category[]).map(c => (
            <button key={c} onClick={() => setOpts({ ...opts, category: c })} className={cx('flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left', opts.category === c ? 'border-leaf-500 bg-leaf-50' : 'border-ink-200')}>
              <div><div className="font-semibold">{CATEGORY_LABEL[c].title}</div><div className="text-sm text-ink-500">{CATEGORY_LABEL[c].blurb}</div></div>
              {opts.category === c && <Icon name="check" size={20} className="text-leaf-600" />}
            </button>
          ))}
        </div>
        <div><div className="mb-1.5 text-[13px] font-medium text-ink-500">My current fitness level</div><Segmented value={level} onChange={v => prefs && patch('user_preferences', prefs.id, { fitness_level: v })} options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Some experience' }]} /></div>
        <div><div className="mb-1.5 text-[13px] font-medium text-ink-500">Time available</div><Chips value={opts.minutes} set={minutes => setOpts({ ...opts, minutes })} options={[[5, '5 min'], [10, '10 min'], [15, '15 min'], [20, '20 min'], [30, '30 min']]} /></div>
        <div><div className="mb-1.5 text-[13px] font-medium text-ink-500">Target</div><Chips<Focus> value={opts.focus} set={focus => setOpts({ ...opts, focus })} options={[['full', 'Full body'], ['upper', 'Upper'], ['lower', 'Lower'], ['core', 'Core'], ['cardio', 'Cardio']]} /></div>
        <div><div className="mb-1.5 text-[13px] font-medium text-ink-500">Impact</div><Segmented value={opts.impact} onChange={impact => setOpts({ ...opts, impact })} options={[{ value: 'low', label: 'Low-impact' }, { value: 'regular', label: 'Regular' }]} /></div>
        <Button block size="lg" onClick={gen}><Icon name="sparkle" size={20} />Generate workout</Button>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link to="/workouts/library"><Card className="h-full"><Icon name="search" size={22} className="text-leaf-700" /><div className="mt-2 font-semibold">Exercise library</div><div className="text-sm text-ink-500">22 illustrated moves</div></Card></Link>
        <Link to="/workouts/log"><Card className="h-full"><Icon name="edit" size={22} className="text-leaf-700" /><div className="mt-2 font-semibold">Log manually</div><div className="text-sm text-ink-500">A walk, yoga, anything</div></Card></Link>
      </div>

      <SectionTitle>History</SectionTitle>
      {all.length ? (
        <div className="divide-y divide-ink-100 overflow-hidden rounded-3xl bg-surface shadow-card">
          {all.slice(0, 20).map(w => (
            <button key={w.id} onClick={() => setDetail(w)} className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-ink-50">
              <div><div className="font-medium">{w.category || 'Workout'}</div><div className="text-sm text-ink-500">{fmtDate(w.local_date, { weekday: 'short', day: 'numeric', month: 'short' })} · {fmt(w.duration_min)} min · ~{fmt(w.est_kcal)} kcal est.</div></div>
              <Icon name="right" size={16} className="text-ink-300" />
            </button>
          ))}
        </div>
      ) : <Card className="text-ink-500">No workouts saved yet. There is no obligation to start; nutrition tracking works fully without this.</Card>}
      <div className="mt-4"><Note tone="warn">{SAFETY_NOTE} If you have an injury, a heart condition or have been inactive for a long time, check with a doctor before starting.</Note></div>

      <Sheet open={!!preview} onClose={() => setPreview(null)} title="Your workout" full>
        {preview && <><WorkoutCard w={preview} kg={kg} onStart={() => start(preview)} expanded /><Button variant="soft" block className="mt-3" onClick={gen}><Icon name="refresh" size={18} />Shuffle exercises</Button></>}
      </Sheet>
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.category || 'Workout'}>
        {detail && <WorkoutDetail w={detail} onDelete={async () => { await remove('workouts', detail.id); setDetail(null) }} />}
      </Sheet>
    </Page>
  )
}

function WorkoutCard({ w, kg, label, onStart, expanded }: { w: GeneratedWorkout; kg: number; label?: string; onStart: () => void; expanded?: boolean }) {
  const [open, setOpen] = useState(Boolean(expanded))
  return (
    <Card>
      {label && <div className="text-[13px] font-semibold uppercase tracking-wide text-leaf-700">{label}</div>}
      <div className="mt-0.5 text-[22px] font-bold capitalize leading-7">{w.title}</div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{w.estMinutes} min</div><div className="text-xs text-ink-500">Duration</div></div>
        <div className="rounded-2xl bg-ink-50 py-2"><div className="text-lg font-bold">{w.difficulty}</div><div className="text-xs text-ink-500">Difficulty</div></div>
        <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">~{workoutKcal(w.estMinutes, kg, w.met)}</div><div className="text-xs text-ink-500">kcal (estimate)</div></div>
      </div>
      <div className="mt-3 text-sm text-ink-700"><b>Targets:</b> {w.muscles.join(', ')}</div>
      <button className="mt-2 text-sm font-semibold text-leaf-700" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} {w.blocks.length} exercises</button>
      {open && (
        <div className="mt-2 divide-y divide-ink-100">
          {w.blocks.map((b, i) => (
            <Link key={i} to={`/workouts/exercise/${b.exercise.id}`} className="flex items-center gap-3 py-2">
              <Still ex={b.exercise} frame={Math.min(1, b.exercise.frames.length - 1)} className="h-12 w-12 shrink-0 rounded-xl bg-ink-50" />
              <div className="flex-1"><div className="font-medium">{b.exercise.name}</div><div className="num text-sm text-ink-500">{b.warmup ? 'Warm-up · ' : ''}{b.sets} × {b.target}{b.unit === 'sec' ? ' sec' : ' reps'}{b.exercise.perSide ? ' per side' : ''} · rest {b.rest}s</div></div>
            </Link>
          ))}
        </div>
      )}
      <Button block size="lg" className="mt-3" onClick={onStart}><Icon name="play" size={18} fill />Start workout</Button>
      <p className="mt-2 text-center text-[11px] text-ink-400">Calories burned are a rough estimate, shown separately, and never added to your food allowance.</p>
    </Card>
  )
}

export function WorkoutDetail({ w, onDelete }: { w: Workout; onDelete?: () => void }) {
  const f = w.ai_feedback
  return (
    <div className="space-y-3">
      <Card>
        <div className="text-sm text-ink-500">{fmtDate(w.local_date)} · {w.difficulty} · {w.source === 'manual' ? 'logged manually' : 'in-app session'}</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{fmt(w.duration_min)} min</div><div className="text-xs text-ink-500">Duration</div></div>
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{w.effort ?? '–'}/10</div><div className="text-xs text-ink-500">Effort</div></div>
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">~{fmt(w.est_kcal)}</div><div className="text-xs text-ink-500">kcal (estimate)</div></div>
        </div>
        {w.exercises.length > 0 && <div className="mt-3 divide-y divide-ink-100">{w.exercises.map((e, i) => <div key={i} className="flex justify-between py-2 text-[15px]"><span>{e.name}</span><span className="num text-ink-500">{e.sets.join(' · ')} {e.unit === 'sec' ? 'sec' : 'reps'}</span></div>)}</div>}
        {w.notes && <p className="mt-3 text-[15px] text-ink-700">“{w.notes}”</p>}
      </Card>
      {f && (
        <Card className="space-y-2.5 text-[15px] leading-6 text-ink-700">
          {([['Muscle groups trained', f.muscles], ['Balance', f.balance], ['Difficulty', f.difficulty], ['Next time', f.improve], ['Complements this session', f.complement], ['Recovery', f.recovery]] as const).map(([l, v]) => v ? <div key={l}><div className="text-[13px] font-semibold text-leaf-700">{l}</div>{v}</div> : null)}
        </Card>
      )}
      {onDelete && <Button variant="danger" block onClick={onDelete}><Icon name="trash" size={18} />Delete workout</Button>}
    </div>
  )
}
