import { useRef } from 'react'
import { isIOS } from '../lib/push'
import { Card, Icon, cx } from '../components/ui'
import Auth from './Auth'

const STEPS: [string, string, string][] = [
  ['camera', 'Photograph your meal', 'AI identifies each food and estimates the portions. You correct anything it gets wrong — nothing counts until you confirm it.'],
  ['bell', 'Get reminded, not nagged', 'Meal and hydration reminders arrive as real notifications. Snooze them, skip them, or change every time.'],
  ['sparkle', 'Read the day back', 'A nightly report on what went well and three specific things to try tomorrow, written from your own records.'],
]
const FEATURES = [
  'Works offline — log meals with no signal, syncs when you are back',
  'Scan a packaged food label instead of guessing',
  'An AI coach that reads your actual targets and history',
  'Weight trends from 7-day averages, never single-day noise',
  'Optional equipment-free home workouts',
  'Your data stays in your own database',
]

export default function Landing() {
  const authRef = useRef<HTMLDivElement>(null)
  const toAuth = () => authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="min-h-full bg-ink-50">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5" style={{ paddingTop: 'calc(var(--safe-t) + 20px)' }}>
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-[10px]" />
          <span className="text-[17px] font-bold tracking-tight">NutriTrack AI</span>
        </div>
        <button onClick={toAuth} className="text-[15px] font-semibold text-leaf-700">Sign in</button>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-6 pt-8 text-center">
        <h1 className="text-[40px] font-bold leading-[1.1] tracking-tight sm:text-[52px]">
          Photograph your food.<br /><span className="text-leaf-600">Let the numbers follow.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-7 text-ink-500">
          A personal nutrition assistant for fat loss. It reminds you to eat, reads your meals from a photo,
          and tells you each night what to change tomorrow — from your records, not generic advice.
        </p>
        <button onClick={toAuth} className="mt-7 h-14 rounded-2xl bg-leaf-600 px-8 text-[17px] font-semibold text-white shadow-card active:bg-leaf-700">
          Get started
        </button>
        <p className="mt-3 text-[13px] text-ink-400">{isIOS() ? 'Add it to your Home Screen for notifications.' : 'Installs to your phone — no App Store needed.'}</p>
      </section>

      <section className="mx-auto flex max-w-3xl justify-center gap-4 px-6 py-8">
        {['dashboard', 'coach'].map((n, i) => (
          <img key={n} src={`/screens/${n}.png`} alt={n === 'dashboard' ? 'Daily dashboard' : 'AI coach'} loading="lazy"
            className={cx('w-1/2 max-w-[260px] rounded-2xl border border-ink-200 shadow-card', i === 1 && 'mt-8')} />
        ))}
      </section>

      <section className="mx-auto max-w-3xl space-y-3 px-6 py-6">
        {STEPS.map(([icon, title, body], i) => (
          <Card key={title} className="flex gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-leaf-50 text-leaf-700"><Icon name={icon} size={24} /></div>
            <div>
              <div className="text-[13px] font-semibold uppercase tracking-wide text-ink-400">Step {i + 1}</div>
              <div className="text-[18px] font-bold">{title}</div>
              <p className="mt-1 leading-6 text-ink-500">{body}</p>
            </div>
          </Card>
        ))}
      </section>

      <section className="mx-auto max-w-3xl px-6 py-6">
        <Card>
          <ul className="space-y-2.5">
            {FEATURES.map(f => (
              <li key={f} className="flex gap-2.5 text-[15px] leading-6 text-ink-700">
                <Icon name="check" size={18} className="mt-1 shrink-0 text-leaf-600" />{f}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section ref={authRef} className="mx-auto max-w-md scroll-mt-4 px-6 py-10">
        <h2 className="mb-6 text-center text-[26px] font-bold tracking-tight">Create your account</h2>
        <Auth compact />
      </section>

      <footer className="px-6 pb-10 text-center text-[12px] leading-5 text-ink-400" style={{ paddingBottom: 'calc(var(--safe-b) + 40px)' }}>
        NutriTrack AI gives estimates and general guidance.<br />It is not a medical device and does not replace a doctor or dietitian.
      </footer>
    </div>
  )
}
