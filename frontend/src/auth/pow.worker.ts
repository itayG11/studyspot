// Runs the proof of work off the page's own thread (src/auth/pow.ts).

import { findNonce } from './pow'

const CHUNK = 50_000

self.onmessage = (event: MessageEvent<{ salt: string; bits: number }>) => {
  // A dedicated worker only hears the page that created it, and such a message
  // has an empty origin. Anything else is not from us.
  if (event.origin !== '') return
  const { salt, bits } = event.data
  for (let start = 0; ; start += CHUNK) {
    const found = findNonce(salt, bits, start, start + CHUNK)
    if (found !== null) {
      self.postMessage(found)
      return
    }
  }
}
