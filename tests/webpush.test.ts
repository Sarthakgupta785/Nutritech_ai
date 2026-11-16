import { describe, expect, it } from 'vitest'
import { b64uDecode, b64uEncode, encryptPayload, vapidHeader } from '../supabase/functions/_shared/webpush.ts'

const enc = new TextEncoder()
const concat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length } return o }
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey('raw', ikm as any, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as any, info: info as any }, k, len * 8))
}

describe('web push', () => {
  it('produces an RFC 8291 message the browser side can decrypt', async () => {
    // Play the role of the browser: own key pair + auth secret.
    const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
    const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const msg = await encryptPayload({ endpoint: 'https://push.example/x', p256dh: b64uEncode(uaPublic), auth: b64uEncode(auth) }, '{"title":"Lunch"}')

    const salt = msg.slice(0, 16), rs = new DataView(msg.buffer, msg.byteOffset).getUint32(16), idlen = msg[20]
    const asPublic = msg.slice(21, 21 + idlen), cipher = msg.slice(21 + idlen)
    expect(rs).toBe(4096); expect(idlen).toBe(65)
    const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256))
    const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher))
    expect(plain[plain.length - 1]).toBe(2)
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe('{"title":"Lunch"}')
  })

  it('signs a verifiable VAPID token', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const publicKey = b64uEncode(await crypto.subtle.exportKey('raw', kp.publicKey))
    const privateKey = (await crypto.subtle.exportKey('jwk', kp.privateKey)).d!
    const header = await vapidHeader('https://web.push.apple.com/abc', { publicKey, privateKey, subject: 'mailto:me@example.com' })
    const [, t, k] = header.match(/^vapid t=(.+), k=(.+)$/)!
    expect(k).toBe(publicKey)
    const [h, b, s] = t.split('.')
    expect(JSON.parse(new TextDecoder().decode(b64uDecode(b))).aud).toBe('https://web.push.apple.com')
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, b64uDecode(s) as any, enc.encode(`${h}.${b}`))).toBe(true)
  })
})
