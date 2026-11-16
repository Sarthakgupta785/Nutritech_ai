import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import FoodSearch from '../components/FoodSearch'
import LabelScanner from '../components/LabelScanner'
import { confirmMeal, deleteMeal, draftsFromAnalysis, itemToDraft, SLOT_LABEL, SLOTS } from '../lib/actions'
import { api } from '../lib/api'
import { alive, db, loadPhoto, patch, savePhoto } from '../lib/db'
import { toLocalInput } from '../lib/dates'
import { draftFromFood, FOOD_BY_ID, FOODS, matchesAvoid, SOURCE_LABEL } from '../lib/foods'
import { useDay, usePhotoUrl, usePrefs } from '../lib/hooks'
import { blobToBase64, compressImage } from '../lib/image'
import { sum, withQuantity } from '../lib/nutrition'
import type { AiAnalysis, ItemDraft, Slot } from '../lib/types'
import { Badge, Button, Card, Icon, Input, Note, NumInput, Page, Spinner, cx, fmt, inputCls } from '../components/ui'

type Row = ItemDraft & { _key: string; _base?: number }
const METHODS = ['raw', 'boiled', 'steamed', 'grilled', 'roasted', 'baked', 'pan-fried', 'deep-fried', 'curry']
let seq = 0
const row = (d: ItemDraft, base?: number): Row => ({ ...d, _key: `k${seq++}`, _base: base })
const strip = ({ _key, _base, ...d }: Row): ItemDraft => d

