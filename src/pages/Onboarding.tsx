import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { getUid, newId, put } from '../lib/db'
import { DEFAULT_REMINDERS, setWeight } from '../lib/actions'
import { deviceTz } from '../lib/dates'
import { ACTIVITY } from '../lib/nutrition'
import type { Profile } from '../lib/types'
import TargetsForm, { type TargetValues } from '../components/TargetsForm'
import { Button, Field, Input, NumInput, Segmented, inputCls } from '../components/ui'

type Draft = Pick<Profile, 'name' | 'sex' | 'age' | 'height_cm' | 'weight_kg' | 'activity'>

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [p, setP] = useState<Draft>({ name: '', sex: 'male', age: 30, height_cm: 175, weight_kg: 93, activity: 'sedentary' })
  const [preferred, setPreferred] = useState('Eggs, Chicken, Brown rice, Oats')
  const [avoid, setAvoid] = useState('Paneer, Bread')
  const [whey, setWhey] = useState(1)
  const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

  async function finish(t: TargetValues) {
    const id = getUid()
    await put('nutrition_targets', { id, ...t })
    await put('user_preferences', { id, diet: 'Non-vegetarian', preferred: list(preferred), avoid: list(avoid), whey_max_scoops: whey, workouts_enabled: true, fitness_level: 'beginner', units: 'metric' })
    for (const r of DEFAULT_REMINDERS) await put('reminders', { ...r, id: newId() })
    await setWeight(p.weight_kg)
    await put('profiles', { id, ...p, goal: 'Fat loss while preserving muscle', timezone: deviceTz(), onboarded: true })
  }

  return (
    <div className="mx-auto min-h-full max-w-lg px-5 pb-10" style={{ paddingTop: 'calc(var(--safe-t) + 24px)' }}>
      <div className="mb-6 flex gap-1.5">{[0, 1, 2].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-leaf-500' : 'bg-ink-200'}`} />)}</div>
      {step === 0 && (
        <div className="space-y-4">
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">Let's set up your profile</h1>
          <p className="text-ink-500">Used to estimate your energy needs. You can change everything later.</p>
          <Field label="Your name"><Input value={p.name} onChange={e => setP({ ...p, name: e.target.value })} placeholder="Optional" /></Field>
          <Field label="Sex (used by the energy equation)"><Segmented value={p.sex} onChange={sex => setP({ ...p, sex })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Age"><NumInput value={p.age} onChange={age => setP({ ...p, age })} /></Field>
            <Field label="Height (cm)"><NumInput value={p.height_cm} onChange={height_cm => setP({ ...p, height_cm })} /></Field>
            <Field label="Weight (kg)"><NumInput value={p.weight_kg} onChange={weight_kg => setP({ ...p, weight_kg })} /></Field>
          </div>
          <Field label="Current activity">
            <select className={inputCls} value={p.activity} onChange={e => setP({ ...p, activity: e.target.value as Draft['activity'] })}>
              {Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Button block size="lg" disabled={!(p.age >= 13 && p.height_cm > 100 && p.weight_kg > 30)} onClick={() => setStep(1)}>Continue</Button>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-4">
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">Your food preferences</h1>
          <p className="text-ink-500">The AI coach and reports will respect these. Separate items with commas.</p>
          <Field label="Foods you eat and prefer"><textarea className={`${inputCls} h-24 py-3`} value={preferred} onChange={e => setPreferred(e.target.value)} /></Field>
          <Field label="Foods to avoid" hint="You will get a gentle heads-up if you log one of these."><textarea className={`${inputCls} h-20 py-3`} value={avoid} onChange={e => setAvoid(e.target.value)} /></Field>
          <Field label="Whey protein: maximum scoops per day"><NumInput value={whey} onChange={setWhey} min={0} max={4} /></Field>
          <div className="flex gap-3"><Button variant="outline" size="lg" onClick={() => setStep(0)}>Back</Button><Button block size="lg" onClick={() => setStep(2)}>Continue</Button></div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <h1 className="text-[30px] font-bold leading-9 tracking-tight">Your daily targets</h1>
          <p className="text-ink-500">A calculated starting point, fully editable. If a professional has given you numbers, enter those instead.</p>
          <TargetsForm profile={p} onSave={finish} saveLabel="Start using NutriTrack" />
          <Button variant="ghost" block onClick={() => setStep(1)}>Back</Button>
        </div>
      )}
      <button className="mt-8 w-full text-center text-sm text-ink-400" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )
}
