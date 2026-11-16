import { useEffect, useRef, useState } from 'react'
import type { Exercise, Pose, Prop } from './exercises'

const W = 220, H = 200, FLOOR = 186
const NEAR = 'stroke-leaf-700', FAR = 'stroke-leaf-300'
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a: Pose, b: Pose, t: number): Pose => a.map((v, i) => v + (b[i] - v) * t)
const pt = (p: Pose, i: number): [number, number] => [p[i * 2], p[i * 2 + 1]]
// joint indices
const HEAD = 0, SH = 1, HIP = 2, EA = 3, HA = 4, EB = 5, HB = 6, KA = 7, FA = 8, KB = 9, FB = 10

function Props({ props }: { props?: Prop[] }) {
  return <>{props?.map((p, i) => {
    if (p.t === 'wall') return <g key={i}><rect x={p.x} y={10} width={8} height={FLOOR - 10} rx={2} className="fill-ink-200" /></g>
    if (p.t === 'chair') return <g key={i} className="stroke-ink-300" strokeWidth={5} strokeLinecap="round" fill="none"><path d={`M${p.x} ${p.y - 48}V${FLOOR}M${p.x} ${p.y}H${p.x + p.w}V${FLOOR}`} /></g>
    return <g key={i}><rect x={p.x} y={p.y} width={p.w} height={FLOOR - p.y} rx={5} className="fill-ink-200" /></g>
  })}</>
}

function Body({ p, toes }: { p: Pose; toes?: number }) {
  const L = (a: number, b: number, c: number, cls: string) => { const [x1, y1] = pt(p, a), [x2, y2] = pt(p, b), [x3, y3] = pt(p, c); return <polyline points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`} fill="none" className={cls} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" /> }
  const [hx, hy] = pt(p, HEAD), [sx, sy] = pt(p, SH), [px, py] = pt(p, HIP)
  return (
    <g>
      {toes != null && [FB, FA].map(j => { const [x, y] = pt(p, j); return <line key={j} x1={x} y1={y} x2={x + toes} y2={FLOOR - 1} className={j === FA ? NEAR : FAR} strokeWidth={8} strokeLinecap="round" /> })}
      {L(SH, EB, HB, FAR)}{L(HIP, KB, FB, FAR)}
      <line x1={sx} y1={sy} x2={px} y2={py} className={NEAR} strokeWidth={13} strokeLinecap="round" />
      {L(HIP, KA, FA, NEAR)}{L(SH, EA, HA, NEAR)}
      <circle cx={hx} cy={hy} r={11.5} className="fill-leaf-700" />
    </g>
  )
}

/** Arrows from one pose to the next for the joints that travel furthest. */
function Arrows({ from, to }: { from: Pose; to: Pose }) {
  const cands = [HA, HB, FA, FB, HIP, HEAD, KA, KB].map(j => { const [x1, y1] = pt(from, j), [x2, y2] = pt(to, j); return { x1, y1, x2, y2, d: Math.hypot(x2 - x1, y2 - y1) } }).filter(c => c.d > 14).sort((a, b) => b.d - a.d)
  const chosen: typeof cands = []
  for (const c of cands) { if (chosen.length < 2 && chosen.every(o => Math.hypot(o.x1 - c.x1, o.y1 - c.y1) > 40)) chosen.push(c) }
  return <g>{chosen.map((c, i) => {
    const ux = (c.x2 - c.x1) / c.d, uy = (c.y2 - c.y1) / c.d
    // offset the arrow sideways so it sits beside the limb instead of on top of it
    const ox = -uy * 16, oy = ux * 16
    const x1 = c.x1 + ox + ux * 2, y1 = c.y1 + oy + uy * 2, x2 = c.x2 + ox - ux * 2, y2 = c.y2 + oy - uy * 2
    return <g key={i} className="stroke-amber-400" strokeWidth={3.5} strokeLinecap="round" fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <polyline points={`${x2 - ux * 9 - uy * 6},${y2 - uy * 9 + ux * 6} ${x2},${y2} ${x2 - ux * 9 + uy * 6},${y2 - uy * 9 - ux * 6}`} />
    </g>
  })}</g>
}

export function Still({ ex, frame, arrowTo, className }: { ex: Exercise; frame: number; arrowTo?: number; className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`${ex.name}: ${ex.stages[frame] ?? ''}`}>
      <line x1={8} y1={FLOOR + 5} x2={W - 8} y2={FLOOR + 5} className="stroke-ink-200" strokeWidth={3} strokeLinecap="round" />
      <Props props={ex.props} /><Body p={ex.frames[frame]} toes={ex.toes} />
      {arrowTo != null && <Arrows from={ex.frames[frame]} to={ex.frames[arrowTo]} />}
    </svg>
  )
}

/** Looping demonstration that moves smoothly between the key poses. */
export function Animated({ ex, className, paused }: { ex: Exercise; className?: string; paused?: boolean }) {
  const [pose, setPose] = useState<Pose>(ex.frames[0])
  const raf = useRef(0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (paused || reduce) { setPose(ex.frames[0]); return }
    const seq = ex.loop === 'cycle' ? [...ex.frames, ex.frames[0]] : [...ex.frames, ...[...ex.frames].reverse().slice(1)]
    const move = 850, hold = 350, seg = move + hold, total = (seq.length - 1) * seg
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = Math.max(0, now - t0) % total, i = Math.min(Math.floor(t / seg), seq.length - 2), local = Math.min((t - i * seg) / move, 1)
      setPose(lerp(seq[i], seq[i + 1], ease(local)))
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [ex, paused])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`${ex.name} demonstration`}>
      <line x1={8} y1={FLOOR + 5} x2={W - 8} y2={FLOOR + 5} className="stroke-ink-200" strokeWidth={3} strokeLinecap="round" />
      <Props props={ex.props} /><Body p={pose} toes={ex.toes} />
    </svg>
  )
}
