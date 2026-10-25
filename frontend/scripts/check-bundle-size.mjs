// Fails the build when the main JavaScript file grows past its cap (wave 7.3).
// The main file is what every visitor downloads before seeing anything; a
// page or a library added to it by mistake would slow down everyone, and no
// test would notice. Measured gzipped, as the server sends it.
// Run after `vite build`: node scripts/check-bundle-size.mjs

import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const CAP_KB = 120 // 105 kB after wave 7.3; room for normal growth
const dist = new URL('../dist/', import.meta.url)
// The main file is the one the page itself loads, whatever it is called.
const entry = readFileSync(new URL('index.html', dist), 'utf8').match(/<script type="module"[^>]*src="\/([^"]+\.js)"/)
if (!entry) {
  console.error('No main script in dist/index.html. Run vite build first.')
  process.exit(1)
}
const kb = gzipSync(readFileSync(new URL(entry[1], dist))).length / 1024
console.log(`${entry[1]}: ${kb.toFixed(1)} kB gzipped (cap ${CAP_KB} kB)`)
if (kb > CAP_KB) {
  console.error('The main file is over its cap: load the new page or library lazily, or raise the cap on purpose.')
  process.exit(1)
}

// No source maps on the site: they hand anyone the original code, comments
// and all (vite's default is off; this keeps it so). Test round, 25 Oct.
const files = readdirSync(dist, { recursive: true }).map(String)
const maps = files.filter((f) => f.endsWith('.map') || (f.endsWith('.js') && readFileSync(new URL(f, dist), 'utf8').includes('sourceMappingURL=')))
if (maps.length) {
  console.error(`Source maps in dist/: ${maps.slice(0, 3).join(', ')}. Turn build.sourcemap off.`)
  process.exit(1)
}
console.log('no source maps in dist/')
