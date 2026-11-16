export const deviceTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Calendar date (YYYY-MM-DD) of an instant in a timezone. All day-bucketing uses this. */
export function localDate(d: Date = new Date(), tz: string = deviceTz()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export const today = () => localDate()
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
export function lastNDays(end: string, n: number): string[] { return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1)) }
/** Monday of the week containing date. */
export function weekStart(date: string): string {
  const d = new Date(date + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; return addDays(date, -dow)
}
export function fmtDate(date: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'))
}
export const fmtShort = (date: string) => fmtDate(date, { weekday: 'short' })
export function fmtTime(iso: string): string { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) }
export function fmtHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d)
}
export function nowHHMM(): string { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
/** value for <input type="datetime-local"> from an ISO instant, in device time */
export function toLocalInput(iso: string): string {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
