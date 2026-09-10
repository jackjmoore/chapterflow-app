/**
 * Bundles the lab's TypeScript with the repo's own esbuild, the same way
 * `npm run test:build` does for the app's suites — so this tool needs no
 * toolchain of its own and the code it compiles is the code that will later
 * move into src/main/import/scrivener/.
 */
import { build } from 'esbuild'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const here = dirname(fileURLToPath(import.meta.url))

const entries = process.argv.slice(2)
if (entries.length === 0) entries.push('test/rtf.test.ts', 'cli.ts')

await build({
  entryPoints: entries.map((e) => join(here, e)),
  outdir: join(here, '.build'),
  // Without this, esbuild derives the output layout from the entries' common
  // ancestor, so building one file lands it somewhere different from building
  // two. Pinning the base keeps .build/ mirroring the source tree either way.
  outbase: here,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: 'inline',
  logLevel: 'info'
})
