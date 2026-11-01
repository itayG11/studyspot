// The browser's half of the proof of work on "send me a code" (server side:
// backend/app/pow.py). The server hands out a random salt and a number of
// zero bits; this finds a number (nonce) for which SHA-256 of "salt:nonce"
// starts with that many zero bits. It takes about 2^bits tries, around a
// second at the production setting, and a script asking for many codes pays
// that every time.
//
// The hash is written out here rather than taken from crypto.subtle: that
// exists only on https and localhost, and an asynchronous call per try is
// slower than this loop. The puzzle's text always fits one 64-byte block,
// which keeps the function short. It is tested against the platform's hash.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74,
  0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
  0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e,
  0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const MAX_SHORT = 55 // a message this long, plus the 1 and the 8 length bytes, fills one block
const w = new Uint32Array(64)
const block = new Uint8Array(64)
const state = new Uint32Array(8)

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

/** SHA-256 of a message of at most 55 bytes. */
export function sha256Short(message: Uint8Array): Uint8Array {
  if (message.length > MAX_SHORT) throw new RangeError('message too long for one block')
  block.fill(0)
  block.set(message)
  block[message.length] = 0x80
  // The length in bits, in the last 8 bytes (a short message: only the last byte or two)
  const bits = message.length * 8
  block[62] = (bits >>> 8) & 0xff
  block[63] = bits & 0xff
  for (let i = 0; i < 16; i++) w[i] = (block[i * 4]! << 24) | (block[i * 4 + 1]! << 16) | (block[i * 4 + 2]! << 8) | block[i * 4 + 3]!
  for (let i = 16; i < 64; i++) {
    const a = w[i - 15]!
    const b = w[i - 2]!
    const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)
    const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)
    w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0
  }
  state.set([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  let [a, b, c, d, e, f, g, h] = state as unknown as number[]
  a = a!; b = b!; c = c!; d = d!; e = e!; f = f!; g = g!; h = h!
  for (let i = 0; i < 64; i++) {
    const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
    const ch = (e & f) ^ (~e & g)
    const t1 = (h + s1 + ch + K[i]! + w[i]!) | 0
    const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
    const maj = (a & b) ^ (a & c) ^ (b & c)
    const t2 = (s0 + maj) | 0
    h = g
    g = f
    f = e
    e = (d + t1) | 0
    d = c
    c = b
    b = a
    a = (t1 + t2) | 0
  }
  const out = new Uint8Array(32)
  const view = new DataView(out.buffer)
  const total = [a, b, c, d, e, f, g, h]
  for (let i = 0; i < 8; i++) view.setUint32(i * 4, (state[i]! + total[i]!) >>> 0)
  return out
}

/** How many bits at the front of the hash are zero. */
export function leadingZeroBits(digest: Uint8Array): number {
  let bits = 0
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8
      continue
    }
    return bits + Math.clz32(byte) - 24
  }
  return bits
}

/** Tries nonces from `start` up to (not including) `end`; the first that works, or null. */
export function findNonce(salt: string, bits: number, start: number, end: number): number | null {
  const prefix = new TextEncoder().encode(`${salt}:`)
  const message = new Uint8Array(MAX_SHORT)
  message.set(prefix)
  for (let nonce = start; nonce < end; nonce++) {
    const digits = String(nonce)
    let length = prefix.length
    for (let i = 0; i < digits.length; i++) message[length++] = digits.charCodeAt(i)
    if (leadingZeroBits(sha256Short(message.subarray(0, length))) >= bits) return nonce
  }
  return null
}

const CHUNK = 20_000

/** The nonce, found in a background thread where the browser has one, else in
 *  slices on this thread, so the page stays responsive either way. */
export async function solve(salt: string, bits: number): Promise<number> {
  if (bits === 0) return 0
  if (typeof Worker !== 'undefined') {
    try {
      return await solveInWorker(salt, bits)
    } catch {
      // A browser that refuses the worker: do it here.
    }
  }
  for (let start = 0; ; start += CHUNK) {
    const found = findNonce(salt, bits, start, start + CHUNK)
    if (found !== null) return found
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function solveInWorker(salt: string, bits: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<number>) => {
      worker.terminate()
      resolve(event.data)
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message))
    }
    worker.postMessage({ salt, bits })
  })
}
