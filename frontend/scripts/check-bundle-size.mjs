// Fails the build when the main JavaScript file grows past its cap (wave 7.3).
// The main file is what every visitor downloads before seeing anything; a
// page or a library added to it by mistake would slow down everyone, and no
// test would notice. Measured gzipped, as the server sends it.
// Run after `vite build`: node scripts/check-bundle-size.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const CAP_KB = 120 // 105 kB after wave 7.3; room for normal growth
const dir = new URL('../dist/assets/', import.meta.url)
const main = readdirSync(dir).filter((name) => /^index-.*\.js$/.test(name))
if (main.length !== 1) {
  console.error(`Expected one main file in dist/assets, found ${main.length}. Run vite build first.`)
  process.exit(1)
}
const kb = gzipSync(readFileSync(new URL(main[0], dir))).length / 1024
console.log(`${main[0]}: ${kb.toFixed(1)} kB gzipped (cap ${CAP_KB} kB)`)
if (kb > CAP_KB) {
  console.error('The main file is over its cap: load the new page or library lazily, or raise the cap on purpose.')
  process.exit(1)
}
