import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { alive, db, newId, put, remove } from '../lib/db'
import { draftFromFood, FOODS, matchesAvoid, searchFoods, SOURCE_LABEL } from '../lib/foods'
import { usePrefs } from '../lib/hooks'
import type { ItemDraft, Source, Unit } from '../lib/types'
import { Badge, Button, Field, Icon, Input, Note, NumInput, Segmented, Sheet, Spinner, fmt } from './ui'

type Tab = 'all' | 'recent' | 'meals' | 'custom'
interface Hit { key: string; name: string; unit: Unit; source: Source; kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number; servings?: [string, number][]; id?: string; keys?: string; cat?: string }

/** Searchable food picker: built-in reference foods, recent items, favourite meals, custom foods and live USDA lookup. */
export default function FoodSearch({ open, onClose, onAdd, onScanLabel }: { open: boolean; onClose: () => void; onAdd: (items: ItemDraft[]) => void; onScanLabel?: () => void }) {
  const prefs = usePrefs()
  const [tab, setTab] = useState<Tab>('all'), [q, setQ] = useState('')
  const [usda, setUsda] = useState<Hit[] | null>(null), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [creating, setCreating] = useState(false)
  const custom = useLiveQuery(async () => alive(await db.foods.toArray()), []) ?? []
  const favs = useLiveQuery(async () => alive(await db.favourite_meals.toArray()), []) ?? []
  const recent = useLiveQuery(async () => {
    const rows = alive(await db.meal_items.toArray()).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 800)
    const seen = new Set<string>(), out: Hit[] = []
    for (const r of rows) {
      const k = r.name.toLowerCase(); if (seen.has(k) || !r.per100) continue
      seen.add(k); out.push({ key: 'r' + r.id, name: r.name, unit: r.unit, source: r.source, ...r.per100, servings: [['Last amount', r.quantity]], id: r.food_ref ?? undefined })
      if (out.length >= 40) break
    }
    return out
  }, []) ?? []

  const all: Hit[] = useMemo(() => [
    ...custom.map(c => ({ key: 'c' + c.id, name: c.name, unit: c.unit, source: 'custom' as Source, kcal: c.kcal, protein_g: c.protein_g, carbs_g: c.carbs_g, fat_g: c.fat_g, fibre_g: c.fibre_g, servings: c.servings })),
    ...FOODS.map(f => ({ ...f, key: 'b' + f.id })),
  ], [custom])
  const list = tab === 'all' ? searchFoods(all, q) : tab === 'recent' ? searchFoods(recent, q) : tab === 'custom' ? searchFoods(all.filter(h => h.source === 'custom'), q) : []
  const add = (h: Hit) => { onAdd([draftFromFood({ ...h, id: h.id })]); onClose() }

  async function searchUsda() {
    setBusy(true); setErr('')
    try { const { foods } = await api<{ foods: any[] }>('food_search', { q }); setUsda(foods.map(f => ({ key: 'u' + f.fdc_id, name: f.name, unit: 'g', source: 'usda', kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fibre_g: f.fibre_g }))) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add food" full>
      <div className="relative mb-3">
        <Icon name="search" size={18} className="absolute left-3.5 top-[15px] text-ink-400" />
        <Input autoFocus placeholder="Search foods, e.g. chicken, dal, oats" value={q} onChange={e => { setQ(e.target.value); setUsda(null) }} className="pl-10" />
      </div>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'all', label: 'All' }, { value: 'recent', label: 'Recent' }, { value: 'meals', label: 'Favourites' }, { value: 'custom', label: 'Custom' }]} />

      {tab !== 'meals' && (
        <div className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white">
          {list.slice(0, 60).map(h => <Row key={h.key} h={h} avoid={matchesAvoid(h.name, prefs?.avoid ?? [])} onAdd={() => add(h)} />)}
          {!list.length && <div className="p-4 text-sm text-ink-500">{tab === 'recent' ? 'Foods you log will appear here.' : tab === 'custom' ? 'No custom foods yet.' : 'No match in the built-in list.'}</div>}
        </div>
      )}
      {tab === 'meals' && (
        <div className="mt-3 space-y-2">
          {favs.map(f => (
            <div key={f.id} className="flex items-center gap-3 rounded-2xl bg-white p-3">
              <button className="flex-1 text-left" onClick={() => { onAdd(f.items); onClose() }}>
                <div className="font-semibold">{f.name}</div>
                <div className="text-sm text-ink-500">{f.items.length} items · {fmt(f.items.reduce((n, i) => n + i.kcal, 0))} kcal</div>
              </button>
              <button aria-label="Delete favourite" className="p-2 text-ink-400" onClick={() => remove('favourite_meals', f.id)}><Icon name="trash" size={18} /></button>
            </div>
          ))}
          {!favs.length && <div className="rounded-2xl bg-white p-4 text-sm text-ink-500">Open any logged meal and tap "Save as favourite" to reuse it here.</div>}
        </div>
      )}

      {tab === 'all' && q.trim().length >= 2 && (
        <div className="mt-3">
          {usda === null ? <Button variant="outline" block onClick={searchUsda} disabled={busy}>{busy ? <Spinner /> : <Icon name="search" size={16} />}Search USDA database online</Button> : (
            <>
              <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">USDA FoodData Central</div>
              <div className="divide-y divide-ink-100 overflow-hidden rounded-2xl bg-white">
                {usda.map(h => <Row key={h.key} h={h} avoid={matchesAvoid(h.name, prefs?.avoid ?? [])} onAdd={() => add(h)} />)}
                {!usda.length && <div className="p-4 text-sm text-ink-500">No results.</div>}
              </div>
            </>
          )}
          {err && <div className="mt-2"><Note tone="danger">{err}</Note></div>}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {onScanLabel && <Button variant="soft" onClick={() => { onClose(); onScanLabel() }}><Icon name="camera" size={16} />Scan label</Button>}
        <Button variant="soft" className={onScanLabel ? '' : 'col-span-2'} onClick={() => setCreating(true)}><Icon name="plus" size={16} />Custom food</Button>
      </div>
      <CustomFood open={creating} initialName={q} onClose={() => setCreating(false)} onCreated={d => { onAdd([d]); onClose() }} />
    </Sheet>
  )
}

