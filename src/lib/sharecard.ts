import { fmtDate } from './dates'

export interface WeekCardData {
  from: string; to: string; daysLogged: number
  avgKcal: number; targetKcal: number; avgProtein: number; targetProtein: number
  consistency: number | null; weightChangeKg: number | null; weightUnit: string; weightChangeDisplay: number | null
  dailyKcal: (number | null)[]; dayLabels: string[]
}

const BG = '#F5F7F5', CARD = '#FFFFFF', GREEN = '#268556', GREEN_SOFT = '#86D3A7', INK = '#111613', MUTED = '#667069', TRACK = '#E6EFE9'
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif'

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath()
}

/** Renders the week as a portrait PNG sized for sharing to a phone's photo apps. */
export async function renderWeekCard(d: WeekCardData): Promise<Blob> {
  const W = 1080, H = 1350
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const c = cv.getContext('2d')!
  c.fillStyle = BG; c.fillRect(0, 0, W, H)

  // Header band
  const g = c.createLinearGradient(0, 0, W, 420)
  g.addColorStop(0, '#34A56B'); g.addColorStop(1, '#1D5439')
  c.fillStyle = g; c.fillRect(0, 0, W, 420)
  c.textAlign = 'left'
  c.fillStyle = 'rgba(255,255,255,.75)'; c.font = `600 30px ${FONT}`
  c.fillText('NUTRITRACK AI · MY WEEK', 80, 120)
  c.fillStyle = '#fff'; c.font = `700 72px ${FONT}`
  c.fillText(`${fmtDate(d.from, { day: 'numeric', month: 'short' })} – ${fmtDate(d.to, { day: 'numeric', month: 'short' })}`, 80, 220)
  c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `500 34px ${FONT}`
  c.fillText(`${d.daysLogged} of 7 days logged`, 80, 285)

  // Stat tiles
  const tiles: [string, string, string][] = [
    [d.daysLogged ? String(Math.round(d.avgKcal)) : '–', 'avg kcal / day', `target ${Math.round(d.targetKcal)}`],
    [d.daysLogged ? `${Math.round(d.avgProtein)} g` : '–', 'avg protein / day', `target ${Math.round(d.targetProtein)} g`],
    [d.consistency == null ? '–' : `${Math.round(d.consistency * 100)}%`, 'meal consistency', 'scheduled meals logged'],
    [d.weightChangeDisplay == null ? '–' : `${d.weightChangeDisplay > 0 ? '+' : ''}${d.weightChangeDisplay.toFixed(1)}`, `weight change (${d.weightUnit})`, '7-day average'],
  ]
  const tw = (W - 160 - 32) / 2, th = 210
  tiles.forEach((t, i) => {
    const x = 80 + (i % 2) * (tw + 32), y = 480 + Math.floor(i / 2) * (th + 32)
    c.fillStyle = CARD; roundRect(c, x, y, tw, th, 36); c.fill()
    c.fillStyle = INK; c.font = `700 66px ${FONT}`; c.fillText(t[0], x + 40, y + 100)
    c.fillStyle = MUTED; c.font = `500 28px ${FONT}`; c.fillText(t[1], x + 40, y + 145)
    c.fillStyle = '#8C958F'; c.font = `400 24px ${FONT}`; c.fillText(t[2], x + 40, y + 182)
  })

  // Daily calories
  const cx = 80, cy = 960, cw = W - 160, ch = 250
  c.fillStyle = CARD; roundRect(c, cx, cy, cw, ch, 36); c.fill()
  c.fillStyle = MUTED; c.font = `600 26px ${FONT}`; c.fillText('CALORIES BY DAY', cx + 40, cy + 54)
  const vals = d.dailyKcal.map(v => v ?? 0)
  const peak = Math.max(d.targetKcal, ...vals, 1)
  const bw = 48, gap = (cw - 80 - bw * 7) / 6, base = cy + ch - 56
  const top = cy + 80, span = base - top
  c.strokeStyle = TRACK; c.lineWidth = 3; c.setLineDash([10, 8])
  const ty = base - (d.targetKcal / peak) * span
  c.beginPath(); c.moveTo(cx + 40, ty); c.lineTo(cx + cw - 40, ty); c.stroke(); c.setLineDash([])
  d.dailyKcal.forEach((v, i) => {
    const x = cx + 40 + i * (bw + gap)
    const h = Math.max(((v ?? 0) / peak) * span, 4)
    c.fillStyle = v == null ? TRACK : v > d.targetKcal * 1.05 ? '#E0A32B' : GREEN_SOFT
    roundRect(c, x, base - h, bw, h, 14); c.fill()
    c.fillStyle = MUTED; c.font = `500 22px ${FONT}`; c.textAlign = 'center'
    c.fillText(d.dayLabels[i] ?? '', x + bw / 2, base + 34)
    c.textAlign = 'left'
  })

  c.fillStyle = '#8C958F'; c.font = `400 24px ${FONT}`; c.textAlign = 'center'
  c.fillText('Estimates from confirmed entries · not medical advice', W / 2, H - 56)

  return new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Could not render the card'))), 'image/png'))
}

/** Share sheet where the browser supports it, otherwise a download. */
export async function shareCard(blob: Blob, filename = 'nutritrack-week.png'): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'My NutriTrack week' }); return 'shared' }
    catch (e: any) { if (e?.name === 'AbortError') return 'shared' }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'downloaded'
}
