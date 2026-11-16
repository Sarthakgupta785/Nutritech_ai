import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { configured, supabase } from './lib/supabase'
import { clearLocal, patch, setUid, sync } from './lib/db'
import { deviceTz } from './lib/dates'
import { ensureWeighInReminder } from './lib/actions'
import { isStandalone, refreshSubscription } from './lib/push'
import { useProfile, usePrefs } from './lib/hooks'
import { Icon, Spinner, cx } from './components/ui'
import Auth from './pages/Auth'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Home from './pages/Home'
import FoodLog from './pages/FoodLog'
import MealNew from './pages/MealNew'
import MealEditor from './pages/MealEditor'
import MealDetail from './pages/MealDetail'
import Analytics from './pages/Analytics'
import Coach from './pages/Coach'
import Profile from './pages/Profile'
import Report from './pages/Report'
import Remind from './pages/Remind'
import Workouts from './workouts/Workouts'
import Library from './workouts/Library'
import ExerciseDetail from './workouts/ExerciseDetail'
import Session_ from './workouts/Session'
import ManualLog from './workouts/ManualLog'

const TABS = [
  { to: '/', label: 'Home', icon: 'home' }, { to: '/log', label: 'Food Log', icon: 'log' }, { to: '/analytics', label: 'Analytics', icon: 'chart' },
  { to: '/coach', label: 'AI Coach', icon: 'chat' }, { to: '/profile', label: 'Profile', icon: 'user' },
]
const HIDE_TABS = /^\/(meal|remind|workouts\/session)/

function TabBar() {
  const { pathname } = useLocation()
  if (HIDE_TABS.test(pathname)) return null
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-surface/90 backdrop-blur-xl" style={{ paddingBottom: 'var(--safe-b)' }}>
      <div className="mx-auto flex max-w-lg">
        {TABS.map(t => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => cx('flex h-[58px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold', isActive ? 'text-leaf-600' : 'text-ink-400')}>
            <Icon name={t.icon} size={24} />{t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function Shell() {
  const profile = useProfile()
  const prefs = usePrefs()
  const nav = useNavigate()
  const [ready, setReady] = useState(false)

  useEffect(() => { void sync().finally(() => { setReady(true); void ensureWeighInReminder() }); void refreshSubscription() }, [])
  // Notification taps arrive from the service worker while the app is already open.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const h = (e: MessageEvent) => { if (e.data?.type === 'navigate' && typeof e.data.url === 'string') nav(e.data.url) }
    navigator.serviceWorker.addEventListener('message', h)
    return () => navigator.serviceWorker.removeEventListener('message', h)
  }, [nav])
  // Keep the server's idea of the user's timezone current (reminders fire in local time, also when travelling).
  useEffect(() => { if (profile && profile.timezone !== deviceTz()) void patch('profiles', profile.id, { timezone: deviceTz() }) }, [profile])

  if (!ready && !profile) return <Splash />
  if (!profile?.onboarded) return <Onboarding />
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/log" element={<FoodLog />} />
        <Route path="/meal/new" element={<MealNew />} />
        <Route path="/meal/:id/edit" element={<MealEditor />} />
        <Route path="/meal/:id" element={<MealDetail />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/report/:date" element={<Report />} />
        <Route path="/coach" element={<Coach />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/remind/:reminderId/:date" element={<Remind />} />
        {prefs?.workouts_enabled !== false && <>
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/workouts/library" element={<Library />} />
          <Route path="/workouts/exercise/:id" element={<ExerciseDetail />} />
          <Route path="/workouts/session" element={<Session_ />} />
          <Route path="/workouts/log" element={<ManualLog />} />
        </>}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar />
    </>
  )
}

const Splash = () => (
  <div className="flex h-full flex-col items-center justify-center gap-4">
    <img src="/icons/icon-192.png" alt="" className="h-20 w-20 rounded-[22px] shadow-card" />
    <Spinner />
  </div>
)

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setUid(data.session?.user.id ?? ''); setSession(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setUid(s?.user.id ?? '')
      setSession(s)
      if (event === 'SIGNED_OUT') void clearLocal()
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!configured) return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-3 p-6">
      <h1 className="text-2xl font-bold">Almost there</h1>
      <p className="text-ink-700">This build has no Supabase connection yet. Set <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code> and <code>VITE_VAPID_PUBLIC_KEY</code> in your hosting provider's environment variables and redeploy. The README has the step-by-step.</p>
    </div>
  )
  if (session === undefined) return <Splash />
  // Installed app: straight to sign-in. Someone visiting the address in a browser gets the pitch first.
  if (!session) return isStandalone() ? <Auth /> : <Landing />
  return <Shell key={session.user.id} />
}
