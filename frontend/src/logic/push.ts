// Push notifications on this device (wave 10): can it, did the user agree,
// and the conversions the Push API needs. The server side is
// backend/app/notify.py; the service worker that shows them, public/sw.js.

import type { InstallPlatform } from './install'

export type PushSupport = 'supported' | 'needs-install' | 'unsupported'

export interface PushEnvironment {
  platform: InstallPlatform
  serviceWorker: boolean
  pushManager: boolean
  notification: boolean
}

// iPhone and iPad allow push only to a site added to the home screen; in a
// Safari tab the Push API is simply missing, so say how to get there.
export function pushSupport({ platform, serviceWorker, pushManager, notification }: PushEnvironment): PushSupport {
  if (platform === 'ios') return 'needs-install'
  return serviceWorker && pushManager && notification ? 'supported' : 'unsupported'
}

export function currentPushEnvironment(platform: InstallPlatform): PushEnvironment {
  return {
    platform,
    serviceWorker: 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
  }
}

// The server's key, base64url, as the bytes subscribe() takes.
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
  const text = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(text.length))
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)
  return bytes
}
