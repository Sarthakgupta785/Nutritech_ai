import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Field, Input, Note } from '../components/ui'

export default function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.session) setMsg({ tone: 'info', text: 'Check your email to confirm your account, then sign in here.' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: any) { setMsg({ tone: 'danger', text: err?.message ?? 'Something went wrong' }) } finally { setBusy(false) }
  }
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-10">
      <img src="/icons/icon-192.png" alt="" className="mb-6 h-20 w-20 rounded-[22px] shadow-card" />
      <h1 className="text-[34px] font-bold leading-10 tracking-tight">NutriTrack AI</h1>
      <p className="mb-8 mt-1 text-ink-500">Your personal nutrition and fat-loss assistant.</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Password" hint={mode === 'up' ? 'At least 8 characters' : undefined}><Input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        <Button block size="lg" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</Button>
      </form>
      <button className="mt-5 text-center text-[15px] font-semibold text-leaf-700" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
        {mode === 'in' ? 'First time? Create your account' : 'Already have an account? Sign in'}
      </button>
    </div>
  )
}
