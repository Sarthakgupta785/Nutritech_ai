import Dexie, { type Table } from 'dexie'
import { supabase, PHOTO_BUCKET } from './supabase'
import type * as T from './types'

/**
 * Offline-first storage. Every screen reads and writes this local IndexedDB database, so logging
 * works with no connection. Rows changed locally are flagged _dirty and pushed to Supabase when
 * online; rows changed elsewhere are pulled by updated_at cursor. Deletes are soft (deleted_at).
 */
export const SYNC_TABLES = [
  'profiles', 'nutrition_targets', 'user_preferences', 'foods', 'favourite_meals', 'meals', 'meal_items', 'meal_photos',
  'reminders', 'reminder_events', 'water_logs', 'weight_logs', 'daily_reports', 'weekly_reports', 'coach_messages', 'workouts',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

export interface PhotoBlob { meal_id: string; blob: Blob; uploaded: number }

class DB extends Dexie {
  profiles!: Table<T.Profile, string>; nutrition_targets!: Table<T.Targets, string>; user_preferences!: Table<T.Prefs, string>
  foods!: Table<T.Food, string>; favourite_meals!: Table<T.FavouriteMeal, string>; meals!: Table<T.Meal, string>
  meal_items!: Table<T.MealItem, string>; meal_photos!: Table<T.MealPhoto, string>; reminders!: Table<T.Reminder, string>
  reminder_events!: Table<T.ReminderEvent, string>; water_logs!: Table<T.WaterLog, string>; weight_logs!: Table<T.WeightLog, string>
  daily_reports!: Table<T.DailyReport, string>; weekly_reports!: Table<T.WeeklyReport, string>; coach_messages!: Table<T.CoachMessage, string>
  workouts!: Table<T.Workout, string>; photo_blobs!: Table<PhotoBlob, string>; meta!: Table<{ key: string; value: any }, string>
  constructor() {
    super('nutritrack')
    this.version(1).stores({
      profiles: '&id,_dirty', nutrition_targets: '&id,_dirty', user_preferences: '&id,_dirty', foods: '&id,_dirty', favourite_meals: '&id,_dirty',
      meals: '&id,local_date,_dirty', meal_items: '&id,meal_id,_dirty', meal_photos: '&id,meal_id,_dirty', reminders: '&id,_dirty',
      reminder_events: '&id,local_date,reminder_id,_dirty', water_logs: '&id,local_date,_dirty', weight_logs: '&id,local_date,_dirty',
      daily_reports: '&id,local_date,_dirty', weekly_reports: '&id,week_start,_dirty', coach_messages: '&id,created_at,_dirty',
      workouts: '&id,local_date,_dirty', photo_blobs: '&meal_id,uploaded', meta: '&key',
    })
  }
}
export const db = new DB()

let uid = ''
export const setUid = (id: string) => { uid = id }
export const getUid = () => uid
export const newId = () => crypto.randomUUID()

/** Stable UUID derived from text, so the app and the server agree on ids like "reminder X on date Y". */
export async function stableId(text: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).slice(0, 16)
  h[6] = (h[6] & 0x0f) | 0x50; h[8] = (h[8] & 0x3f) | 0x80
  const x = [...h].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

type Row<K extends SyncTable> = DB[K] extends Table<infer R, any> ? R : never
type New<R> = Omit<R, 'user_id' | 'updated_at' | '_dirty' | 'deleted_at'> & { deleted_at?: string | null }

export async function put<K extends SyncTable>(table: K, row: New<Row<K>>): Promise<void> {
  await (db[table] as Table<any, string>).put({ ...row, user_id: uid, updated_at: new Date().toISOString(), _dirty: 1 })
  scheduleSync()
}
export async function patch<K extends SyncTable>(table: K, id: string, changes: Partial<Row<K>>): Promise<void> {
  await (db[table] as Table<any, string>).update(id, { ...changes, updated_at: new Date().toISOString(), _dirty: 1 })
  scheduleSync()
}
export async function remove(table: SyncTable, id: string): Promise<void> {
  await (db[table] as Table<any, string>).update(id, { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), _dirty: 1 })
  scheduleSync()
}
export const alive = <R extends { deleted_at?: string | null }>(rows: R[]) => rows.filter(r => !r.deleted_at)

// ---------- sync engine ----------
type Listener = (s: SyncState) => void
export interface SyncState { syncing: boolean; pending: number; lastSync: string | null; error: string | null; online: boolean }
let state: SyncState = { syncing: false, pending: 0, lastSync: null, error: null, online: typeof navigator === 'undefined' ? true : navigator.onLine }
const listeners = new Set<Listener>()
const emit = (p: Partial<SyncState>) => { state = { ...state, ...p }; listeners.forEach(l => l(state)) }
export const getSyncState = () => state
export const onSync = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } }

let timer: ReturnType<typeof setTimeout> | null = null
export function scheduleSync(delay = 600) { if (timer) clearTimeout(timer); timer = setTimeout(() => { void sync() }, delay) }

