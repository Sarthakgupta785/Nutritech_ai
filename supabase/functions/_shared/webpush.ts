// Web Push (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID) on the standard Web Crypto API.
// No dependencies, so it runs unchanged in Supabase Edge Functions (Deno) and in Node 20+ for tests.

export interface PushSub { endpoint: string; p256dh: string; auth: string }
export interface Vapid { publicKey: string; privateKey: string; subject: string }

const enc = new TextEncoder()
// Web Crypto accepts any byte view at runtime; this keeps the types happy across TypeScript/Deno versions.
const bs = (u: Uint8Array) => u as unknown as BufferSource
export const b64uDecode = (s: string): Uint8Array => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='))
  return Uint8Array.from(b, c => c.charCodeAt(0))
}
export const b64uEncode = (b: ArrayBuffer | Uint8Array): string => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b); let s = ''
  for (const x of u) s += String.fromCharCode(x)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const concat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', bs(ikm), 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: bs(salt), info: bs(info) }, key, len * 8))
}

export async function encryptPayload(sub: PushSub, payload: string): Promise<Uint8Array> {
  const uaPublic = b64uDecode(sub.p256dh), authSecret = b64uDecode(sub.auth)
  const uaKey = await crypto.subtle.importKey('raw', bs(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey))
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256))
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', bs(cek), 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bs(nonce) }, key, bs(concat(enc.encode(payload), new Uint8Array([2])))))
  const header = new Uint8Array(21 + asPublic.length)
  header.set(salt, 0); new DataView(header.buffer).setUint32(16, 4096); header[20] = asPublic.length; header.set(asPublic, 21)
  return concat(header, cipher)
}

export async function vapidHeader(endpoint: string, v: Vapid): Promise<string> {
  const pub = b64uDecode(v.publicKey)
  const jwk = { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), ext: true }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const body = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.subject })))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, bs(enc.encode(`${head}.${body}`)))
  return `vapid t=${head}.${body}.${b64uEncode(sig)}, k=${v.publicKey}`
}

/** Returns the push service HTTP status. 404/410 mean the subscription is dead and should be removed. */
export async function sendPush(sub: PushSub, payload: unknown, v: Vapid, ttl = 3600): Promise<number> {
  const body = await encryptPayload(sub, JSON.stringify(payload))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(sub.endpoint, v), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'high' },
    body: bs(body),
  })
  await res.arrayBuffer().catch(() => null)
  return res.status
}

export function vapidFromEnv(get: (k: string) => string | undefined): Vapid | null {
  const publicKey = get('VAPID_PUBLIC_KEY'), privateKey = get('VAPID_PRIVATE_KEY')
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject: get('VAPID_SUBJECT') || 'mailto:admin@example.com' }
}
