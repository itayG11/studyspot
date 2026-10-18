// The browser side of a push subscription: the service worker and the
// PushManager. Kept apart from the component so tests can stand in for it.

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration ? registration.pushManager.getSubscription() : null
}

export async function subscribeDevice(key: Uint8Array<ArrayBuffer>): Promise<PushSubscription> {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  const registration = await navigator.serviceWorker.ready
  // userVisibleOnly: every push shows a notification; browsers require it.
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
}

export function permission(): NotificationPermission {
  return Notification.permission
}

export function askPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission()
}
