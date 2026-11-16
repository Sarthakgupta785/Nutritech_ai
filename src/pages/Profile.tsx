import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import TargetsForm from '../components/TargetsForm'
import { api } from '../lib/api'
import { db, newId, patch, put, remove, SYNC_TABLES, sync } from '../lib/db'
import { useProfile, usePrefs, useReminders, useSyncState, useTargets } from '../lib/hooks'
import { ACTIVITY } from '../lib/nutrition'
import { disablePush, enablePush, isIOS, pushStatus, type PushStatus } from '../lib/push'
import { supabase } from '../lib/supabase'
import { SLOT_LABEL, SLOTS, WEEKDAYS } from '../lib/actions'
import type { Profile as P, Reminder, Slot } from '../lib/types'
import { Button, Card, Field, Icon, Input, Note, NumInput, Page, SectionTitle, Segmented, Sheet, Toggle, inputCls } from '../components/ui'

export default function Profile() {
  const profile = useProfile(), targets = useTargets(), prefs = usePrefs(), reminders = useReminders(), sy = useSyncState()
  const { hash } = useLocation()
  const [sheet, setSheet] = useState<'profile' | 'targets' | 'prefs' | 'reminder' | null>(null)
  const [editing, setEditing] = useState<Reminder | null>(null)
  useEffect(() => { if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 50) }, [hash])
  if (!profile || !targets || !prefs) return null

  async function exportData() {
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() }
    for (const t of SYNC_TABLES) out[t] = await db[t].toArray()
    const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `nutritrack-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url)
  }
  const RowBtn = ({ label, value, onClick }: { label: string; value: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex w-full items-center justify-between px-4 py-3.5 text-left active:bg-ink-50"><span className="font-medium">{label}</span><span className="flex items-center gap-2 text-right text-sm text-ink-500">{value}<Icon name="right" size={16} className="text-ink-300" /></span></button>
  )
  return (
    <Page title="Profile">
      <div className="divide-y divide-ink-100 overflow-hidden rounded-3xl bg-white shadow-card">
        <RowBtn label="Personal details" value={`${profile.weight_kg} kg · ${profile.height_cm} cm · ${profile.age} y`} onClick={() => setSheet('profile')} />
        <RowBtn label="Daily targets" value={`${targets.kcal} kcal · ${targets.protein_g} g protein`} onClick={() => setSheet('targets')} />
        <RowBtn label="Food preferences" value={`Avoid: ${prefs.avoid.join(', ') || 'none'}`} onClick={() => setSheet('prefs')} />
      </div>

      <div id="reminders" />
      <SectionTitle right={<button className="text-sm font-semibold text-leaf-700" onClick={() => { setEditing(null); setSheet('reminder') }}>Add</button>}>Reminders</SectionTitle>
      <div className="divide-y divide-ink-100 overflow-hidden rounded-3xl bg-white shadow-card">
        {reminders.map(r => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
            <input aria-label={`${r.label} time`} type="time" value={r.time} onChange={e => e.target.value && patch('reminders', r.id, { time: e.target.value })} className="num h-10 w-[104px] rounded-xl bg-ink-50 px-2 font-semibold outline-none" />
            <button className="min-w-0 flex-1 truncate text-left font-medium" onClick={() => { setEditing(r); setSheet('reminder') }}>{r.label}{r.weekday != null && <span className="ml-1.5 text-[12px] font-normal text-ink-400">{WEEKDAYS[r.weekday].slice(0, 3)} only</span>}</button>
            <Toggle on={r.enabled} onChange={v => patch('reminders', r.id, { enabled: v })} label={`Enable ${r.label}`} />
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-ink-400">Reminders repeat every day at these times, in your phone's current timezone. Weigh-in reminders repeat weekly. Add as many water reminders as you like.</p>

      <SectionTitle>Notifications</SectionTitle>
      <Notifications />

      <SectionTitle>Optional features</SectionTitle>
      <Card className="flex items-center justify-between">
        <div><div className="font-medium">Home workouts</div><div className="text-sm text-ink-500">Equipment-free routines. Never required.</div></div>
        <Toggle on={prefs.workouts_enabled} onChange={v => patch('user_preferences', prefs.id, { workouts_enabled: v })} label="Home workouts" />
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-center justify-between text-sm"><span className="text-ink-700">{sy.online ? (sy.pending ? `${sy.pending} change${sy.pending === 1 ? '' : 's'} waiting to sync` : 'Everything is synced') : `Offline · ${sy.pending} change${sy.pending === 1 ? '' : 's'} saved on this phone`}</span><Button size="sm" variant="soft" disabled={sy.syncing} onClick={() => sync()}><Icon name="refresh" size={15} />Sync</Button></div>
        {sy.error && <Note tone="danger">Sync problem: {sy.error}</Note>}
        <Button variant="outline" block onClick={exportData}>Export my data (JSON)</Button>
        <Button variant="danger" block onClick={() => { if (!sy.pending || window.confirm('Some changes have not synced yet and would be lost. Sign out anyway?')) void supabase.auth.signOut() }}>Sign out</Button>
      </Card>
      <p className="mt-5 text-center text-[11px] leading-4 text-ink-400">NutriTrack AI gives estimates and general guidance. It is not a medical device and does not replace advice from a doctor or dietitian.</p>

      <Sheet open={sheet === 'profile'} onClose={() => setSheet(null)} title="Personal details"><ProfileForm p={profile} onDone={() => setSheet(null)} /></Sheet>
      <Sheet open={sheet === 'targets'} onClose={() => setSheet(null)} title="Daily targets" full>
        <TargetsForm profile={profile} initial={targets} onSave={async t => { await patch('nutrition_targets', targets.id, t); setSheet(null) }} />
      </Sheet>
      <Sheet open={sheet === 'prefs'} onClose={() => setSheet(null)} title="Food preferences"><PrefsForm onDone={() => setSheet(null)} /></Sheet>
      <Sheet open={sheet === 'reminder'} onClose={() => setSheet(null)} title={editing ? 'Edit reminder' : 'New reminder'}><ReminderForm r={editing} count={reminders.length} onDone={() => setSheet(null)} /></Sheet>
    </Page>
  )
}

function ProfileForm({ p, onDone }: { p: P; onDone: () => void }) {
  const [d, setD] = useState({ name: p.name, sex: p.sex, age: p.age, height_cm: p.height_cm, weight_kg: p.weight_kg, activity: p.activity })
  return (
    <div className="space-y-3">
      <Field label="Name"><Input value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></Field>
      <Field label="Sex (used by the energy equation)"><Segmented value={d.sex} onChange={sex => setD({ ...d, sex })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Age"><NumInput value={d.age} onChange={age => setD({ ...d, age })} /></Field>
        <Field label="Height (cm)"><NumInput value={d.height_cm} onChange={height_cm => setD({ ...d, height_cm })} /></Field>
        <Field label="Weight (kg)"><NumInput value={d.weight_kg} onChange={weight_kg => setD({ ...d, weight_kg })} /></Field>
      </div>
      <Field label="Activity"><select className={inputCls} value={d.activity} onChange={e => setD({ ...d, activity: e.target.value as P['activity'] })}>{Object.entries(ACTIVITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Note>Changing these does not change your targets automatically. Open Daily targets afterwards to review the new estimate.</Note>
      <Button block size="lg" onClick={async () => { await patch('profiles', p.id, d); onDone() }}>Save</Button>
    </div>
  )
}
function PrefsForm({ onDone }: { onDone: () => void }) {
  const prefs = usePrefs()!
  const [preferred, setPreferred] = useState(prefs.preferred.join(', ')), [avoid, setAvoid] = useState(prefs.avoid.join(', '))
  const [diet, setDiet] = useState(prefs.diet), [whey, setWhey] = useState(prefs.whey_max_scoops)
  const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)
  return (
    <div className="space-y-3">
      <Field label="Diet"><Input value={diet} onChange={e => setDiet(e.target.value)} /></Field>
      <Field label="Foods you eat and prefer" hint="Comma separated"><textarea className={`${inputCls} h-24 py-3`} value={preferred} onChange={e => setPreferred(e.target.value)} /></Field>
      <Field label="Foods to avoid" hint="Comma separated"><textarea className={`${inputCls} h-20 py-3`} value={avoid} onChange={e => setAvoid(e.target.value)} /></Field>
      <Field label="Whey protein: maximum scoops per day"><NumInput value={whey} onChange={setWhey} /></Field>
      <Button block size="lg" onClick={async () => { await patch('user_preferences', prefs.id, { diet, preferred: list(preferred), avoid: list(avoid), whey_max_scoops: whey }); onDone() }}>Save</Button>
    </div>
  )
}
function ReminderForm({ r, count, onDone }: { r: Reminder | null; count: number; onDone: () => void }) {
  const [label, setLabel] = useState(r?.label ?? ''), [time, setTime] = useState(r?.time ?? '15:00')
  const [kind, setKind] = useState<Reminder['kind']>(r?.kind ?? 'hydration'), [slot, setSlot] = useState<Slot>((r?.slot as Slot) ?? 'other')
  const [weekday, setWeekday] = useState<number>(r?.weekday ?? 6)
  async function save() {
    const fallback = kind === 'hydration' ? 'Hydration' : kind === 'weight' ? 'Weekly weigh-in' : SLOT_LABEL[slot]
    const base = { label: label.trim() || fallback, time, kind, slot: kind === 'meal' ? slot : null, weekday: kind === 'weight' ? weekday : null }
    if (r) await patch('reminders', r.id, base); else await put('reminders', { id: newId(), ...base, enabled: true, sort: count })
    onDone()
  }
  return (
    <div className="space-y-3">
      {(!r || r.kind !== 'review') && <Field label="Type"><Segmented value={kind === 'review' ? 'hydration' : kind} onChange={k => setKind(k)} options={[{ value: 'hydration', label: 'Water' }, { value: 'meal', label: 'Meal' }, { value: 'weight', label: 'Weigh-in' }]} /></Field>}
      {kind === 'weight' && <Field label="Day" hint="Weigh-in reminders repeat weekly; all others repeat daily."><select className={inputCls} value={weekday} onChange={e => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>}
      {kind === 'meal' && <Field label="Meal"><select className={inputCls} value={slot} onChange={e => setSlot(e.target.value as Slot)}>{SLOTS.map(s => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}</select></Field>}
      <Field label="Label"><Input value={label} onChange={e => setLabel(e.target.value)} placeholder={kind === 'hydration' ? 'Afternoon water' : kind === 'weight' ? 'Weekly weigh-in' : SLOT_LABEL[slot]} /></Field>
      <Field label="Time"><input type="time" className={inputCls} value={time} onChange={e => setTime(e.target.value)} /></Field>
      <Button block size="lg" onClick={save}>Save</Button>
      {r && r.kind !== 'review' && <Button variant="danger" block onClick={async () => { await remove('reminders', r.id); onDone() }}>Delete reminder</Button>}
    </div>
  )
}

function Notifications() {
  const [status, setStatus] = useState<PushStatus | null>(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const refresh = () => pushStatus().then(setStatus)
  useEffect(() => { void refresh() }, [])
  async function run(fn: () => Promise<unknown>, ok: string) { setBusy(true); setMsg(''); try { await fn(); setMsg(ok) } catch (e: any) { setMsg(e.message) } finally { setBusy(false); void refresh() } }
  return (
    <Card className="space-y-3">
      {status === 'on' && <>
        <div className="flex items-center gap-2 font-medium text-leaf-700"><Icon name="check" size={20} />Notifications are on for this device</div>
        <div className="flex gap-2"><Button variant="soft" className="flex-1" disabled={busy} onClick={() => run(() => api('test_push'), 'Test sent. It should arrive within a few seconds.')}>Send a test</Button><Button variant="outline" disabled={busy} onClick={() => run(disablePush, 'Turned off on this device.')}>Turn off</Button></div>
      </>}
      {status === 'off' && <><p className="text-ink-700">Get meal, hydration and daily-report reminders even when the app is closed.</p><Button block size="lg" disabled={busy} onClick={() => run(enablePush, 'Notifications enabled.')}><Icon name="bell" size={20} />Enable notifications</Button></>}
      {status === 'needs-install' && <Note tone="warn"><b>Install the app first.</b> On iPhone, notifications only work from the Home Screen app: in Safari tap Share, then "Add to Home Screen", open NutriTrack from the new icon, and come back here.</Note>}
      {status === 'denied' && <Note tone="warn">Notifications are blocked for NutriTrack. {isIOS() ? 'Open iPhone Settings → Notifications → NutriTrack and allow them.' : 'Allow them in your browser site settings.'}</Note>}
      {status === 'unsupported' && <Note tone="warn">This browser does not support web push. On iPhone you need iOS 16.4 or later and the app installed to the Home Screen.</Note>}
      {status === 'not-configured' && <Note tone="warn">Push is not configured in this build (VITE_VAPID_PUBLIC_KEY is missing). See the README.</Note>}
      {msg && <p className="text-sm text-ink-700">{msg}</p>}
      <p className="text-xs leading-4 text-ink-400">On iPhone, tapping a reminder opens a screen with Log, Snooze 10/15 min, Completed and Skipped. iOS does not always show action buttons on the notification itself.</p>
    </Card>
  )
}
