import { useEffect, useState } from 'react'

/** Device-level switches that do not belong in the synced profile. */
const listeners = new Set<() => void>()
export function useFlag(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const read = () => { const v = localStorage.getItem(key); return v == null ? fallback : v === '1' }
  const [, bump] = useState(0)
  useEffect(() => { const l = () => bump(n => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return [read(), (v: boolean) => { localStorage.setItem(key, v ? '1' : '0'); listeners.forEach(l => l()) }]
}
/** Analyse each photo twice and flag where the two estimates disagree. Costs one extra AI call. */
export const useDoubleCheck = () => useFlag('nt_double_check', true)
