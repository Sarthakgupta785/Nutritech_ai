import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { newId, put } from '../lib/db'
import { today } from '../lib/dates'
import { useProfile } from '../lib/hooks'
import { workoutKcal } from '../lib/nutrition'
import type { Workout, WorkoutSet } from '../lib/types'
import { Button, Card, Field, Icon, Input, NumInput, Page, Segmented, inputCls } from '../components/ui'
import { EXERCISES, EX_BY_ID } from './exercises'
import { localFeedback, requestWorkoutFeedback } from './shared'

const MET = { Easy: 3, Moderate: 4, Hard: 6 } as const

/** Log activity done outside the app: a walk, yoga, a session at a friend's place, anything. */
export default function ManualLog() {
  const nav = useNavigate(), profile = useProfile()
  const [date, setDate] = useState(today()), [time, setTime] = useState('18:00'), [name, setName] = useState(''), [minutes, setMinutes] = useState(20)
  const [difficulty, setDifficulty] = useState<keyof typeof MET>('Moderate'), [effort, setEffort] = useState(5), [notes, setNotes] = useState('')
  const [rows, setRows] = useState<WorkoutSet[]>([]), [pick, setPick] = useState(EXERCISES[0].id), [sets, setSets] = useState(2), [reps, setReps] = useState(10)

  async function save() {
    const w = { id: newId(), local_date: date, started_at: new Date(`${date}T${time}:00`).toISOString(), duration_min: minutes, category: name.trim() || 'Workout', difficulty, exercises: rows,
      notes: notes.trim() || null, effort, est_kcal: workoutKcal(minutes, profile?.weight_kg ?? 80, MET[difficulty]), source: 'manual' as const, ai_feedback: localFeedback({ exercises: rows, effort, duration_min: minutes }, 1) }
    await put('workouts', w)
    void requestWorkoutFeedback(w as Workout)
    nav('/workouts', { replace: true })
  }
  return (
    <Page title="Log a workout" back>
      <div className="space-y-3">
        <Field label="What did you do?"><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Brisk walk, yoga, home circuit" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><input type="date" max={today()} className={inputCls} value={date} onChange={e => e.target.value && setDate(e.target.value)} /></Field>
          <Field label="Start time"><input type="time" className={inputCls} value={time} onChange={e => e.target.value && setTime(e.target.value)} /></Field>
        </div>
        <Field label="Duration (minutes)"><NumInput value={minutes} onChange={setMinutes} /></Field>
        <Field label="Difficulty"><Segmented value={difficulty} onChange={setDifficulty} options={[{ value: 'Easy', label: 'Easy' }, { value: 'Moderate', label: 'Moderate' }, { value: 'Hard', label: 'Hard' }]} /></Field>
        <div><div className="mb-2 flex justify-between text-[13px] font-medium text-ink-500"><span>Perceived effort</span><span className="num font-bold text-ink-900">{effort}/10</span></div><input type="range" min={1} max={10} value={effort} onChange={e => setEffort(Number(e.target.value))} className="w-full accent-leaf-600" /></div>

        <Card>
          <div className="mb-2 font-semibold">Exercises performed <span className="text-sm font-normal text-ink-400">optional</span></div>
          {rows.map((r, i) => <div key={i} className="flex items-center justify-between border-b border-ink-100 py-2 text-[15px]"><span>{r.name}</span><span className="num flex items-center gap-3 text-ink-500">{r.sets.length} × {r.sets[0]}<button aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button></span></div>)}
          <select className={`${inputCls} mt-2`} value={pick} onChange={e => setPick(e.target.value)}>{EXERCISES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Field label="Sets"><NumInput value={sets} onChange={setSets} /></Field>
            <Field label={EX_BY_ID[pick].unit === 'sec' ? 'Seconds' : 'Reps'}><NumInput value={reps} onChange={setReps} /></Field>
            <div className="flex items-end"><Button variant="soft" block onClick={() => sets > 0 && reps > 0 && setRows([...rows, { exercise_id: pick, name: EX_BY_ID[pick].name, sets: Array(Math.min(sets, 10)).fill(reps), unit: EX_BY_ID[pick].unit }])}>Add</Button></div>
          </div>
        </Card>
        <Field label="Personal notes"><textarea className={`${inputCls} h-20 py-3`} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        <p className="text-xs text-ink-400">Estimated energy: about {workoutKcal(minutes, profile?.weight_kg ?? 80, MET[difficulty])} kcal. This is a rough estimate, shown separately from food and never added to your calorie allowance.</p>
        <Button block size="lg" disabled={!(minutes > 0)} onClick={save}>Save workout</Button>
      </div>
    </Page>
  )
}
