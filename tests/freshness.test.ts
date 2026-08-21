/**
 * Catches the failure mode where the code is correct, the tests pass, and the
 * application on screen is nevertheless running something else entirely.
 *
 * Three rounds of page-view fixes were verified green here while the app being
 * restarted was a packaged build predating all of them: `npm run build` writes
 * to out/, but an *installed* copy runs from its own bundled app.asar, which
 * only `npm run build:win` regenerates. Nothing in a source-level test suite
 * can notice that, because the artifact under test and the artifact being run
 * are different files.
 *
 * So this suite checks artifacts rather than behaviour: is out/ actually newer
 * than src/, does it contain the code the source says it should, and — if a
 * packaged build exists on this machine — is it stale relative to the source.
 */
import { readdir, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { assert, createReport, note, section, summarize } from './harness'

const ROOT = process.cwd()

/** Markers that must survive from source into any built artifact. Chosen to
 *  span the whole renderer: styling, the pagination command, and a main-process
 *  module, so a partial or half-finished build is caught too. */
const MARKERS = ['page-stack', 'chf-page-margin', 'setPageBreaks', 'binder-minimap']

async function newestMtime(dir: string, skip: (name: string) => boolean = () => false): Promise<number> {
  let newest = 0
  const walk = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (skip(entry.name)) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) await walk(full)
      else newest = Math.max(newest, (await stat(full)).mtimeMs)
    }
  }
  await walk(dir)
  return newest
}

async function builtRendererText(): Promise<string> {
  const assetsDir = join(ROOT, 'out', 'renderer', 'assets')
  if (!existsSync(assetsDir)) return ''
  const files = await readdir(assetsDir)
  const parts = await Promise.all(files.map((f) => readFile(join(assetsDir, f), 'utf-8').catch(() => '')))
  return parts.join('\n')
}

/** Every packaged copy of the app this machine might actually be launching. */
function packagedAsarPaths(): { label: string; path: string }[] {
  const candidates = [
    { label: 'installed app', path: join(homedir(), 'AppData', 'Local', 'Programs', 'chapterflow-app', 'resources', 'app.asar') },
    { label: 'dist/win-unpacked', path: join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar') }
  ]
  return candidates.filter((c) => existsSync(c.path))
}

async function main(): Promise<void> {
  const report = createReport()

  // ---- out/ is actually a build of the current source --------------------
  section(report, 'built output (out/)')
  const srcNewest = await newestMtime(join(ROOT, 'src'))
  const outNewest = existsSync(join(ROOT, 'out')) ? await newestMtime(join(ROOT, 'out')) : 0
  note(report, `newest src ${new Date(srcNewest).toISOString()}, newest out ${new Date(outNewest).toISOString()}`)
  assert(report, outNewest > srcNewest, 'out/ is newer than src/ — run "npm run build" if this fails')

  const built = await builtRendererText()
  assert(report, built.length > 0, 'out/renderer/assets contains a build')
  for (const marker of MARKERS) {
    assert(report, built.includes(marker), `built renderer contains "${marker}"`)
  }

  // ---- packaged copies are not silently stale ---------------------------
  section(report, 'packaged builds')
  const packaged = packagedAsarPaths()
  if (packaged.length === 0) {
    note(report, 'none found on this machine — nothing to check')
  }
  for (const { label, path } of packaged) {
    const asar = await readFile(path, 'latin1')
    const missing = MARKERS.filter((marker) => !asar.includes(marker))
    const when = new Date((await stat(path)).mtimeMs).toISOString()
    note(report, `${label}: built ${when}`)
    assert(
      report,
      missing.length === 0,
      `${label} is up to date with source — if this fails it is running old code ` +
        `(missing: ${missing.join(', ') || 'nothing'}); rebuild with "npm run build:win" and reinstall, ` +
        `or run the app with "npm run dev" instead`
    )
  }

  console.log(summarize(report))
  if (report.failures > 0) process.exitCode = 1
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
