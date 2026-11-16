import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { addWater, markSkipped, setReminderStatus } from '../lib/actions'
import { db } from '../lib/db'
import { fmtHHMM, today } from '../lib/dates'
import { Button, Icon, Note, Page } from '../components/ui'

/** Screen a reminder notification opens: log, snooze 10/15, mark completed, or mark skipped. */
export default function Remind() {
  const { reminderId = '', date = today() } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const r = useLiveQuery(async () => (await db.reminders.get(reminderId)) ?? null, [reminderId])
  const [msg, setMsg] = useState('')
  const handled = useRef(false)

  async function snooze(min: number) { await setReminderStatus(reminderId, date, 'snoozed', min); setMsg(`Snoozed. I'll remind you again in ${min} minutes.`); setTimeout(() => nav('/', { replace: true }), 1400) }
  // Notification action buttons (where the platform shows them) land here with ?do=snooze10|snooze15.
  useEffect(() => {
    const act = params.get('do'); if (!r || handled.current || !act) return
    handled.current = true
    if (act === 'snooze10') void snooze(10); else if (act === 'snooze15') void snooze(15)
  }, [r, params]) // eslint-disable-line react-hooks/exhaustive-deps

  if (r === undefined) return null
  if (!r || r.deleted_at) return <Navigate to="/" replace />
  if (r.kind === 'review') return <Navigate to={`/report/${date}`} replace />
  const done = async () => { await setReminderStatus(reminderId, date, 'completed'); nav('/', { replace: true }) }

  return (
    <Page title={r.label} back="/" subtitle={`Reminder · ${fmtHHMM(r.time)}`}>
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-leaf-50 text-leaf-600"><Icon name={r.kind === 'hydration' ? 'drop' : 'bell'} size={36} /></div>
        <p className="text-lg text-ink-700">{r.kind === 'hydration' ? 'Time for some water.' : `Time for ${r.label.toLowerCase()}. Take a photo to log it.`}</p>
      </div>
      {msg && <div className="mb-3"><Note>{msg}</Note></div>}
      <div className="space-y-3">
        {r.kind === 'meal' && <Button block size="lg" onClick={() => nav(`/meal/new?slot=${r.slot}&date=${date}`, { replace: true })}><Icon name="camera" size={20} />Log this meal now</Button>}
        {r.kind === 'hydration' && <div className="grid grid-cols-2 gap-3">
          <Button size="lg" onClick={async () => { await addWater(250, date); await done() }}>+ 250 ml</Button>
          <Button size="lg" onClick={async () => { await addWater(500, date); await done() }}>+ 500 ml</Button>
        </div>}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" size="lg" onClick={() => snooze(10)}>Snooze 10 min</Button>
          <Button variant="outline" size="lg" onClick={() => snooze(15)}>Snooze 15 min</Button>
        </div>
        <Button variant="soft" block size="lg" onClick={done}><Icon name="check" size={20} />Mark as completed</Button>
        {r.kind === 'meal'
          ? <Button variant="ghost" block onClick={async () => { await markSkipped(r.slot!, date); nav('/', { replace: true }) }}>Mark as skipped</Button>
          : <Button variant="ghost" block onClick={async () => { await setReminderStatus(reminderId, date, 'skipped'); nav('/', { replace: true }) }}>Skip this one</Button>}
      </div>
    </Page>
  )
}
