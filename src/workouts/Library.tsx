import { Link } from 'react-router-dom'
import { Card, Note, Page, SectionTitle } from '../components/ui'
import { EXERCISES, GROUP_LABEL, LEVEL_LABEL, SAFETY_NOTE, type Group } from './exercises'
import { Still } from './Figure'

export default function Library() {
  return (
    <Page title="Exercise library" back subtitle="No equipment, weights or machines">
      {(Object.keys(GROUP_LABEL) as Group[]).map(g => (
        <div key={g}>
          <SectionTitle>{GROUP_LABEL[g]}</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            {EXERCISES.filter(e => e.group === g).map(e => (
              <Link key={e.id} to={`/workouts/exercise/${e.id}`}>
                <Card className="h-full !p-3">
                  <Still ex={e} frame={Math.min(1, e.frames.length - 1)} className="aspect-[11/10] w-full rounded-2xl bg-ink-50" />
                  <div className="mt-2 font-semibold leading-5">{e.name}</div>
                  <div className="text-xs text-ink-500">{LEVEL_LABEL[e.level]} · {e.impact === 'low' ? 'Low-impact' : 'Regular impact'}</div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-5"><Note tone="warn">{SAFETY_NOTE}</Note></div>
    </Page>
  )
}
