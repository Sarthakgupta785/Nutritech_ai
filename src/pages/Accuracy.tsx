import { Link } from 'react-router-dom'
import { useAccuracy } from '../lib/hooks'
import { Badge, Card, Icon, Note, Page, SectionTitle, cx, fmt } from '../components/ui'

/** How far the AI's photo estimates sit from what you actually confirmed. */
export default function Accuracy() {
  const r = useAccuracy()
  const bias = r.medianBiasPct

  if (!r.meals) return (
    <Page title="AI accuracy" back subtitle="How close the estimates are">
      <Card>
        <p className="leading-6 text-ink-700">Nothing to compare yet. Every time you photograph a meal and correct the amounts before saving, the difference is recorded here.</p>
        <p className="mt-2 leading-6 text-ink-500">Log a few photo meals and this page will show how far off the estimates run, and for which foods.</p>
      </Card>
      <Link to="/log" className="mt-3 block text-center text-[15px] font-semibold text-leaf-700">Go to the food log</Link>
    </Page>
  )

  const verdict = bias == null ? 'You have not changed any portion yet, so there is nothing to learn from.'
    : bias > 0 ? `When it is wrong it usually under-estimates, by about ${bias}%.`
    : `When it is wrong it usually over-estimates, by about ${Math.abs(bias)}%.`

  return (
    <Page title="AI accuracy" back subtitle={`${r.meals} photo meals compared`}>
      <Card>
        <div className="text-[19px] font-semibold leading-7">
          You accepted {r.accepted} of {r.pairs.length} portions as estimated{r.medianCorrectionPct != null && <>, and changed {r.corrected} by a median of {r.medianCorrectionPct}%</>}.
        </div>
        <p className="mt-1.5 leading-6 text-ink-500">{verdict} This is about amounts only, not whether the food was identified correctly.</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{Math.round((r.accepted / Math.max(r.pairs.length, 1)) * 100)}%</div><div className="text-xs text-ink-500">Accepted as-is</div></div>
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{r.medianCorrectionPct == null ? '–' : `${r.medianCorrectionPct}%`}</div><div className="text-xs text-ink-500">Median correction</div></div>
          <div className="rounded-2xl bg-ink-50 py-2"><div className="num text-lg font-bold">{r.pairs.length}</div><div className="text-xs text-ink-500">Items compared</div></div>
        </div>
        <p className="mt-2 text-[12px] leading-4 text-ink-400">An untouched portion is only weak evidence the estimate was right — it may simply not have been checked. The foods below are the reliable signal.</p>
      </Card>

      <SectionTitle>By food</SectionTitle>
      <div className="divide-y divide-ink-100 overflow-hidden rounded-3xl bg-surface shadow-card">
        {r.foods.map(f => {
          const off = Math.round((f.factor - 1) * 100)
          const good = Math.abs(off) < 10
          return (
            <div key={f.key} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{f.name}</span>
                <Badge className={cx('shrink-0', good ? 'bg-leaf-100 text-leaf-800' : Math.abs(off) < 30 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700')}>
                  {good ? 'close' : `${off > 0 ? '+' : ''}${off}%`}
                </Badge>
              </div>
              <div className="num mt-0.5 text-[13px] text-ink-500">
                AI says {fmt(f.medianAi)} g → you log {fmt(f.medianConfirmed)} g · {f.n} time{f.n === 1 ? '' : 's'}
              </div>
            </div>
          )
        })}
        {!r.foods.length && <div className="p-4 text-sm text-ink-500">No food has been corrected more than once yet.</div>}
      </div>

      {(r.addedByUser > 0 || r.removedByUser > 0) && (
        <>
          <SectionTitle>Identification</SectionTitle>
          <Card className="space-y-1.5 text-[15px] leading-6 text-ink-700">
            <div><b className="num">{r.addedByUser}</b> food{r.addedByUser === 1 ? '' : 's'} you added that the AI did not spot.</div>
            <div><b className="num">{r.removedByUser}</b> it listed that you removed.</div>
          </Card>
        </>
      )}

      <div className="mt-4">
        <Note>
          Foods you have corrected at least twice are now sent with each new photo — "this person's rice servings have been 180 g" — so the estimates anchor on your portions instead of guessing from scratch. The numbers here should drift toward zero as that takes effect.
        </Note>
      </div>
      <p className="mt-3 text-center text-[11px] leading-4 text-ink-400">
        A single photo cannot carry depth, so around 20% error on mixed dishes is the realistic floor. Weighing your most common foods once is the only way past it.
      </p>
    </Page>
  )
}
