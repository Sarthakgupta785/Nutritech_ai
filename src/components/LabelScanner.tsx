import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { today } from '../lib/dates'
import { newId, put } from '../lib/db'
import { draftFromFood } from '../lib/foods'
import { useDay, useTargets } from '../lib/hooks'
import { blobToBase64, compressImage } from '../lib/image'
import { scale } from '../lib/nutrition'
import type { ItemDraft, LabelAnalysis, Unit } from '../lib/types'
import { Badge, Button, Card, Field, Icon, Input, Note, NumInput, Segmented, Sheet, Spinner, fmt } from './ui'

type Vals = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number }
const FIELDS: [keyof Vals, string][] = [['kcal', 'Calories'], ['protein_g', 'Protein'], ['carbs_g', 'Carbs'], ['fat_g', 'Fat'], ['fibre_g', 'Fibre']]

/**
 * Photograph the nutrition panel on a packet. The model reads it and normalises everything to
 * per-100 g/ml; the user confirms, says how much they ate, and the product is saved to their own
 * food list so it is a plain search hit next time.
 */
export default function LabelScanner({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (items: ItemDraft[]) => void }) {
  const targets = useTargets()
  const day = useDay(today())
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const [res, setRes] = useState<LabelAnalysis | null>(null)
  const [name, setName] = useState(''), [unit, setUnit] = useState<Unit>('g')
  const [v, setV] = useState<Vals>({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 })
  const [serving, setServing] = useState<number | null>(null), [qty, setQty] = useState(100)

  function reset() { setRes(null); setErr(''); setBusy(false) }
  function closeAll() { reset(); onClose() }

  async function onFile(file?: File | null) {
    if (!file) return
    setBusy(true); setErr(''); setRes(null)
    try {
      const blob = await compressImage(file, 1600, 0.9) // labels need more detail than a plate of food
      const { label } = await api<{ label: LabelAnalysis }>('analyze_label', { image: await blobToBase64(blob), media_type: 'image/jpeg' })
      setRes(label)
      setName([label.brand, label.product_name].filter(Boolean).join(' ').trim() || 'Packaged food')
      setUnit(label.unit === 'ml' ? 'ml' : 'g')
      setV({ kcal: Math.round(label.kcal), protein_g: label.protein_g, carbs_g: label.carbs_g, fat_g: label.fat_g, fibre_g: label.fibre_g })
      setServing(label.serving_grams && label.serving_grams > 0 ? Math.round(label.serving_grams) : null)
      setQty(label.serving_grams && label.serving_grams > 0 ? Math.round(label.serving_grams) : 100)
    } catch (e: any) { setErr(e?.message ?? 'Could not read that label') } finally { setBusy(false) }
  }

  async function addIt() {
    const food = { id: newId(), name: name.trim() || 'Packaged food', unit, ...v, source: 'custom' as const,
      servings: (serving ? [[res?.serving_label || '1 serving', serving] as [string, number]] : []).concat([['100 ' + unit, 100]]) }
    await put('foods', food)            // reusable: it becomes a search hit from now on
    onAdd([draftFromFood(food, qty)])
    closeAll()
  }

  const eaten = scale(v, qty)
  const pctCal = targets?.kcal ? Math.round((eaten.kcal / targets.kcal) * 100) : null
  const left = targets ? Math.round(targets.kcal - day.totals.kcal - eaten.kcal) : null
  const lowConf = res != null && res.confidence < 0.6

  return (
    <Sheet open={open} onClose={closeAll} title="Scan nutrition label" full>
      {!res && !busy && (
        <div className="space-y-3">
          <Note>Photograph the <b>nutrition table on the back</b> of the packet, filling the frame and keeping it in focus. Works on any product — no barcode needed.</Note>
          <Button block size="lg" onClick={() => camera.current?.click()}><Icon name="camera" size={20} />Take photo of label</Button>
          <Button block size="lg" variant="outline" onClick={() => gallery.current?.click()}><Icon name="image" size={20} />Choose from gallery</Button>
          {err && <Note tone="danger">{err}</Note>}
        </div>
      )}
      {busy && <div className="flex flex-col items-center gap-3 py-12"><Spinner /><div className="text-ink-500">Reading the label…</div></div>}

      {res && !busy && (
        <div className="space-y-3">
          {res.confidence === 0 ? <Note tone="danger">{res.notes || 'That does not look like a nutrition label.'}</Note> : <>
            <Card className="space-y-3">
              <Field label="Product"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
              <div className="flex items-center gap-2">
                <Badge className={lowConf ? 'bg-amber-100 text-amber-800' : 'bg-leaf-100 text-leaf-800'}>{lowConf ? 'Low' : res.confidence >= 0.8 ? 'High' : 'Medium'} confidence</Badge>
                <Badge className="bg-ink-100 text-ink-700">Label printed {res.printed_basis === 'per_serving' ? 'per serving' : res.printed_basis === 'both' ? 'both columns' : 'per 100'}</Badge>
              </div>
              {res.notes && <p className="text-[13px] leading-5 text-ink-500">{res.notes}</p>}
            </Card>

            <Card>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-ink-500">Per 100 {unit} — check against the packet</span>
                <Segmented value={unit} onChange={setUnit} options={[{ value: 'g', label: 'g' }, { value: 'ml', label: 'ml' }]} />
              </div>
              <div className="grid grid-cols-5 gap-2">
                {FIELDS.map(([k, l]) => (
                  <label key={k} className="block text-center"><span className="mb-1 block text-[11px] text-ink-500">{l}</span>
                    <NumInput value={v[k]} onChange={n => setV({ ...v, [k]: n })} className="!h-10 !px-1 text-center text-sm" /></label>
                ))}
              </div>
              {res.sugar_g != null && <p className="mt-2 text-[13px] text-ink-500">Of which sugars: {fmt(res.sugar_g, 1)} g per 100 {unit}</p>}
            </Card>

            <Card>
              <div className="mb-2 text-[13px] font-semibold text-ink-500">How much did you eat?</div>
              <div className="flex items-center gap-2">
                <div className="relative w-28 shrink-0">
                  <NumInput aria-label="Amount eaten" value={qty} onChange={setQty} className="pr-9 font-semibold" />
                  <span className="pointer-events-none absolute right-3 top-3 text-ink-400">{unit}</span>
                </div>
                <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
                  {serving && <Button size="sm" variant={qty === serving ? 'primary' : 'outline'} onClick={() => setQty(serving)}>{res.serving_label || 'Serving'} ({serving}{unit})</Button>}
                  {serving && <Button size="sm" variant={qty === serving * 2 ? 'primary' : 'outline'} onClick={() => setQty(serving * 2)}>Double</Button>}
                  <Button size="sm" variant={qty === 100 ? 'primary' : 'outline'} onClick={() => setQty(100)}>100{unit}</Button>
                </div>
              </div>
              <div className="num mt-3 text-[15px]"><b>{fmt(eaten.kcal)}</b> kcal<span className="text-ink-500"> · P {fmt(eaten.protein_g, 1)} · C {fmt(eaten.carbs_g, 1)} · F {fmt(eaten.fat_g, 1)} g</span></div>
              {pctCal != null && <div className="mt-1 text-[13px] text-ink-500">{pctCal}% of your daily calories{left != null && <> · {left >= 0 ? `${fmt(left)} kcal left today after this` : `${fmt(-left)} kcal over target`}</>}</div>}
            </Card>

            {res.verdict && <Card className="bg-leaf-50"><div className="flex gap-2"><Icon name="sparkle" size={18} className="mt-0.5 shrink-0 text-leaf-700" /><p className="text-[15px] leading-6 text-leaf-900">{res.verdict}</p></div></Card>}
            {lowConf && <Note tone="warn">The label was hard to read, so check every number above against the packet before saving.</Note>}

            <Button block size="lg" disabled={!name.trim()} onClick={addIt}><Icon name="check" size={20} />Add to meal and save this food</Button>
            <p className="text-center text-xs text-ink-400">Saved to your own food list, so next time just search for it.</p>
          </>}
          <Button variant="ghost" block onClick={reset}>Scan a different label</Button>
        </div>
      )}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => onFile(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
    </Sheet>
  )
}
