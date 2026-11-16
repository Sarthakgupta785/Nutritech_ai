import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createDraftMeal, SLOT_LABEL, SLOTS } from '../lib/actions'
import { fmtDate, today } from '../lib/dates'
import { compressImage } from '../lib/image'
import type { Slot } from '../lib/types'
import { Icon, Note, Page, Spinner, inputCls } from '../components/ui'

/** First step of every meal: photo from camera, photo from gallery, or an explicit "log without photo". */
export default function MealNew() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [slot, setSlot] = useState<Slot>((SLOTS.includes(params.get('slot') as Slot) ? params.get('slot') : 'other') as Slot)
  const date = params.get('date') ?? today()
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false), [err, setErr] = useState('')

  async function onFile(file?: File | null) {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const photo = await compressImage(file)
      const id = await createDraftMeal({ slot, date, photo })
      nav(`/meal/${id}/edit?analyse=1`, { replace: true })
    } catch (e: any) { setErr(e?.message ?? 'Could not read that image'); setBusy(false) }
  }
  async function withoutPhoto() {
    const id = await createDraftMeal({ slot, date, noPhoto: true })
    nav(`/meal/${id}/edit?add=1`, { replace: true })
  }
  const Option = ({ icon, title, sub, onClick, quiet }: { icon: string; title: string; sub: string; onClick: () => void; quiet?: boolean }) => (
    <button onClick={onClick} disabled={busy} className={`flex w-full items-center gap-4 rounded-3xl p-5 text-left shadow-card active:scale-[.99] ${quiet ? 'bg-white' : 'bg-leaf-600 text-white'}`}>
      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${quiet ? 'bg-ink-100 text-ink-700' : 'bg-white/20'}`}><Icon name={icon} size={28} /></div>
      <div><div className="text-[19px] font-bold">{title}</div><div className={`text-sm ${quiet ? 'text-ink-500' : 'text-white/85'}`}>{sub}</div></div>
    </button>
  )
  return (
    <Page title="Add meal" back subtitle={date === today() ? 'Today' : fmtDate(date)}>
      <select className={`${inputCls} mb-4 font-semibold`} value={slot} onChange={e => setSlot(e.target.value as Slot)} aria-label="Meal">
        {SLOTS.map(s => <option key={s} value={s}>{SLOT_LABEL[s]}</option>)}
      </select>
      <div className="space-y-3">
        <Option icon="camera" title="Take Photo" sub="AI identifies the food and estimates portions" onClick={() => camera.current?.click()} />
        <Option icon="image" title="Upload from Gallery" sub="Choose a photo you already took" onClick={() => gallery.current?.click()} quiet />
        <Option icon="edit" title="Log Without Photo" sub="Only if you can't take one. Enter foods by hand." onClick={withoutPhoto} quiet />
      </div>
      {busy && <div className="mt-6 flex items-center justify-center gap-3 text-ink-500"><Spinner />Preparing photo…</div>}
      {err && <div className="mt-4"><Note tone="danger">{err}</Note></div>}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={e => onFile(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={e => onFile(e.target.files?.[0])} />
    </Page>
  )
}
