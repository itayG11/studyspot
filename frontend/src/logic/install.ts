// Adding the site to the phone's home screen, where it opens like an app
// (public/manifest.webmanifest).
//
// Android's Chrome offers its own install prompt (the "beforeinstallprompt"
// event), so there the tip can be one button. Safari on iPhone and iPad has
// no such prompt for websites: the tip shows the steps by hand.

export type InstallPlatform = 'installed' | 'ios' | 'android' | 'other'

export interface DeviceInfo {
  userAgent: string
  maxTouchPoints: number
  standalone: boolean // opened from the home screen already
}

export function detectPlatform({ userAgent, maxTouchPoints, standalone }: DeviceInfo): InstallPlatform {
  if (standalone) return 'installed'
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios'
  // iPadOS asks for the desktop site by default and says it is a Mac; only
  // the touch screen gives it away.
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  return 'other'
}

export function currentDevice(): DeviceInfo {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0, standalone }
}

// "Not now" on the home page tip, remembered on this device. Storage can be
// refused (private mode); then the tip simply comes back next visit.
export const INSTALL_DISMISSED_KEY = 'studyspot:install-tip-dismissed'

export function installTipDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissInstallTip(): void {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
  } catch {
    // not remembered; nothing else breaks
  }
}

// Chrome's install prompt fires once, early, maybe before any page shows
// the tip; it is kept here until a tip asks for it.
export interface InstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let saved: InstallPrompt | null = null
const listeners = new Set<() => void>()

export function listenForInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // the tip offers it, at a moment the visitor chooses
    saved = event as InstallPrompt
    for (const listener of listeners) listener()
  })
  window.addEventListener('appinstalled', () => {
    saved = null
    for (const listener of listeners) listener()
  })
}

export function installPrompt(): InstallPrompt | null {
  return saved
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function forgetInstallPrompt(): void {
  saved = null
  for (const listener of listeners) listener()
}
