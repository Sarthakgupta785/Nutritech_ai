/** Downscale and re-encode a camera/gallery image so uploads and AI analysis stay small and fast. */
export async function compressImage(file: Blob, max = 1280, quality = 0.82): Promise<Blob> {
  const bitmap = await loadBitmap(file)
  const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * ratio), h = Math.round(bitmap.height * ratio)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap as CanvasImageSource, 0, 0, w, h)
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/jpeg', quality))
}
async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { /* fall through */ } }
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unsupported image')) }
    img.src = url
  })
}
/**
 * The copy sent to the vision model. Smaller than the stored photo on purpose: image tokens drive
 * both latency and cost, and two passes double both. 896px is ample for identifying food and judging
 * a portion; the full-size photo is kept for the journal. Nutrition labels are not downscaled —
 * small print needs the detail.
 */
export const forAnalysis = (blob: Blob) => compressImage(blob, 896, 0.72)

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(r.error); r.readAsDataURL(blob)
  })
}
