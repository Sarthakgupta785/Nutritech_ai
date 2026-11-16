/// <reference lib="webworker" />
import { createHandlerBoundToURL, precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any }

// App shell is precached, so the app opens and logs meals with no connection.
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

self.addEventListener('install', () => { void self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Web Push. iOS requires that every push shows a notification, so we always show one.
self.addEventListener('push', event => {
  let d: any = {}
  try { d = event.data?.json() ?? {} } catch { d = { title: 'NutriTrack AI', body: event.data?.text() } }
  const options: NotificationOptions & { actions?: { action: string; title: string }[] } = {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', tag: d.tag, data: { url: d.url || '/' }, actions: d.actions || [],
  }
  event.waitUntil(self.registration.showNotification(d.title || 'NutriTrack AI', options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  let url: string = event.notification.data?.url || '/'
  // Action buttons show on platforms that support them; on iPhone the same choices are on the screen that opens.
  if (event.action === 'snooze10' || event.action === 'snooze15') url += `${url.includes('?') ? '&' : '?'}do=${event.action}`
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = all[0]
    if (client) {
      client.postMessage({ type: 'navigate', url })
      try { await client.focus() } catch { /* ignore */ }
      return
    }
    await self.clients.openWindow(url)
  })())
})
