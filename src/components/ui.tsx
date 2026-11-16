import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

const P: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  log: 'M7 3v8m-3-8v5a3 3 0 0 0 6 0V3M7 11v10M17 3c-2 0-3.5 2.5-3.5 6S15 14 17 14v7m0-18v11',
  chart: 'M4 20V10m6 10V4m6 16v-8m4 8H2',
  chat: 'M21 12a8 8 0 0 1-8 8H4l2.2-3.3A8 8 0 1 1 21 12zM8.5 11h7M8.5 14h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  camera: 'M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  image: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm-1 12 5-5 4 4 3-3 6 6M15.5 9.5h.01',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', down: 'M5 9l7 7 7-7',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v6m4-6v6',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zm4 4a2 2 0 0 0 4 0',
  check: 'M5 12.500l4.5 4.500L19 7', x: 'M6 6l12 12M18 6 6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zm9-13 4 4',
  dumbbell: 'M3 10v4m3-7v10m12-10v10m3-7v4M6 12h12',
  sparkle: 'M12 3l1.8 5.200L19 10l-5.2 1.800L12 17l-1.8-5.200L5 10l5.2-1.800zM19 16l.700 2.300L22 19l-2.3.700L19 22l-.700-2.300L16 19l2.3-.700z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-14v5l3 2',
  copy: 'M9 9h10v11H9zM5 15V4h10', star: 'M12 3.500l2.6 5.4 5.9.800-4.3 4.1 1 5.900L12 16.9 6.8 19.700l1-5.900L3.5 9.700l5.9-.800z',
  send: 'M4 12l16-8-6 16-3-7z', play: 'M7 4l13 8-13 8z', pause: 'M7 4v16M17 4v16', skip: 'M5 4l10 8-10 8zM19 4v16',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-10v6m0-9.500v.01', warn: 'M12 3 2 20h20zm0 6v5m0 3v.01',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.700M20 4v7h-7', cloud: 'M7 18a4 4 0 0 1-.500-8A6 6 0 0 1 18 9.5 4.3 4.3 0 0 1 17.5 18z', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.3-4.3',
  flame: 'M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.500 2 1.5 2.5 1.5 2.500C10 8 11 5 12 3z',
}
export function Icon({ name, size = 22, className, fill }: { name: keyof typeof P | string; size?: number; className?: string; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={P[name] ?? ''} />
    </svg>
  )
}

export const Card = ({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) => (
  <div onClick={onClick} className={cx('rounded-3xl p-4 shadow-card', !/(^|\s)!?bg-/.test(className ?? '') && 'bg-white', onClick && 'cursor-pointer active:scale-[.99] transition-transform', className)}>{children}</div>
)

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger' | 'outline'; size?: 'sm' | 'md' | 'lg'; block?: boolean }
export function Button({ variant = 'primary', size = 'md', block, className, children, ...rest }: BtnProps) {
  const v = { primary: 'bg-leaf-600 text-white active:bg-leaf-700 disabled:bg-ink-200 disabled:text-ink-400', soft: 'bg-leaf-50 text-leaf-800 active:bg-leaf-100', ghost: 'text-ink-700 active:bg-ink-100',
    danger: 'bg-red-50 text-red-700 active:bg-red-100', outline: 'border border-ink-200 bg-white text-ink-900 active:bg-ink-50' }[variant]
  const s = { sm: 'h-9 px-3 text-sm rounded-xl', md: 'h-11 px-4 text-[15px] rounded-2xl', lg: 'h-14 px-5 text-[17px] rounded-2xl' }[size]
  return <button {...rest} className={cx('inline-flex items-center justify-center gap-2 font-semibold transition-colors select-none disabled:cursor-not-allowed', v, s, block && 'w-full', className)}>{children}</button>
}

export function Ring({ value, max, size = 180, stroke = 14, color = '#34A56B', track = '#E6EFE9', children }: { value: number; max: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  const frac = max > 0 ? Math.min(value / max, 1) : 0
  const over = max > 0 && value > max
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={over ? '#E08A2B' : color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
export function Bar({ value, max, color = 'bg-leaf-500' }: { value: number; max: number; color?: string }) {
  const frac = max > 0 ? Math.min(value / max, 1) : 0
  return <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100"><div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${frac * 100}%` }} /></div>
}

export function Sheet({ open, onClose, title, children, full }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; full?: boolean }) {
  useEffect(() => { if (!open) return; const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev } }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={cx('sheet-up relative w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-ink-50 px-4 pt-3', full ? 'h-[92vh]' : 'max-h-[88vh]')} style={{ paddingBottom: 'calc(var(--safe-b) + 20px)' }}>
        <div className="mx-auto mb-3 w-10 rounded-full bg-ink-200" style={{ height: 5 }} />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-ink-700"><Icon name="x" size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-2xl bg-ink-100 p-1">
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('h-9 flex-1 rounded-xl text-sm font-semibold transition-colors', value === o.value ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>{o.label}</button>
      ))}
    </div>
  )
}
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cx('relative h-8 w-[52px] shrink-0 rounded-full transition-colors', on ? 'bg-leaf-500' : 'bg-ink-200')}>
      <span className={cx('absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all', on ? 'left-[24px]' : 'left-1')} />
    </button>
  )
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[13px] font-medium text-ink-500">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}</label>
}
export const inputCls = 'h-12 w-full rounded-2xl border border-ink-200 bg-white px-4 text-ink-900 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-100'
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />
export function NumInput({ value, onChange, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number; onChange: (n: number) => void }) {
  return <input {...rest} type="number" inputMode="decimal" value={Number.isFinite(value) ? value : ''} onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} onFocus={e => e.target.select()} className={cx(inputCls, className)} />
}
export const Badge = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cx('inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-semibold', className)}>{children}</span>
export const Spinner = ({ className }: { className?: string }) => <span className={cx('inline-block h-5 w-5 animate-spin rounded-full border-2 border-leaf-500 border-t-transparent', className)} />

export function Page({ title, back, right, children, subtitle }: { title?: string; back?: boolean | string; right?: ReactNode; children: ReactNode; subtitle?: string }) {
  const nav = useNavigate()
  return (
    <div className="mx-auto min-h-full w-full max-w-lg px-4 pb-32" style={{ paddingTop: 'calc(var(--safe-t) + 14px)' }}>
      {(title || back) && (
        <header className="mb-4 flex items-center gap-2">
          {back && <button aria-label="Back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-700 shadow-card"><Icon name="left" size={20} /></button>}
          <div className="min-w-0 flex-1">
            {subtitle && <div className="text-[13px] font-medium text-ink-500">{subtitle}</div>}
            <h1 className={cx('truncate font-bold tracking-tight', back ? 'text-2xl' : 'text-[32px] leading-9')}>{title}</h1>
          </div>
          {right}
        </header>
      )}
      {children}
    </div>
  )
}
export const SectionTitle = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="mb-2 mt-6 flex items-end justify-between px-1"><h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-500">{children}</h2>{right}</div>
)
export const Note = ({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' }) => (
  <div className={cx('flex gap-2 rounded-2xl p-3 text-[13px] leading-5', tone === 'info' && 'bg-leaf-50 text-leaf-900', tone === 'warn' && 'bg-amber-50 text-amber-900', tone === 'danger' && 'bg-red-50 text-red-800')}>
    <Icon name={tone === 'info' ? 'info' : 'warn'} size={18} className="mt-px shrink-0" /><div>{children}</div>
  </div>
)
export const fmt = (n: number, d = 0) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '0')