export default function MealEditor() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const prefs = usePrefs()
  const meal = useLiveQuery(() => db.meals.get(id), [id])
  const saved = useLiveQuery(async () => alive(await db.meal_items.where('meal_id').equals(id).toArray()).sort((a, b) => a.sort - b.sort), [id])
  const hasPhotoRow = useLiveQuery(async () => alive(await db.meal_photos.where('meal_id').equals(id).toArray()).length > 0, [id])
  const photoUrl = usePhotoUrl(id, Boolean(hasPhotoRow))
  const day = useDay(meal?.local_date ?? '')

  const [rows, setRows] = useState<Row[] | null>(null)
  const [name, setName] = useState(''), [slot, setSlot] = useState<Slot>('other'), [eatenAt, setEatenAt] = useState('')
  const [analysing, setAnalysing] = useState(false), [err, setErr] = useState('')
  const [search, setSearch] = useState(params.get('add') === '1')
  const [scan, setScan] = useState(params.get('scan') === '1')
  const [dismissed, setDismissed] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const started = useRef(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Initialise the editable copy once: confirmed items if they exist, otherwise the AI proposal.
  useEffect(() => {
    if (!meal || saved === undefined || rows !== null) return
    setName(meal.name); setSlot(meal.slot); setEatenAt(meal.eaten_at)
    if (saved.length) setRows(saved.map(s => row(itemToDraft(s))))
    else if (meal.ai_analysis) setRows(draftsFromAnalysis(meal.ai_analysis).map(d => row(d, d.quantity)))
    else setRows([])
  }, [meal, saved, rows])

  async function analyse() {
    setErr('')
    if (!navigator.onLine) { setErr('You are offline, so the photo cannot be analysed right now. It is saved with this meal. Add the foods by hand, or come back and tap Analyse when you are connected.'); return }
    setAnalysing(true)
    try {
      const blob = await loadPhoto(id); if (!blob) throw new Error('Photo not found on this device')
      const { analysis } = await api<{ analysis: AiAnalysis }>('analyze_meal', {
        image: await blobToBase64(blob), media_type: 'image/jpeg', refs: FOODS.map(f => ({ id: f.id, name: f.name })),
        hint: `${SLOT_LABEL[slot]}. The user often eats: ${(prefs?.preferred ?? []).join(', ')}.`,
      })
      await patch('meals', id, { ai_analysis: analysis })
      setRows(draftsFromAnalysis(analysis).map(d => row(d, d.quantity))); setDismissed([])
      setName(n => n || analysis.meal_name)
    } catch (e: any) { setErr(e?.message ?? 'Analysis failed') } finally { setAnalysing(false) }
  }
  useEffect(() => {
    if (started.current || rows === null || !meal || !hasPhotoRow) return
    if (params.get('analyse') === '1' && !meal.ai_analysis && rows.length === 0) { started.current = true; void analyse() }
  }, [rows, meal, hasPhotoRow]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!meal || rows === null) return <Page title="Meal" back><div className="flex justify-center py-10"><Spinner /></div></Page>

  const update = (key: string, fn: (r: Row) => Row) => setRows(rs => rs!.map(r => (r._key === key ? fn(r) : r)))
  const addItems = (items: ItemDraft[]) => setRows(rs => [...(rs ?? []), ...items.map(d => row(d))])
  const totals = sum(rows)
  const analysis = meal.ai_analysis
  const photoOk = Boolean(hasPhotoRow) || meal.no_photo
  const questions = (analysis?.questions ?? []).map((q, i) => ({ ...q, i })).filter(q => !dismissed.includes(q.i))
  const avoided = rows.map(r => matchesAvoid(r.name, prefs?.avoid ?? [])).filter(Boolean)
  const wheyG = [...rows, ...day.meals.filter(m => m.id !== id && m.status === 'logged').flatMap(m => m.items)].filter(r => /whey/i.test(r.name)).reduce((n, r) => n + r.quantity, 0)
  const wheyOver = prefs && wheyG > prefs.whey_max_scoops * 30 + 5

  async function onPhoto(file?: File | null) {
    if (!file) return
    await savePhoto(id, await compressImage(file))
    if (meal!.no_photo) await patch('meals', id, { no_photo: false })
  }
  async function save() {
    setSaving(true)
    await confirmMeal(meal!, { name: name.trim() || SLOT_LABEL[slot], slot, eaten_at: eatenAt }, rows!.map(strip))
    nav('/log', { replace: true })
  }
  async function discard() { if (meal!.status === 'draft') await deleteMeal(id); nav(-1) }

  return (
    <Page title={meal.status === 'logged' ? 'Edit meal' : 'Confirm meal'} back right={<button className="text-sm font-semibold text-red-600" onClick={discard}>{meal.status === 'draft' ? 'Discard' : 'Cancel'}</button>}>
      {photoUrl ? (
        <div className="relative overflow-hidden rounded-3xl shadow-card">
          <img src={photoUrl} alt="Meal" className="max-h-72 w-full object-cover" />
          <div className="absolute bottom-3 right-3 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>Replace</Button>
            <Button size="sm" variant="outline" disabled={analysing} onClick={analyse}><Icon name="sparkle" size={15} />{analysis ? 'Re-analyse' : 'Analyse'}</Button>
          </div>
        </div>
      ) : !photoOk ? (
        <Card className="space-y-3">
          <div className="font-semibold">This meal needs a photo before it can be logged</div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => fileRef.current?.click()}><Icon name="camera" size={18} />Add photo</Button>
            <Button variant="outline" onClick={() => patch('meals', id, { no_photo: true })}>Log Without Photo</Button>
          </div>
        </Card>
      ) : meal.no_photo ? (
        <button onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2 rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-ink-700 shadow-card"><Icon name="camera" size={18} />Logged without photo · tap to add one</button>
      ) : <div className="flex h-40 items-center justify-center rounded-3xl bg-ink-100"><Spinner /></div>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => onPhoto(e.target.files?.[0])} />

      {analysing && <Card className="mt-3 flex items-center gap-3"><Spinner /><div><div className="font-semibold">Analysing your meal…</div><div className="text-sm text-ink-500">Identifying foods and estimating portions</div></div></Card>}
      {err && <div className="mt-3"><Note tone="warn">{err}</Note></div>}

      {analysis && !analysing && (
        <div className="mt-4">
          <h2 className="text-xl font-bold">Here's what I identified in your meal.</h2>
          <p className="mt-1 text-[13px] leading-5 text-ink-500">These are estimates from a photo, not measurements. Check each amount and correct anything that looks off. {analysis.assumptions}</p>
          {!analysis.items.length && <div className="mt-2"><Note tone="warn">I could not find food in this photo. Add items by hand below.</Note></div>}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Input aria-label="Meal name" placeholder="Meal name" value={name} onChange={e => setName(e.target.value)} className="col-span-2" />
        <select aria-label="Meal slot" className={inputCls} value={slot} onChange={e => setSlot(e.target.value as Slot)}>{SLOTS.map(s => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}</select>
        <input aria-label="Time eaten" type="datetime-local" className={inputCls} value={toLocalInput(eatenAt)} onChange={e => e.target.value && setEatenAt(new Date(e.target.value).toISOString())} />
      </div>

      <div className="mt-4 space-y-3">
        {rows.map(r => <ItemCard key={r._key} r={r} onChange={fn => update(r._key, fn)} onDelete={() => setRows(rs => rs!.filter(x => x._key !== r._key))} />)}
      </div>

      {questions.map(q => (
        <Card key={q.i} className="mt-3 border border-amber-200 bg-amber-50">
          <div className="text-[15px] font-semibold text-amber-900">{q.question}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {q.kind === 'oil' ? <>
              {([['None', 0], ['1 tsp', 4.5], ['2 tsp', 9], ['1 tbsp', 13.5]] as const).map(([label, g]) => (
                <Button key={label} size="sm" variant="outline" onClick={() => { if (g) addItems([{ ...draftFromFood(FOOD_BY_ID.oil, g), name: 'Cooking oil / ghee' }]); setDismissed(d => [...d, q.i]) }}>{label}</Button>
              ))}
            </> : <>
              <Button size="sm" variant="outline" onClick={() => setDismissed(d => [...d, q.i])}>No</Button>
              <Button size="sm" variant="outline" onClick={() => { setSearch(true); setDismissed(d => [...d, q.i]) }}>Yes, add it</Button>
            </>}
          </div>
        </Card>
      ))}

      <div className="mt-3 flex gap-2">
        <Button variant="soft" className="flex-1" onClick={() => setSearch(true)}><Icon name="plus" size={18} />Add food</Button>
        <Button variant="soft" className="flex-1" onClick={() => setScan(true)}><Icon name="camera" size={18} />Scan label</Button>
        <Button variant="soft" onClick={() => addItems([draftFromFood(FOOD_BY_ID.oil, 4.5)])}><Icon name="drop" size={18} />Oil</Button>
      </div>

      {avoided.length > 0 && <div className="mt-3"><Note>Heads-up: this meal includes {[...new Set(avoided)].join(', ')}, which is on your avoid list. Log it as it was; this is just so you know.</Note></div>}
      {wheyOver && <div className="mt-3"><Note>That makes about {fmt(wheyG / 30, 1)} scoops of whey today. Your own limit is {prefs!.whey_max_scoops}.</Note></div>}

      <div className="h-20" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-100 bg-surface/95 backdrop-blur-xl" style={{ paddingBottom: 'calc(var(--safe-b) + 10px)' }}>
        <div className="mx-auto max-w-lg px-4 pt-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="num text-2xl font-bold">{fmt(totals.kcal)} <span className="text-sm font-semibold text-ink-500">kcal est.</span></span>
            <span className="num text-sm text-ink-700">P {fmt(totals.protein_g)} g · C {fmt(totals.carbs_g)} g · F {fmt(totals.fat_g)} g</span>
          </div>
          <Button block size="lg" disabled={!photoOk || !rows.length || saving || analysing} onClick={save}>
            <Icon name="check" size={20} />{!photoOk ? 'Add a photo to continue' : !rows.length ? 'Add at least one food' : 'Confirm and save'}
          </Button>
        </div>
      </div>
      <FoodSearch open={search} onClose={() => setSearch(false)} onAdd={addItems} onScanLabel={() => setScan(true)} />
      <LabelScanner open={scan} onClose={() => setScan(false)} onAdd={addItems} />
    </Page>
  )
}

function ItemCard({ r, onChange, onDelete }: { r: Row; onChange: (fn: (r: Row) => Row) => void; onDelete: () => void }) {
  const [editNut, setEditNut] = useState(false)
  const src = SOURCE_LABEL[r.source]
  const ref = r.food_ref ? FOOD_BY_ID[r.food_ref] : undefined
  const conf = r.confidence
  const unclear = conf != null && conf < 0.6
  const setQty = (q: number) => onChange(x => ({ ...withQuantity(x, q), _key: x._key, _base: x._base }))
  const setMacro = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g', v: number) => onChange(x => ({ ...x, [k]: v, per100: null, source: 'edited' }))
  return (
    <Card className={cx(unclear && 'ring-2 ring-amber-300')}>
      <div className="flex items-start gap-2">
        <input aria-label="Food name" className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold outline-none" value={r.name} onChange={e => onChange(x => ({ ...x, name: e.target.value }))} />
        <button aria-label="Delete item" className="-mr-1 p-1 text-ink-400" onClick={onDelete}><Icon name="trash" size={19} /></button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge className={src.cls}>{src.label}</Badge>
        {conf != null && <Badge className={conf >= 0.8 ? 'bg-leaf-100 text-leaf-800' : conf >= 0.6 ? 'bg-ink-100 text-ink-700' : 'bg-amber-100 text-amber-800'}>{conf >= 0.8 ? 'High' : conf >= 0.6 ? 'Medium' : 'Low'} confidence</Badge>}
      </div>
      {unclear && <div className="mt-2 text-[13px] font-medium text-amber-800">Portion unclear from the photo. Enter the weight, pick a size, or confirm the estimate.</div>}

      <div className="mt-3 flex items-center gap-2">
        <div className="relative w-28 shrink-0">
          <NumInput aria-label="Quantity" value={r.quantity} onChange={setQty} className="pr-9 font-semibold" />
          <span className="pointer-events-none absolute right-3 top-3 text-ink-400">{r.unit}</span>
        </div>
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
          {r._base != null && ([['S', 0.7], ['M', 1], ['L', 1.4]] as const).map(([l, f]) => (
            <button key={l} onClick={() => setQty(Math.round(r._base! * f))} className={cx('h-10 min-w-10 rounded-xl px-2 text-sm font-semibold', Math.round(r._base! * f) === r.quantity ? 'bg-leaf-600 text-white' : 'bg-ink-100 text-ink-700')}>{l}</button>
          ))}
          {ref?.servings.map(([label, g]) => (
            <button key={label} onClick={() => setQty(g)} className={cx('h-10 shrink-0 rounded-xl px-2.5 text-[13px] font-semibold', g === r.quantity ? 'bg-leaf-600 text-white' : 'bg-ink-100 text-ink-700')}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="num text-[15px]"><b>{fmt(r.kcal)}</b> kcal<span className="text-ink-500"> · P {fmt(r.protein_g, 1)} · C {fmt(r.carbs_g, 1)} · F {fmt(r.fat_g, 1)}</span></div>
        <button className="text-sm font-semibold text-leaf-700" onClick={() => setEditNut(!editNut)}>{editNut ? 'Done' : 'Edit'}</button>
      </div>
      {editNut && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-5 gap-2">
            {([['kcal', 'kcal'], ['protein_g', 'Protein'], ['carbs_g', 'Carbs'], ['fat_g', 'Fat'], ['fibre_g', 'Fibre']] as const).map(([k, l]) => (
              <label key={k} className="block text-center"><span className="mb-1 block text-[11px] text-ink-500">{l}</span><NumInput value={r[k]} onChange={v => setMacro(k, v)} className="!h-10 !px-1 text-center text-sm" /></label>
            ))}
          </div>
          <label className="block"><span className="mb-1 block text-[13px] text-ink-500">Cooking method</span>
            <select className={inputCls} value={r.cooking_method ?? ''} onChange={e => onChange(x => ({ ...x, cooking_method: e.target.value || null }))}>
              <option value="">Not specified</option>{METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <p className="text-xs leading-4 text-ink-400">Changing the method does not change the numbers on its own. If oil, ghee or butter was used, add it as its own item so it is counted.</p>
        </div>
      )}
    </Card>
  )
}
