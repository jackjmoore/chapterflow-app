/**
 * Runs the test suites and writes machine-readable results.
 *
 * Replaces the old `npm test` chain, which joined every suite with && (so the
 * first failure hid every later suite) and rebuilt the app inside each script
 * (about ten builds per full run). This runner prepares once, runs every
 * selected suite whatever the previous one did, and writes one JSON record per
 * suite that survives an Electron crash mid-run.
 *
 *   node scripts/run-tests.mjs                 every suite, in order
 *   node scripts/run-tests.mjs export pdf      just those
 *   --no-prepare        skip the app build and test bundling. Required for a
 *                       second concurrent run on the same checkout: out/ and
 *                       the bundle cache are shared files, and a rebuild under
 *                       a running suite would pull the floor out from under it.
 *   --results-dir <p>   where to write results (default test-results/<stamp>)
 *   --timeout-ms <n>    per-suite limit, default 600000 (ten minutes)
 *   --list              print the suite names and exit
 *
 * Results: <results-dir>/<suite>.json, <suite>.txt (the raw report), and
 * summary.json. Each suite's record is written as "running" before launch and
 * overwritten on completion, so a runner that is itself killed leaves evidence
 * of where it stopped. Exit code is 1 if any suite did not pass.
 *
 * Two Electron quirks that the old run-electron-test.mjs handled live on here.
 * ELECTRON_RUN_AS_NODE is stripped from the environment: set, it turns the
 * electron binary into plain Node, `require('electron')` returns a path
 * instead of the API, and every Electron call fails. And suites write their
 * report to OUT_DIR rather than stdout, because on Windows the Electron main
 * process does not attach stdout to the parent console. Both are read here.
 * The two-second pause after anything Electron-shaped is also kept: Electron's
 * helper processes outlive the main process by a moment, and starting the next
 * suite into that contention starves timing-sensitive assertions.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'node_modules', '.cache', 'chapterflow-tests')

/** In the order the old `npm test` ran them. `host` is what executes the
 *  bundle; `launchesApp` marks node-hosted suites that spawn the built app
 *  themselves. Either way the suite needs the Electron teardown pause. */
const SUITES = [
  { name: 'freshness', host: 'node', bundle: 'freshness' },
  { name: 'export', host: 'node', bundle: 'export' },
  { name: 'compile', host: 'node', bundle: 'compile' },
  { name: 'compilestruct', host: 'node', bundle: 'compileStructure' },
  { name: 'references', host: 'node', bundle: 'references' },
  { name: 'book', host: 'node', bundle: 'book' },
  { name: 'filesystem', host: 'electron', bundle: 'filesystem' },
  { name: 'binder', host: 'electron', bundle: 'binder' },
  { name: 'generator', host: 'electron', bundle: 'generator' },
  { name: 'compilestore', host: 'electron', bundle: 'compileStore' },
  { name: 'bookrender', host: 'electron', bundle: 'bookRender' },
  { name: 'structure', host: 'electron', bundle: 'structure' },
  { name: 'pdf', host: 'electron', bundle: 'pdf' },
  { name: 'pagination', host: 'electron', bundle: 'pagination', needsBuild: true },
  { name: 'pageview', host: 'electron', bundle: 'pageview', needsBuild: true },
  { name: 'revision', host: 'electron', bundle: 'revision', needsBuild: true },
  { name: 'editorfeatures', host: 'electron', bundle: 'editorfeatures' },
  { name: 'lexicon', host: 'electron', bundle: 'lexicon', needsBuild: true },
  { name: 'search', host: 'electron', bundle: 'searchIndex', needsBuild: true },
  { name: 'rank', host: 'electron', bundle: 'searchRank', needsBuild: true },
  { name: 'searchui', host: 'node', bundle: 'searchUi', needsBuild: true, launchesApp: true },
  { name: 'polish', host: 'node', bundle: 'uiPolish', needsBuild: true, launchesApp: true },
  { name: 'dashboard', host: 'node', bundle: 'dashboard', needsBuild: true, launchesApp: true },
  { name: 'scrivmeta', host: 'node', bundle: 'scrivenerMetadata' },
  { name: 'scrivrtf', host: 'node', bundle: 'scrivenerRtf' },
  { name: 'live', host: 'node', bundle: 'live', needsBuild: true, launchesApp: true }
]

