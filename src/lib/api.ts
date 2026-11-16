import { supabase } from './supabase'

/** Calls the authenticated "api" edge function. AI keys never reach the browser. */
export async function api<T = any>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  if (!navigator.onLine) throw new Error('You are offline. This needs a connection.')
  const { data, error } = await supabase.functions.invoke('api', { body: { action, ...body } })
  if (error) {
    let msg = error.message
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error } catch { /* keep default */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data as T
}
