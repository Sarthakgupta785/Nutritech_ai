import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { alive, db, newId, put } from '../lib/db'
import { addDays, today } from '../lib/dates'
import { useProfile } from '../lib/hooks'
import { workoutKcal } from '../lib/nutrition'
import type { Workout, WorkoutSet } from '../lib/types'
import { Button, Card, Field, Icon, Note, cx, inputCls } from '../components/ui'
import { EX_BY_ID } from './exercises'
import { Animated } from './Figure'
import { clearWorkout, localFeedback, readWorkout, requestWorkoutFeedback } from './shared'
import { WorkoutDetail } from './Workouts'

type Phase = 'work' | 'rest' | 'summary' | 'saved'

export default function Session() {
  const nav = useNavigate()
  const plan = useMemo(() => readWorkout(), [])
  const profile = useProfile()
  const recentDays = useLiveQuery(async () => new Set(alive(await db.workouts.toArray()).map(w => w.local_date)), []) ?? new Set<string>()
  const [bi, setBi] = useState(0), [si, setSi] = useState(0), [phase, setPhase] = useState<Phase>('work')
  const [results, setResults] = useState<number[][]>(() => plan?.blocks.map(() => []) ?? [])
  const [count, setCount] = useState(plan?.blocks[0]?.target ?? 0)
  const [left, setLeft] = useState(0), [timing, setTiming] = useState(false), [paused, setPaused] = useState(false)
  const [showHow, setShowHow] = useState(false)
  const startedAt = useRef(new Date()), pausedMs = useRef(0), pauseStart = useRef(0)
  const [notes, setNotes] = useState(''), [effort, setEffort] = useState(5), [saved, setSaved] = useState<Workout | null>(null)
  const savedLive = useLiveQuery(async () => (saved ? await db.workouts.get(saved.id) : undefined), [saved?.id])

  const block = plan?.blocks[bi], ex = block ? EX_BY_ID[block.id] : undefined

  // One ticking clock drives both timed sets and rest periods; pausing freezes it.
  useEffect(() => {
    if (paused || !(phase === 'rest' || (phase === 'work' && timing))) return
    const t = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000)
    return () => clearInterval(t)
  }, [paused, phase, timing])
  useEffect(() => {
    if (left > 0 || paused) return
    if (phase === 'rest') next()
    else if (phase === 'work' && timing) completeSet(block!.target)
  }, [left]) // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the screen awake during a session where the browser supports it.
  useEffect(() => {
    let lock: any
    void (navigator as any).wakeLock?.request?.('screen').then((l: any) => { lock = l }).catch(() => {})
    return () => { void lock?.release?.() }
  }, [])

  if (!plan || !plan.blocks.length) return <Navigate to="/workouts" replace />

  function togglePause() {
    if (paused) pausedMs.current += Date.now() - pauseStart.current; else pauseStart.current = Date.now()
    setPaused(!paused)
  }
  function completeSet(value: number) {
    setResults(r => r.map((x, i) => (i === bi ? [...x, value] : x)))
    setTiming(false)
    const lastSet = si + 1 >= block!.sets, lastBlock = bi + 1 >= plan!.blocks.length
    if (lastSet && lastBlock) { setPhase('summary'); return }
    setLeft(block!.rest); setPhase('rest')
  }
  function next() {
    const lastSet = si + 1 >= block!.sets
    const nbi = lastSet ? bi + 1 : bi
    if (nbi >= plan!.blocks.length) { setPhase('summary'); return }
    setBi(nbi); setSi(lastSet ? 0 : si + 1); setCount(plan!.blocks[nbi].target); setTiming(false); setPhase('work'); setShowHow(false)
  }
  function skipExercise() {
    if (bi + 1 >= plan!.blocks.length) { setPhase('summary'); return }
    setBi(bi + 1); setSi(0); setCount(plan!.blocks[bi + 1].target); setTiming(false); setPhase('work'); setShowHow(false)
  }
  const durationMin = () => Math.max(1, Math.round((Date.now() - startedAt.current.getTime() - pausedMs.current - (paused ? Date.now() - pauseStart.current : 0)) / 60000))

  async function save() {
    const exercises: WorkoutSet[] = plan!.blocks.map((b, i) => ({ exercise_id: b.id, name: EX_BY_ID[b.id].name, sets: results[i], unit: b.unit })).filter(e => e.sets.length)
    const duration_min = durationMin(), date = today()
    let consecutive = 1; for (let d = addDays(date, -1); recentDays.has(d); d = addDays(d, -1)) consecutive++
    const base = { id: newId(), local_date: date, started_at: startedAt.current.toISOString(), duration_min, category: plan!.title, difficulty: plan!.difficulty, exercises, notes: notes.trim() || null, effort, est_kcal: workoutKcal(duration_min, profile?.weight_kg ?? 80, plan!.met), source: 'app' as const }
    const w = { ...base, ai_feedback: localFeedback({ exercises, effort, duration_min }, consecutive) }
    await put('workouts', w)
    clearWorkout(); setSaved(w as Workout); setPhase('saved')
    void requestWorkoutFeedback(w as Workout)
  }
  const discard = () => { clearWorkout(); nav('/workouts', { replace: true }) }
  const doneSets = results.reduce((n, r) => n + r.length, 0), totalSets = plan.blocks.reduce((n, b) => n + b.sets, 0)
  const nextBlock = si + 1 < (block?.sets ?? 0) ? block : plan.blocks[bi + 1]

  if (phase === 'saved' && saved) return (
    <div className="mx-auto max-w-lg px-4 pb-10" style={{ paddingTop: 'calc(var(--safe-t) + 20px)' }}>
      <h1 className="mb-1 text-[28px] font-bold">Workout saved</h1><p className="mb-4 text-ink-500">Nicely done. Your food targets stay exactly as they were.</p>
      <WorkoutDetail w={savedLive ?? saved} />
      <Button block size="lg" className="mt-4" onClick={() => nav('/workouts', { replace: true })}>Done</Button>
    </div>
  )
  if (phase === 'summary') return (
    <div className="mx-auto max-w-lg px-4 pb-10" style={{ paddingTop: 'calc(var(--safe-t) + 20px)' }}>
      <h1 className="text-[28px] font-bold leading-8">Would you like to save this workout?</h1>
      <p className="mt-1 text-ink-500">{doneSets} of {totalSets} sets · about {durationMin()} min</p>
      {doneSets === 0 && <div className="mt-3"><Note>No sets were recorded. You can still save it, or skip saving.</Note></div>}
      <Card className="mt-4 space-y-4">
        <div><div className="mb-2 flex justify-between text-[15px] font-medium"><span>How hard did it feel?</span><span className="num font-bold">{effort}/10</span></div>
          <input type="range" min={1} max={10} value={effort} onChange={e => setEffort(Number(e.target.value))} className="w-full accent-leaf-600" />
          <div className="flex justify-between text-xs text-ink-400"><span>Very easy</span><span>Maximum</span></div></div>
        <Field label="Personal notes (optional)"><textarea className={`${inputCls} h-20 py-3`} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
      </Card>
      <div className="mt-4 space-y-3"><Button block size="lg" onClick={save}>Yes, save it</Button><Button block size="lg" variant="outline" onClick={discard}>No, don't save</Button>
        {doneSets < totalSets && <Button block variant="ghost" onClick={() => setPhase('work')}>Back to workout</Button>}</div>
    </div>
  )

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 pb-6" style={{ paddingTop: 'calc(var(--safe-t) + 12px)' }}>
      <div className="mb-3 flex items-center justify-between">
        <button className="text-[15px] font-semibold text-ink-500" onClick={() => setPhase('summary')}>Finish workout</button>
        <span className="num text-sm font-semibold text-ink-500">Exercise {bi + 1}/{plan.blocks.length}</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-leaf-500 transition-all" style={{ width: `${(doneSets / totalSets) * 100}%` }} /></div>

      {phase === 'rest' ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">Rest</div>
          <div className="num text-[96px] font-bold leading-none text-leaf-600">{left}</div>
          {nextBlock && <div className="mt-6 w-full rounded-3xl bg-surface p-4 shadow-card"><div className="text-[13px] font-semibold text-ink-500">Next</div><div className="text-lg font-bold">{EX_BY_ID[nextBlock.id].name}</div><div className="num text-sm text-ink-500">{nextBlock === block ? `Set ${si + 2} of ${block!.sets}` : `${nextBlock.sets} × ${nextBlock.target}${nextBlock.unit === 'sec' ? ' sec' : ' reps'}`}</div></div>}
          <div className="mt-6 grid w-full grid-cols-2 gap-3"><Button variant="outline" size="lg" onClick={togglePause}><Icon name={paused ? 'play' : 'pause'} size={18} />{paused ? 'Resume' : 'Pause'}</Button><Button size="lg" onClick={next}>Skip rest</Button></div>
        </div>
      ) : ex && block && (
        <>
          <Card className="!p-3"><Animated ex={ex} paused={paused} className="mx-auto aspect-[11/10] w-full max-w-sm rounded-2xl bg-ink-50" /></Card>
          <div className="mt-3 text-center">
            <h1 className="text-[26px] font-bold leading-8">{ex.name}</h1>
            <div className="num text-[15px] font-medium text-ink-500">Set {si + 1} of {block.sets} · target {block.target}{block.unit === 'sec' ? ' seconds' : ' reps'}{ex.perSide ? ' per side' : ''}</div>
          </div>
          <button className="mx-auto mt-1 text-sm font-semibold text-leaf-700" onClick={() => setShowHow(!showHow)}>{showHow ? 'Hide' : 'Show'} instructions</button>
          {showHow && <Card className="mt-2 text-[15px] leading-6 text-ink-700"><ol className="list-decimal space-y-1 pl-5">{ex.steps.map(s => <li key={s}>{s}</li>)}</ol><p className="mt-2"><b>Breathing:</b> {ex.breathing}</p><p className="mt-1"><b>Easier:</b> {ex.modification}</p></Card>}

          <div className="flex flex-1 flex-col items-center justify-center py-4">
            {block.unit === 'sec' ? (
              timing ? <><div className="num text-[84px] font-bold leading-none text-leaf-600">{left}</div><div className="mt-1 text-sm text-ink-500">seconds left</div>
                <Button variant="soft" className="mt-4" onClick={() => completeSet(block.target - left)}>Stop early and record {block.target - left}s</Button></>
                : <Button size="lg" className="h-20 w-56 !rounded-full text-xl" onClick={() => { setLeft(block.target); setTiming(true); if (paused) togglePause() }}><Icon name="play" size={22} fill />Start {block.target}s</Button>
            ) : (
              <>
                <div className="flex items-center gap-6">
                  <button aria-label="One fewer rep" className="flex h-16 w-16 items-center justify-center rounded-full bg-ink-100 text-ink-700 active:bg-ink-200" onClick={() => setCount(c => Math.max(0, c - 1))}><Icon name="minus" size={28} /></button>
                  <div className="num w-24 text-center text-[84px] font-bold leading-none">{count}</div>
                  <button aria-label="One more rep" className="flex h-16 w-16 items-center justify-center rounded-full bg-leaf-50 text-leaf-700 active:bg-leaf-100" onClick={() => setCount(c => c + 1)}><Icon name="plus" size={28} /></button>
                </div>
                <div className="mt-2 text-sm text-ink-500">reps completed{ex.perSide ? ' per side' : ''} · adjust to what you actually did</div>
              </>
            )}
          </div>

          {block.unit === 'reps' && <Button block size="lg" onClick={() => completeSet(count)}><Icon name="check" size={20} />Set done</Button>}
          <div className={cx('mt-3 grid grid-cols-2 gap-3')}>
            <Button variant="outline" onClick={togglePause}><Icon name={paused ? 'play' : 'pause'} size={18} />{paused ? 'Resume' : 'Pause'}</Button>
            <Button variant="outline" onClick={skipExercise}><Icon name="skip" size={18} />Skip exercise</Button>
          </div>
          <div className="mt-3 text-center text-sm text-ink-500">{nextBlock ? <>Next: <b>{nextBlock === block ? `${ex.name}, set ${si + 2}` : EX_BY_ID[nextBlock.id].name}</b></> : 'Last set'}</div>
          <p className="mt-2 text-center text-[11px] text-ink-400">Stop if you feel pain, dizziness or unusual discomfort.</p>
        </>
      )}
    </div>
  )
}
