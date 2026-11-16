// Generates a VAPID key pair for Web Push. Run: npm run vapid
const b64u = b => Buffer.from(b).toString('base64url')
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey)
console.log('\nVAPID_PUBLIC_KEY  (also use as VITE_VAPID_PUBLIC_KEY):\n' + b64u(pub))
console.log('\nVAPID_PRIVATE_KEY (keep secret — Supabase function secret only):\n' + jwk.d + '\n')
