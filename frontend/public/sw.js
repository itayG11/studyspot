// The service worker: it runs in the background, even with the site closed,
// to show a push notification (backend/app/notify.py) and open the site
// when it is tapped. Served with no-cache (backend/app/site.py), so a fix
// reaches every browser at once. Plain JavaScript: the browser loads it as is.

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    // Not JSON: show a plain notice rather than nothing.
  }
  // Only a page of this site: a notification never sends anyone elsewhere
  // (a path like "/\\evil.example" would, so the origin itself is compared).
  let url = '/'
  try {
    const target = new URL(typeof message.url === 'string' ? message.url : '/', self.location.origin)
    if (target.origin === self.location.origin) url = target.pathname + target.search + target.hash
  } catch {
    // Not a URL: the home page.
  }
  event.waitUntil(
    self.registration.showNotification(typeof message.title === 'string' ? message.title : 'StudySpot', {
      body: typeof message.body === 'string' ? message.body : '',
      icon: '/icons/icon-192.png',
      lang: 'he',
      dir: 'rtl',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin))
      if (open) return open.navigate(url).then((w) => (w ?? open).focus())
      return self.clients.openWindow(url)
    }),
  )
})