// ---- arguments ------------------------------------------------------------

function parseArgs(argv) {
  const options = { prepare: true, resultsDir: null, timeoutMs: 600_000, list: false, names: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--no-prepare') options.prepare = false
    else if (arg === '--list') options.list = true
    else if (arg === '--results-dir') options.resultsDir = argv[++i]
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++i])
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else options.names.push(arg)
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('--timeout-ms must be a positive number')
  }
  return options
}

function selectSuites(names) {
  if (names.length === 0) return SUITES
  const unknown = names.filter((n) => !SUITES.some((s) => s.name === n))
  if (unknown.length) {
    throw new Error(`unknown suite(s): ${unknown.join(', ')}. Known: ${SUITES.map((s) => s.name).join(' ')}`)
  }
  // Canonical order regardless of how they were listed.
  return SUITES.filter((s) => names.includes(s.name))
}

function defaultResultsDir() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  return join(ROOT, 'test-results', `${stamp}-${process.pid}`)
}

// ---- preparation ----------------------------------------------------------

function npmRun(script) {
  // Through a shell so `npm` resolves to npm.cmd on Windows and plain npm elsewhere.
  const result = spawnSync(`npm run ${script}`, { cwd: ROOT, stdio: 'inherit', shell: true })
  if (result.status !== 0) throw new Error(`npm run ${script} failed (exit ${result.status})`)
}

// ---- report parsing -------------------------------------------------------

/** Reads the harness's text format: `name:` opens a section, `  ok    label`
 *  and `  FAIL  label` are assertions, six-space-indented lines are notes.
 *  The scrivrtf suite prints the same shape from its own copy of the harness. */
function parseReport(text) {
  const assertions = []
  const notes = []
  let section = null
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('  ok    ')) assertions.push({ section, ok: true, label: line.slice(8) })
    else if (line.startsWith('  FAIL  ')) assertions.push({ section, ok: false, label: line.slice(8) })
    else if (/^\S.*:$/.test(line)) section = line.slice(0, -1)
    else if (/^ {6}\S/.test(line)) notes.push({ section, text: line.trim() })
  }
  return { assertions, notes }
}

const tail = (text, max = 4000) => (text.length > max ? text.slice(-max) : text)

// ---- running one suite ----------------------------------------------------

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

async function runSuite(suite, { electronBinary, resultsDir, timeoutMs }) {
  const jsonPath = join(resultsDir, `${suite.name}.json`)
  const textPath = join(resultsDir, `${suite.name}.txt`)
  const startedAt = new Date()
  const record = { suite: suite.name, host: suite.host, status: 'running', startedAt: startedAt.toISOString() }
  await writeFile(jsonPath, JSON.stringify(record, null, 2))

  const outDir = await mkdtemp(join(tmpdir(), `chapterflow-${suite.name}-`))
  const env = { ...process.env, OUT_DIR: outDir }
  delete env.ELECTRON_RUN_AS_NODE

  const bundle = join(CACHE, `${suite.bundle}.test.cjs`)
  const command = suite.host === 'electron' ? electronBinary : process.execPath
  const child = spawn(command, [bundle], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // A process group on POSIX so a timeout can take the whole tree, including
    // an app that a node-hosted suite spawned. Windows uses taskkill /T instead.
    detached: process.platform !== 'win32'
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => (stdout += d))
  child.stderr.on('data', (d) => (stderr += d))

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    killTree(child)
  }, timeoutMs)
  // 'close' rather than 'exit': the pipes have drained by then.
  const exitCode = await new Promise((done) => {
    child.on('close', (code, signal) => done(code ?? (signal ? `signal ${signal}` : null)))
  })
  clearTimeout(timer)

  const fileReport = await readFile(join(outDir, 'report.txt'), 'utf-8').catch(() => null)
  await rm(outDir, { recursive: true, force: true }).catch(() => undefined)
  const reportText = fileReport ?? (stdout.trim() ? stdout : null)
  const parsed = reportText ? parseReport(reportText) : { assertions: [], notes: [] }
  const failed = parsed.assertions.filter((a) => !a.ok).length
  const passed = parsed.assertions.length - failed

  let status
  if (timedOut) status = 'timeout'
  else if (!reportText || parsed.assertions.length === 0) status = 'crashed'
  else if (exitCode === 0 && failed === 0) status = 'passed'
  else status = 'failed'

  const finishedAt = new Date()
  Object.assign(record, {
    status,
    exitCode,
    durationMs: finishedAt - startedAt,
    finishedAt: finishedAt.toISOString(),
    passed,
    failed,
    reportSource: fileReport ? 'report.txt' : reportText ? 'stdout' : null,
    reportFile: reportText ? textPath : null,
    assertions: parsed.assertions,
    notes: parsed.notes,
    stdoutTail: tail(stdout),
    stderrTail: tail(stderr)
  })
  if (reportText) await writeFile(textPath, reportText)
  await writeFile(jsonPath, JSON.stringify(record, null, 2))

  if (suite.host === 'electron' || suite.launchesApp) await new Promise((r) => setTimeout(r, 2000))
  return record
}

