import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { alive, db, newId, put, remove, sync } from '../lib/db'
import { useSyncState } from '../lib/hooks'
import { Icon, Note, Spinner, cx } from '../components/ui'

const STARTERS = ['How many calories do I have remaining?', 'What should I eat for dinner?', 'Am I getting enough protein?', "How can I improve tomorrow's diet?", 'Can I eat chicken fried rice today?', 'What should I eat with only 400 calories left?']

export default function Coach() {
  const messages = useLiveQuery(async () => alive(await db.coach_messages.orderBy('created_at').toArray()), []) ?? []
  const { online } = useSyncState()
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages.length, busy])

  async function send(content: string) {
    content = content.trim(); if (!content || busy) return
    setText(''); setErr(''); setBusy(true)
    await put('coach_messages', { id: newId(), role: 'user', content, created_at: new Date().toISOString() })
    try {
      await sync() // make sure the coach sees meals logged seconds ago
      const history = [...messages.slice(-12).map(m => ({ role: m.role, content: m.content })), { role: 'user', content }]
      const { reply } = await api<{ reply: string }>('coach', { messages: history })
      await put('coach_messages', { id: newId(), role: 'assistant', content: reply, created_at: new Date().toISOString() })
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  async function clear() { if (window.confirm('Clear this conversation?')) for (const m of messages) await remove('coach_messages', m.id) }

  return (
    <div className="mx-auto flex h-full w-full max-w-lg flex-col" style={{ paddingTop: 'calc(var(--safe-t) + 14px)' }}>
      <header className="flex items-center justify-between px-4 pb-3">
        <div><h1 className="text-[32px] font-bold leading-9 tracking-tight">AI Coach</h1><p className="text-[13px] text-ink-500">Answers from your own targets and food log</p></div>
        {messages.length > 0 && <button className="text-sm font-semibold text-ink-500" onClick={clear}>Clear</button>}
      </header>
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {!messages.length && (
          <div className="space-y-2 pt-2">
            <div className="rounded-3xl bg-white p-4 text-ink-700 shadow-card">Ask me anything about your day. I can see your profile, targets, preferences, confirmed meals and weekly progress.</div>
            {STARTERS.map(s => <button key={s} onClick={() => send(s)} className="block w-full rounded-2xl bg-leaf-50 px-4 py-3 text-left text-[15px] font-medium text-leaf-900 active:bg-leaf-100">{s}</button>)}
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-2.5 text-[16px] leading-6', m.role === 'user' ? 'rounded-br-lg bg-leaf-600 text-white' : 'rounded-bl-lg bg-white text-ink-900 shadow-card')}>{m.content}</div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="rounded-3xl rounded-bl-lg bg-white px-4 py-3 shadow-card"><Spinner /></div></div>}
        {err && <Note tone="danger">{err}</Note>}
        {!online && <Note tone="warn">You are offline. The coach needs a connection; your food log still works.</Note>}
        <div ref={end} />
      </div>
      <form onSubmit={e => { e.preventDefault(); void send(text) }} className="border-t border-ink-100 bg-white/90 px-4 pt-2.5 backdrop-blur-xl" style={{ paddingBottom: 'calc(var(--safe-b) + 68px)' }}>
        <div className="flex items-end gap-2">
          <textarea rows={1} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text) } }} placeholder="Ask your coach…" className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-ink-200 bg-white px-4 py-2.5 outline-none focus:border-leaf-500" />
          <button aria-label="Send" disabled={!text.trim() || busy || !online} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-leaf-600 text-white disabled:bg-ink-200"><Icon name="send" size={20} /></button>
        </div>
      </form>
    </div>
  )
}
