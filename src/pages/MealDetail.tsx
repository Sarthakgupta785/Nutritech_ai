import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import { createDraftMeal, deleteMeal, itemToDraft, SLOT_LABEL } from '../lib/actions'
import { alive, db, deletePhoto, newId, patch, put } from '../lib/db'
import { fmtDate, fmtTime, today } from '../lib/dates'
import { SOURCE_LABEL } from '../lib/foods'
import { usePhotoUrl } from '../lib/hooks'
import { sum } from '../lib/nutrition'
import { Badge, Button, Card, Icon, Note, Page, SectionTitle, fmt } from '../components/ui'

export default function MealDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const meal = useLiveQuery(() => db.meals.get(id), [id])
  const items = useLiveQuery(async () => alive(await db.meal_items.where('meal_id').equals(id).toArray()).sort((a, b) => a.sort - b.sort), [id]) ?? []
  const hasPhoto = useLiveQuery(async () => alive(await db.meal_photos.where('meal_id').equals(id).toArray()).length > 0, [id])
  const url = usePhotoUrl(id, Boolean(hasPhoto))
  if (!meal || meal.deleted_at) return <Page title="Meal" back><p className="text-ink-500">This meal is no longer available.</p></Page>
  const t = sum(items)

  async function duplicate() {
    const nid = await createDraftMeal({ slot: meal!.slot, date: today(), items: items.map(itemToDraft), name: meal!.name })
    nav(`/meal/${nid}/edit`)
  }
  async function favourite() {
    const name = window.prompt('Name this favourite meal', meal!.name || SLOT_LABEL[meal!.slot]); if (!name) return
    await put('favourite_meals', { id: newId(), name, items: items.map(itemToDraft) })
  }
  async function removePhoto() { if (window.confirm('Delete this photo? The meal entry stays.')) { await deletePhoto(id); await patch('meals', id, { no_photo: true }) } }
  async function removeMeal() { if (window.confirm('Delete this meal and its photo?')) { await deleteMeal(id); nav(-1) } }

  return (
    <Page title={meal.name || SLOT_LABEL[meal.slot]} back subtitle={`${SLOT_LABEL[meal.slot]} · ${fmtDate(meal.local_date, { day: 'numeric', month: 'short' })} · ${fmtTime(meal.eaten_at)}`}>
      {url && <img src={url} alt="Meal" className="w-full rounded-3xl object-cover shadow-card" />}
      {meal.status === 'draft' && <div className="mt-3"><Note tone="warn">Not confirmed yet, so it does not count toward your totals. Tap Edit to finish it.</Note></div>}

      <Card className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="num text-3xl font-bold">{fmt(t.kcal)}<span className="text-base font-semibold text-ink-500"> kcal est.</span></span>
          <Button size="sm" variant="soft" onClick={() => nav(`/meal/${id}/edit`)}><Icon name="edit" size={16} />Edit</Button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {([['Protein', t.protein_g], ['Carbs', t.carbs_g], ['Fat', t.fat_g], ['Fibre', t.fibre_g]] as const).map(([l, v]) => (
            <div key={l} className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{fmt(v)} g</div><div className="text-xs text-ink-500">{l}</div></div>
          ))}
        </div>
      </Card>

      <SectionTitle>Confirmed foods</SectionTitle>
      <div className="divide-y divide-ink-100 overflow-hidden rounded-3xl bg-surface shadow-card">
        {items.map(i => (
          <div key={i.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3"><span className="font-semibold">{i.name}</span><span className="num shrink-0 font-semibold">{fmt(i.kcal)} kcal</span></div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-500">
              <span className="num">{fmt(i.quantity)} {i.unit}{i.cooking_method ? ` · ${i.cooking_method}` : ''} · P {fmt(i.protein_g, 1)} · C {fmt(i.carbs_g, 1)} · F {fmt(i.fat_g, 1)}</span>
              <Badge className={SOURCE_LABEL[i.source].cls}>{SOURCE_LABEL[i.source].label}</Badge>
            </div>
          </div>
        ))}
        {!items.length && <div className="p-4 text-sm text-ink-500">No foods recorded.</div>}
      </div>

      {meal.ai_feedback && <><SectionTitle>AI feedback</SectionTitle><Card><p className="leading-6 text-ink-700">{meal.ai_feedback}</p></Card></>}
      {meal.ai_analysis && (
        <><SectionTitle>Photo analysis</SectionTitle>
          <Card className="text-[14px] leading-5 text-ink-700">
            <p>AI first identified: {meal.ai_analysis.items.map(i => `${i.name} (~${Math.round(i.grams)} ${i.unit})`).join(', ') || 'nothing'}.</p>
            <p className="mt-1 text-ink-500">{meal.ai_analysis.assumptions} Overall confidence {Math.round(meal.ai_analysis.overall_confidence * 100)}%. The confirmed foods above are what counts.</p>
          </Card></>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={duplicate}><Icon name="copy" size={18} />Duplicate to today</Button>
        <Button variant="outline" onClick={favourite}><Icon name="star" size={18} />Save as favourite</Button>
        {hasPhoto && <Button variant="danger" onClick={removePhoto}><Icon name="trash" size={18} />Delete photo</Button>}
        <Button variant="danger" onClick={removeMeal} className={hasPhoto ? '' : 'col-span-2'}><Icon name="trash" size={18} />Delete meal</Button>
      </div>
    </Page>
  )
}
