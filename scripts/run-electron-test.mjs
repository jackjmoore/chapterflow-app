/**
 * Runs an Electron-hosted test file and surfaces its result as a normal
 * process exit code.
 *
 * Two Electron quirks make this wrapper necessary rather than just calling
 * `electron tests/pdf.test.ts` from an npm script:
 *
 *  - ELECTRON_RUN_AS_NODE, if set in the environment, makes the electron
 *    binary behave as plain Node. `require('electron')` then returns the path
 *    to the executable instead of the API object, and every Electron call
 *    fails with a confusing "cannot read properties of undefined". It is
 *    stripped here so the test always gets a real main process.
 *  - On Windows the main process does not attach stdout to the parent
 *    console, so anything the test logs is invisible. The test writes its
 *    report to OUT_DIR instead and this script prints it.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import electron from 'electron'

const here = dirname(fileURLToPath(import.meta.url))
const bundle = process.argv[2]
if (!bundle) {
  console.error('usage: node scripts/run-electron-test.mjs <bundled-test.cjs>')
  process.exit(2)
}

const outDir = await mkdtemp(join(tmpdir(), 'chapterflow-test-'))
const env = { ...process.env, OUT_DIR: outDir }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn(electron, [resolve(here, '..', bundle)], { env, stdio: 'ignore' })

const code = await new Promise((resolvePromise) => child.on('exit', resolvePromise))

// Electron's helper processes (GPU, renderer, network) outlive the main
// process by a moment. Returning immediately lets the next suite's app start
// while the previous one is still tearing down, and the contention is enough
// to starve timing-sensitive assertions — the live suite passes alone and
// fails in a full run without this pause.
await new Promise((resolvePromise) => setTimeout(resolvePromise, 2000))

try {
  console.log(await readFile(join(outDir, 'report.txt'), 'utf-8'))
} catch {
  console.error(`No report written — the Electron test exited (code ${code}) before finishing.`)
  process.exit(1)
}

await rm(outDir, { recursive: true, force: true })
process.exit(code ?? 1)