// ---- console output -------------------------------------------------------

function describe(record) {
  const seconds = (record.durationMs / 1000).toFixed(1)
  const counts = `${record.passed} passed, ${record.failed} failed`
  const lines = [`  ${record.status.padEnd(8)} ${record.suite.padEnd(15)} ${counts}, ${seconds}s`]
  for (const a of record.assertions.filter((x) => !x.ok)) {
    lines.push(`             FAIL  ${a.section ? a.section + ': ' : ''}${a.label}`)
  }
  if (record.status === 'crashed' || record.status === 'timeout') {
    const why =
      record.status === 'timeout'
        ? 'no result within the time limit; process tree killed'
        : `exited (${record.exitCode}) without writing a report`
    lines.push(`             ${why}`)
    const err = record.stderrTail.trim().split(/\r?\n/).slice(-6)
    for (const line of err) if (line.trim()) lines.push(`             stderr: ${line}`)
  }
  return lines.join('\n')
}

// ---- main -----------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.list) {
    for (const s of SUITES) {
      const flags = `${s.launchesApp ? ' (drives the built app)' : ''}${s.needsBuild ? ' [needs build]' : ''}`
      console.log(`${s.name.padEnd(15)} ${s.host}${flags}`)
    }
    return 0
  }
  const suites = selectSuites(options.names)
  const resultsDir = options.resultsDir ? resolve(options.resultsDir) : defaultResultsDir()
  await mkdir(resultsDir, { recursive: true })
  const summary = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    resultsDir,
    prepared: false,
    suites: []
  }
  const writeSummary = () => writeFile(join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2))

  if (options.prepare) {
    try {
      if (suites.some((s) => s.needsBuild)) npmRun('build')
      npmRun('test:build')
      summary.prepared = true
    } catch (error) {
      summary.prepareError = String(error?.message ?? error)
      summary.finishedAt = new Date().toISOString()
      await writeSummary()
      console.error(`\npreparation failed: ${summary.prepareError}\nresults: ${resultsDir}`)
      return 1
    }
  }

  const electronBinary = createRequire(import.meta.url)('electron')
  console.log(`\nrunning ${suites.length} suite(s), results in ${resultsDir}\n`)

  for (const suite of suites) {
    const record = await runSuite(suite, { electronBinary, resultsDir, timeoutMs: options.timeoutMs })
    const { assertions, notes, stdoutTail, stderrTail, ...brief } = record
    summary.suites.push(brief)
    await writeSummary()
    console.log(describe(record))
  }

  summary.finishedAt = new Date().toISOString()
  await writeSummary()

  const notPassed = summary.suites.filter((s) => s.status !== 'passed')
  const totalAssertions = summary.suites.reduce((n, s) => n + s.passed + s.failed, 0)
  const verdict = notPassed.length ? `; not passed: ${notPassed.map((s) => `${s.suite} (${s.status})`).join(', ')}` : ''
  console.log(
    `\n${summary.suites.length - notPassed.length} of ${summary.suites.length} suites passed, ` +
      `${totalAssertions} assertions in total${verdict}\nresults: ${resultsDir}`
  )
  return notPassed.length ? 1 : 0
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error?.stack ?? error)
    process.exit(2)
  }
)
