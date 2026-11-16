import { supabase, VAPID_PUBLIC_KEY } from './supabase'
import { getUid } from './db'

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export type PushStatus = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on' | 'not-configured'
export async function pushStatus(): Promise<PushStatus> {
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

const keyBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0))
const b64u = (b: ArrayBuffer | null) => (b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '')

/** Must be called directly from a tap: iOS only shows the permission prompt in response to a user gesture. */
export async function enablePush(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted. You can change this in iPhone Settings → Notifications → NutriTrack.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  await saveSubscription(sub)
}
async function saveSubscription(sub: PushSubscription) {
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: getUid(), endpoint: sub.endpoint, p256dh: b64u(sub.getKey('p256dh')), auth: b64u(sub.getKey('auth')), user_agent: navigator.userAgent.slice(0, 200), deleted_at: null },
    { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}
/** iOS can silently rotate subscriptions; re-save on every launch so the server always has the live one. */
export async function refreshSubscription() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted' || !VAPID_PUBLIC_KEY || !navigator.onLine) return
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
    await saveSubscription(sub)
  } catch { /* retried next launch */ }
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
}
