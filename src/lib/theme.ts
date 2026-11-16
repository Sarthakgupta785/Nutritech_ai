import { useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'
const KEY = 'nt_theme'
const listeners = new Set<() => void>()
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export const getTheme = (): Theme => {
  const t = localStorage.getItem(KEY)
  return t === 'light' || t === 'dark' ? t : 'system'
}
export function isDark(t: Theme = getTheme()): boolean {
  return t === 'dark' || (t === 'system' && media().matches)
}
/** Applies the theme to <html>, including the status-bar colour iOS reads from the meta tag. */
export function applyTheme(t: Theme = getTheme()) {
  const dark = isDark(t)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121513' : '#F5F7F5')
  return dark
}
export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t)
  applyTheme(t)
  listeners.forEach(l => l())
}
export function useTheme(): { theme: Theme; dark: boolean; set: (t: Theme) => void } {
  const [, bump] = useState(0)
  useEffect(() => {
    const onChange = () => { applyTheme(); bump(n => n + 1) }
    listeners.add(onChange)
    const m = media()
    m.addEventListener('change', onChange)
    return () => { listeners.delete(onChange); m.removeEventListener('change', onChange) }
  }, [])
  return { theme: getTheme(), dark: isDark(), set: setTheme }
}
/** Reads a palette variable as a usable colour, for canvas and chart libraries that need a literal. */
export function cssColor(name: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `rgb(${v}${alpha < 1 ? ` / ${alpha}` : ''})` : '#888'
}
export function useChartTheme() {
  const { dark } = useTheme()
  return {
    dark,
    grid: cssColor('--ink-200'),
    tick: { fontSize: 11, fill: cssColor('--ink-400') },
    tooltip: { backgroundColor: cssColor('--surface'), color: cssColor('--ink-900'), borderRadius: 14, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.18)', fontSize: 13 },
    cursor: cssColor('--leaf-500', 0.12),
    track: cssColor('--ink-100'),
    leaf: cssColor('--leaf-500'), leafDeep: cssColor('--leaf-600'), leafSoft: cssColor('--leaf-400'),
    sky: cssColor('--sky-400'), skyDeep: cssColor('--sky-600'), amber: cssColor('--amber-400'), violet: cssColor('--violet-400'), muted: cssColor('--ink-300'),
  }
}
