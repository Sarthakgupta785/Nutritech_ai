import { Navigate, useParams } from 'react-router-dom'
import { Badge, Card, Note, Page, SectionTitle } from '../components/ui'
import { EX_BY_ID, GROUP_LABEL, LEVEL_LABEL } from './exercises'
import { Animated, Still } from './Figure'

export default function ExerciseDetail() {
  const { id = '' } = useParams()
  const e = EX_BY_ID[id]
  if (!e) return <Navigate to="/workouts/library" replace />
  const n = e.frames.length
  const Block = ({ title, children }: { title: string; children: React.ReactNode }) => <><SectionTitle>{title}</SectionTitle><Card className="text-[16px] leading-6 text-ink-700">{children}</Card></>
  return (
    <Page title={e.name} back subtitle={GROUP_LABEL[e.group]}>
      <Card className="!p-3">
        <Animated ex={e} className="mx-auto aspect-[11/10] w-full max-w-sm rounded-2xl bg-ink-50" />
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <Badge className="bg-leaf-100 text-leaf-800">{LEVEL_LABEL[e.level]}</Badge>
          <Badge className="bg-ink-100 text-ink-700">{e.impact === 'low' ? 'Low-impact' : 'Regular impact'}</Badge>
          <Badge className="bg-ink-100 text-ink-700">No equipment</Badge>
        </div>
      </Card>

      <SectionTitle>Movement stages</SectionTitle>
      <div className={`grid gap-2 ${n > 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
        {e.frames.map((_, i) => (
          <div key={i} className="rounded-2xl bg-surface p-2 shadow-card">
            <Still ex={e} frame={i} arrowTo={e.loop === 'cycle' ? (i + 1) % n : i + 1 < n ? i + 1 : i - 1} className="aspect-[11/10] w-full rounded-xl bg-ink-50" />
            <div className="mt-1.5 px-1 text-[13px] font-medium leading-4 text-ink-700"><span className="text-leaf-700">{i + 1}.</span> {e.stages[i]}</div>
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-ink-400">Orange arrows show the direction of the next movement. Dark limbs are nearest to you; light limbs are on the far side.</p>

      <Block title="Suggested sets and reps"><b>{e.suggested}</b>. Rest 30–60 seconds between sets.</Block>
      <Block title="Target muscles">{e.muscles.join(', ')}</Block>
      <Block title="Starting position">{e.start}</Block>
      <Block title="Step by step"><ol className="list-decimal space-y-1.5 pl-5">{e.steps.map(s => <li key={s}>{s}</li>)}</ol></Block>
      <Block title="Posture">{e.posture}</Block>
      <Block title="Breathing">{e.breathing}</Block>
      <Block title="Common mistakes"><ul className="list-disc space-y-1.5 pl-5">{e.mistakes.map(s => <li key={s}>{s}</li>)}</ul></Block>
      <Block title="Easier version">{e.modification}</Block>
      <SectionTitle>Safety</SectionTitle>
      <Note tone="warn">{e.safety}{e.caution.length > 0 && <> May not suit you if you have a <b>{e.caution.join(', ')}</b> injury or problem; skip it or check with a physiotherapist.</>} Stop if you feel pain, dizziness or unusual discomfort.</Note>
    </Page>
  )
}
