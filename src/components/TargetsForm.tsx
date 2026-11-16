import { useState } from 'react'
import { checkCalorieTarget, suggestTargets } from '../lib/nutrition'
import type { Profile } from '../lib/types'
import { Button, Field, Note, NumInput } from './ui'

export interface TargetValues { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number; water_ml: number; professional_approved: boolean }
type P = Pick<Profile, 'sex' | 'age' | 'height_cm' | 'weight_kg' | 'activity'>

/** Shows the calculation and its assumptions, lets every target be edited, and warns on restrictive calories. */
export default function TargetsForm({ profile, initial, onSave, saveLabel = 'Save targets' }: { profile: P; initial?: TargetValues; onSave: (t: TargetValues) => void | Promise<void>; saveLabel?: string }) {
  const s = suggestTargets(profile)
  const [t, setT] = useState<TargetValues>(initial ?? { ...s.targets, professional_approved: false })
  const [showWhy, setShowWhy] = useState(!initial)
  const check = checkCalorieTarget(t.kcal, profile)
  const macroKcal = t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9
  const mismatch = Math.abs(macroKcal - t.kcal) > Math.max(100, t.kcal * 0.08)
  const blocked = check.level === 'danger' && !t.professional_approved
  const set = (k: keyof TargetValues) => (v: number) => setT({ ...t, [k]: v })

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-4 shadow-card">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="num text-xl font-bold">{s.bmr}</div><div className="text-xs text-ink-500">Resting kcal</div></div>
          <div><div className="num text-xl font-bold">{s.tdee}</div><div className="text-xs text-ink-500">Maintenance</div></div>
          <div><div className="num text-xl font-bold text-leaf-600">{s.targets.kcal}</div><div className="text-xs text-ink-500">Suggested</div></div>
        </div>
        <button className="mt-3 text-sm font-semibold text-leaf-700" onClick={() => setShowWhy(!showWhy)}>{showWhy ? 'Hide' : 'Show'} how this was estimated</button>
        {showWhy && <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-5 text-ink-700">{s.assumptions.map(a => <li key={a}>{a}</li>)}</ul>}
        <Button variant="soft" size="sm" className="mt-3" onClick={() => setT({ ...s.targets, professional_approved: false })}>Use suggested values</Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Daily calories (kcal)"><NumInput value={t.kcal} onChange={set('kcal')} /></Field>
        <Field label="Protein (g)"><NumInput value={t.protein_g} onChange={set('protein_g')} /></Field>
        <Field label="Carbohydrates (g)"><NumInput value={t.carbs_g} onChange={set('carbs_g')} /></Field>
        <Field label="Fat (g)"><NumInput value={t.fat_g} onChange={set('fat_g')} /></Field>
        <Field label="Fibre (g)"><NumInput value={t.fibre_g} onChange={set('fibre_g')} /></Field>
        <Field label="Water (ml)"><NumInput value={t.water_ml} onChange={set('water_ml')} step={250} /></Field>
      </div>

      {check.level !== 'ok' && <Note tone={check.level === 'danger' ? 'danger' : 'warn'}>{check.message}</Note>}
      {mismatch && <Note tone="warn">Your macros add up to about {Math.round(macroKcal)} kcal, which does not match the {t.kcal} kcal target. Adjust one of them so the day is achievable.</Note>}
      <label className="flex items-start gap-3 rounded-2xl bg-white p-3 shadow-card">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-leaf-600" checked={t.professional_approved} onChange={e => setT({ ...t, professional_approved: e.target.checked })} />
        <span className="text-[14px] leading-5 text-ink-700">These targets were set or approved by a doctor or registered dietitian.{check.level === 'danger' && <b className="block text-red-700">Required to save a target this low.</b>}</span>
      </label>
      <Button block size="lg" disabled={blocked || !(t.kcal > 0)} onClick={() => onSave(t)}>{saveLabel}</Button>
    </div>
  )
}
