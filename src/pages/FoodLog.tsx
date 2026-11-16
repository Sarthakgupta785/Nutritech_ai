import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MealThumb } from '../components/MealBits'
import { markSkipped, SLOT_LABEL } from '../lib/actions'
import { remove } from '../lib/db'
import { addDays, fmtDate, fmtHHMM, fmtTime, today } from '../lib/dates'
import { mealSlots, useDay, useReminders, useTargets, type DayData } from '../lib/hooks'
import type { Slot } from '../lib/types'
import { Badge, Button, Card, Icon, Page, Segmented, Skeleton, SkeletonCard, fmt } from '../components/ui'

export default function FoodLog() {
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? today()
  const [view, setView] = useState<'list' | 'photos'>('list')
  const day = useDay(date), targets = useTargets(), reminders = useReminders()
  const setDate = (d: string) => setParams(d === today() ? {} : { date: d }, { replace: true })
  const scheduled = mealSlots(reminders)
  const slots: { slot: Slot; time?: string }[] = [...scheduled.map(r => ({ slot: r.slot as Slot, time: r.time })), ...(day.meals.some(m => m.slot === 'other') || !scheduled.length ? [{ slot: 'other' as Slot }] : [])]
  const t = day.totals

  return (
    <Page title="Food Log">
      <div className="mb-3 flex items-center justify-between rounded-2xl bg-surface p-1.5 shadow-card">
        <button aria-label="Previous day" className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-700 active:bg-ink-100" onClick={() => setDate(addDays(date, -1))}><Icon name="left" size={20} /></button>
        <div className="relative text-center">
          <div className="font-semibold">{date === today() ? 'Today' : date === addDays(today(), -1) ? 'Yesterday' : fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
          <input aria-label="Pick date" type="date" max={today()} value={date} onChange={e => e.target.value && setDate(e.target.value)} className="absolute inset-0 opacity-0" />
        </div>
        <button aria-label="Next day" disabled={date >= today()} className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-700 active:bg-ink-100 disabled:text-ink-200" onClick={() => setDate(addDays(date, 1))}><Icon name="right" size={20} /></button>
      </div>

      <Card className="mb-3">
        <div className="flex items-baseline justify-between">
          <span className="num text-2xl font-bold">{fmt(t.kcal)}<span className="text-sm font-semibold text-ink-500"> / {fmt(targets?.kcal ?? 0)} kcal</span></span>
          <span className="num text-sm text-ink-700">P {fmt(t.protein_g)} · C {fmt(t.carbs_g)} · F {fmt(t.fat_g)} g</span>
        </div>
      </Card>
      <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'Meals' }, { value: 'photos', label: 'Photo journal' }]} />

      {!day.loaded ? (
        <div className="mt-3 space-y-3">{[0, 1, 2].map(i => <SkeletonCard key={i} lines={2} />)}</div>
      ) : view === 'list' ? (
        <div className="mt-3 space-y-3">
          {slots.map(s => <SlotCard key={s.slot} slot={s.slot} time={s.time} day={day} date={date} />)}
          <Button variant="soft" block onClick={() => nav(`/meal/new?slot=other&date=${date}`)}><Icon name="plus" size={18} />Add another meal</Button>
        </div>
      ) : <Journal day={day} date={date} />}
    </Page>
  )
}

function SlotCard({ slot, time, day, date }: { slot: Slot; time?: string; day: DayData; date: string }) {
  const nav = useNavigate()
  const meals = day.meals.filter(m => m.slot === slot)
  const skipped = meals.find(m => m.status === 'skipped')
  const real = meals.filter(m => m.status !== 'skipped')
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div><span className="text-[17px] font-bold">{SLOT_LABEL[slot]}</span>{time && <span className="ml-2 text-sm text-ink-400">{fmtHHMM(time)}</span>}</div>
        <button aria-label={`Add ${SLOT_LABEL[slot]}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-leaf-50 text-leaf-700" onClick={() => nav(`/meal/new?slot=${slot}&date=${date}`)}><Icon name="plus" size={20} /></button>
      </div>
      {real.map(m => (
        <button key={m.id} onClick={() => nav(m.status === 'draft' ? `/meal/${m.id}/edit` : `/meal/${m.id}`)} className="mt-3 flex w-full items-center gap-3 text-left">
          <MealThumb mealId={m.id} hasPhoto={m.hasPhoto} className="h-16 w-16 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{m.name || SLOT_LABEL[m.slot]}</div>
            {m.status === 'draft'
              ? <Badge className="bg-amber-100 text-amber-800">Incomplete · tap to finish</Badge>
              : <div className="num text-sm text-ink-500">{fmtTime(m.eaten_at)} · {fmt(m.totals.kcal)} kcal · P {fmt(m.totals.protein_g)} g</div>}
          </div>
          <Icon name="right" size={18} className="text-ink-300" />
        </button>
      ))}
      {!real.length && (skipped ? (
        <div className="mt-2 flex items-center justify-between text-sm text-ink-500"><span>Marked as skipped</span><button className="font-semibold text-leaf-700" onClick={() => remove('meals', skipped.id)}>Undo</button></div>
      ) : (
        <div className="mt-2 flex items-center justify-between text-sm text-ink-400"><span>Unlogged</span><button className="font-semibold text-ink-500" onClick={() => markSkipped(slot, date)}>Mark skipped</button></div>
      ))}
    </Card>
  )
}

function Journal({ day, date }: { day: DayData; date: string }) {
  const nav = useNavigate()
  const meals = day.meals.filter(m => m.status !== 'skipped')
  if (!meals.length) return <Card className="mt-3 text-center text-ink-500">No meals on {fmtDate(date, { day: 'numeric', month: 'long' })} yet.</Card>
  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {meals.map(m => (
        <button key={m.id} onClick={() => nav(m.status === 'draft' ? `/meal/${m.id}/edit` : `/meal/${m.id}`)} className="overflow-hidden rounded-3xl bg-surface text-left shadow-card active:scale-[.99]">
          <MealThumb mealId={m.id} hasPhoto={m.hasPhoto} className="aspect-square w-full" />
          <div className="p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-leaf-700">{SLOT_LABEL[m.slot]}</div>
            <div className="truncate font-semibold">{m.name || 'Meal'}</div>
            <div className="num text-[13px] text-ink-500">{fmtTime(m.eaten_at)} · {fmt(m.totals.kcal)} kcal</div>
          </div>
        </button>
      ))}
    </div>
  )
}