let running: Promise<void> | null = null
export function sync(): Promise<void> {
  if (running) return running.then(() => sync0())
  return sync0()
}
function sync0(): Promise<void> {
  running = (async () => {
    if (!uid) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) { emit({ online: false, pending: await countDirty() }); return }
    emit({ syncing: true, online: true, error: null })
    try {
      await pushDirty(); await pushPhotos(); await flushStorageDeletes(); await pull()
      emit({ lastSync: new Date().toISOString() })
    } catch (e: any) {
      emit({ error: e?.message ?? String(e) })
    } finally {
      emit({ syncing: false, pending: await countDirty() })
    }
  })().finally(() => { running = null })
  return running
}
async function countDirty() {
  let n = 0
  for (const t of SYNC_TABLES) n += await (db[t] as Table<any, string>).where('_dirty').equals(1).count()
  return n + (await db.photo_blobs.where('uploaded').equals(0).count())
}
async function pushDirty() {
  for (const t of SYNC_TABLES) {
    const table = db[t] as Table<any, string>
    const dirty = await table.where('_dirty').equals(1).toArray()
    for (let i = 0; i < dirty.length; i += 200) {
      const batch = dirty.slice(i, i + 200)
      const { error } = await supabase.from(t).upsert(batch.map(({ _dirty, ...r }) => ({ ...r, user_id: uid })))
      if (error) throw new Error(`${t}: ${error.message}`)
      await db.transaction('rw', table, async () => {
        for (const r of batch) { const cur = await table.get(r.id); if (cur && cur.updated_at === r.updated_at) await table.update(r.id, { _dirty: 0 }) }
      })
    }
  }
}
async function pushPhotos() {
  const waiting = await db.photo_blobs.where('uploaded').equals(0).toArray()
  for (const p of waiting) {
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(photoPath(p.meal_id), p.blob, { contentType: 'image/jpeg', upsert: true })
    if (error) throw new Error(`photo upload: ${error.message}`)
    await db.photo_blobs.update(p.meal_id, { uploaded: 1 })
  }
}
async function flushStorageDeletes() {
  const m = await db.meta.get('storage_deletes'); const paths: string[] = m?.value ?? []
  if (!paths.length) return
  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove(paths)
  if (!error) await db.meta.put({ key: 'storage_deletes', value: [] })
}
async function pull() {
  for (const t of SYNC_TABLES) {
    const table = db[t] as Table<any, string>
    const key = `cursor:${t}`
    let cursor: string = (await db.meta.get(key))?.value ?? '1970-01-01T00:00:00Z'
    for (;;) {
      let q = supabase.from(t).select('*').gt('updated_at', cursor).order('updated_at', { ascending: true }).limit(500)
      if (t === 'foods') q = q.eq('user_id', uid)
      const { data, error } = await q
      if (error) throw new Error(`${t}: ${error.message}`)
      if (!data?.length) break
      await db.transaction('rw', table, async () => {
        for (const r of data) { const cur = await table.get(r.id); if (!cur || !cur._dirty) await table.put({ ...r, _dirty: 0 }) }
      })
      cursor = data[data.length - 1].updated_at
      await db.meta.put({ key, value: cursor })
      if (data.length < 500) break
    }
  }
}
export async function clearLocal() { await db.delete(); await db.open() }

// ---------- photos ----------
export const photoPath = (mealId: string) => `${uid}/${mealId}.jpg`
export async function savePhoto(mealId: string, blob: Blob) {
  await db.photo_blobs.put({ meal_id: mealId, blob, uploaded: 0 })
  const existing = alive(await db.meal_photos.where('meal_id').equals(mealId).toArray())[0]
  await put('meal_photos', { id: existing?.id ?? newId(), meal_id: mealId, storage_path: photoPath(mealId) })
}
export async function deletePhoto(mealId: string) {
  const rows = await db.meal_photos.where('meal_id').equals(mealId).toArray()
  const m = await db.meta.get('storage_deletes')
  await db.meta.put({ key: 'storage_deletes', value: [...(m?.value ?? []), ...rows.map(r => r.storage_path)] })
  for (const r of rows) await remove('meal_photos', r.id)
  await db.photo_blobs.delete(mealId)
}
/** Local blob if we have it, otherwise download from private storage once and keep a copy for offline use. */
export async function loadPhoto(mealId: string): Promise<Blob | null> {
  const local = await db.photo_blobs.get(mealId)
  if (local) return local.blob
  const row = alive(await db.meal_photos.where('meal_id').equals(mealId).toArray())[0]
  if (!row || !navigator.onLine) return null
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).download(row.storage_path)
  if (error || !data) return null
  await db.photo_blobs.put({ meal_id: mealId, blob: data, uploaded: 1 })
  return data
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { emit({ online: true }); void sync() })
  window.addEventListener('offline', () => emit({ online: false }))
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(200) })
}