function Row({ h, avoid, onAdd }: { h: Hit; avoid: string | null; onAdd: () => void }) {
  const s = SOURCE_LABEL[h.source]
  return (
    <button onClick={onAdd} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-ink-50">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{h.name}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-500">
          <span className="num">{fmt(h.kcal)} kcal · P {fmt(h.protein_g, 1)} · C {fmt(h.carbs_g, 1)} · F {fmt(h.fat_g, 1)} per 100 {h.unit}</span>
          <Badge className={s.cls}>{s.label}</Badge>
          {avoid && <Badge className="bg-red-100 text-red-700">On your avoid list</Badge>}
        </div>
      </div>
      <Icon name="plus" size={20} className="shrink-0 text-leaf-600" />
    </button>
  )
}

function CustomFood({ open, onClose, onCreated, initialName }: { open: boolean; onClose: () => void; onCreated: (d: ItemDraft) => void; initialName: string }) {
  const [name, setName] = useState(''), [unit, setUnit] = useState<Unit>('g')
  const [m, setM] = useState({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }), [serving, setServing] = useState(100)
  const nm = name || initialName
  async function save() {
    const food = { id: newId(), name: nm.trim(), unit, ...m, servings: [['1 serving', serving]] as [string, number][], source: 'custom' as Source }
    await put('foods', food)
    onCreated(draftFromFood(food, serving)); onClose(); setName('')
  }
  return (
    <Sheet open={open} onClose={onClose} title="Custom food">
      <div className="space-y-3">
        <Field label="Name"><Input value={nm} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Measured in"><Segmented value={unit} onChange={setUnit} options={[{ value: 'g', label: 'Grams' }, { value: 'ml', label: 'Millilitres' }]} /></Field>
        <div className="text-[13px] font-medium text-ink-500">Nutrition per 100 {unit}, from the product label</div>
        <div className="grid grid-cols-2 gap-3">
          {([['kcal', 'Calories (kcal)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)'], ['fibre_g', 'Fibre (g)']] as const).map(([k, l]) =>
            <Field key={k} label={l}><NumInput value={m[k]} onChange={v => setM({ ...m, [k]: v })} /></Field>)}
          <Field label={`Usual serving (${unit})`}><NumInput value={serving} onChange={setServing} /></Field>
        </div>
        <Button block size="lg" disabled={!nm.trim() || !(m.kcal >= 0) || !(serving > 0)} onClick={save}>Save and add</Button>
      </div>
    </Sheet>
  )
}
