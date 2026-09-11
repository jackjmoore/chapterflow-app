/**
 * Filesystem integration, part one: the two things that stand between a save
 * and a lost manuscript.
 *
 * `atomicWrite` is the single write path for every store, so its queue decides
 * what survives when two saves for the same file are in flight, and its
 * observer hook sits between a successful rename and the caller's promise.
 * `loadFailed` in binderStore and storyBibleStore decides what happens when a
 * file that exists cannot be read: without it a load error leaves the store at
 * its empty state and the next persist writes that emptiness over a real
 * project.
 *
 * Runs in a real Electron main process because the stores reach getProjectRoot,
 * which reads app paths. No window is opened and nothing here is timed, so it
 * runs on a cloud runner under a virtual framebuffer as well as on the
 * development machine. Everything happens inside a temp directory made by the
 * test and removed at the end.
 */
import { app } from 'electron'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync, readdirSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { atomicWrite, setProjectWriteObserver } from '../src/main/atomicWrite'
import { setProjectRoot } from '../src/main/projectRoot'
import * as binderStore from '../src/main/binderStore'
import * as storyBibleStore from '../src/main/storyBibleStore'
import * as mentionStore from '../src/main/mentionStore'
import { STRUCTURAL_FOLDERS } from '../src/shared/binder'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

const read = (path: string): Promise<string> => readFile(path, 'utf-8')

/** Resolves once every queued write for a path has settled, whatever it did.
 *  Used instead of a delay so nothing here depends on timing. */
async function settle(promises: Promise<unknown>[]): Promise<void> {
  await Promise.allSettled(promises)
}

// ---- atomicWrite ----------------------------------------------------------

async function writeOrdering(report: TestReport, root: string): Promise<void> {
  section(report, 'write ordering under contention')

  const target = join(root, 'contended.json')
  const seen: string[] = []
  setProjectWriteObserver((path, data) => {
    if (path === target) seen.push(data)
  })

  // Twelve saves for one file, none awaited: the shape of a writer typing
  // through a debounce while a rescan writes the same index.
  const payloads = Array.from({ length: 12 }, (_, i) => `payload ${i + 1}`)
  await settle(payloads.map((p) => atomicWrite(target, p)))

  assert(report, (await read(target)) === payloads[11], 'the last write queued is the content left on disk')
  assert(
    report,
    seen.length === 12 && seen.every((data, i) => data === payloads[i]),
    `writes complete in the order they were queued (got ${seen.length} of 12, ${seen.join(' | ') === payloads.join(' | ') ? 'in order' : 'out of order'})`
  )

  // A second path must not be held up behind the first, and must not be
  // confused with it.
  const other = join(root, 'nested', 'other.json')
  await settle([atomicWrite(target, 'last for target'), atomicWrite(other, 'only for other')])
  assert(report, (await read(target)) === 'last for target', 'a second path does not disturb the first')
  assert(report, (await read(other)) === 'only for other', 'a write creates missing parent directories')

  const strays = readdirSync(root).filter((name) => name.includes('.tmp-'))
  assert(report, strays.length === 0, `no temp files are left behind after a successful write (found ${strays.length})`)

  setProjectWriteObserver(null)
}

async function failedWriteDoesNotWedge(report: TestReport, root: string): Promise<void> {
  section(report, 'a failed write')

  // A directory standing where the file should be: the rename cannot land,
  // which is the same shape as a rename failing for any non-transient reason.
  const blocked = join(root, 'blocked.json')
  await mkdir(blocked, { recursive: true })

  const notified: string[] = []
  setProjectWriteObserver((path, data) => notified.push(`${path}=${data}`))

  let rejected = false
  await atomicWrite(blocked, 'never lands').catch(() => (rejected = true))
  assert(report, rejected, 'a write that cannot land rejects rather than resolving quietly')
  assert(report, notified.length === 0, `the observer is not told about a write that failed (told ${notified.length} times)`)

  // Recorded, not asserted: whether a failed rename should remove the temp
  // file it wrote is the open question behind the deferred "sweep orphaned
  // .tmp-* files" item, so this reports what happens rather than deciding it.
  const orphans = readdirSync(root).filter((name) => name.startsWith('blocked.json.tmp-'))
  note(report, `a write whose rename failed left ${orphans.length} temp file(s) beside the target`)

  // The queue keeps one promise per path; a rejection must not poison it.
  await rm(blocked, { recursive: true, force: true })
  for (const name of orphans) await rm(join(root, name), { force: true })
  let secondFailed = false
  await atomicWrite(blocked, 'lands now').catch(() => (secondFailed = true))
  assert(report, !secondFailed && (await read(blocked)) === 'lands now', 'a later write to the same path still runs after a failure')

  setProjectWriteObserver(null)
}

async function observerFailure(report: TestReport, root: string): Promise<void> {
  section(report, 'observer failure never fails a save')

  const target = join(root, 'observed.json')
  let calls = 0
  setProjectWriteObserver(() => {
    calls += 1
    throw new Error('the search index blew up')
  })

  let saveRejected = false
  await atomicWrite(target, 'first').catch(() => (saveRejected = true))
  assert(report, !saveRejected, 'a throwing observer does not reject the save')
  assert(report, (await read(target)) === 'first', 'the file is written even though the observer threw')

  await atomicWrite(target, 'second').catch(() => undefined)
  assert(report, calls === 2, `the observer is still called after it threw (called ${calls} times)`)
  assert(report, (await read(target)) === 'second', 'the save after an observer failure still lands')

  // The content is handed to the observer rather than re-read, so the observer
  // cannot race the write it is reacting to.
  const handed: string[] = []
  setProjectWriteObserver((_path, data) => handed.push(data))
  const exact = '{"html":"<p>Ral turned away.</p>"}'
  await atomicWrite(target, exact)
  assert(report, handed.length === 1 && handed[0] === exact, 'the observer is handed the exact bytes written')

  setProjectWriteObserver(null)
  await atomicWrite(target, 'unobserved')
  assert(report, handed.length === 1, 'clearing the observer stops the notifications')
}

// ---- the unreadable-file guard -------------------------------------------

/** Builds a small real binder, then returns the bytes it left on disk. */
async function seedBinder(root: string): Promise<string> {
  setProjectRoot(root)
  binderStore.invalidateCache()
  await binderStore.setProjectName('Guarded Project')
  const chapter = await binderStore.createDocument(null, 'Chapter One')
  await binderStore.setSynopsis(chapter.id, 'The one paragraph worth keeping.')
  return read(join(root, 'binder.json'))
}

/** Every way a mutation reaches persist(): a view-state change of the kind
 *  that fires on its own at startup, a metadata edit, and a structural edit.
 *  Each rejection is swallowed: when the guard is absent the write reaches the
 *  disk and may throw on the way, and that has to arrive as a failed assertion
 *  below rather than as a thrown error that abandons the rest of the suite. */
async function pokeBinder(): Promise<void> {
  await binderStore.setLastOpenDocument('does-not-exist').catch(() => undefined)
  await binderStore.setProjectName('Clobbered').catch(() => undefined)
  await binderStore.createDocument(null, 'Added After The Failure').catch(() => undefined)
}

async function binderGuard(report: TestReport, parent: string): Promise<void> {
  section(report, 'binder guard: unreadable binder.json is never overwritten')

  const binderPath = (root: string): string => join(root, 'binder.json')

  // 1. Content that is not JSON at all.
  const corruptRoot = await mkdtemp(join(parent, 'corrupt-'))
  const goodBytes = await seedBinder(corruptRoot)
  const truncated = goodBytes.slice(0, Math.floor(goodBytes.length / 2))
  await writeFile(binderPath(corruptRoot), truncated, 'utf-8')
  binderStore.invalidateCache()
  const afterCorrupt = await binderStore.getState()
  // Empty means the five protected structural folders and nothing inside them
  // — the same tree a brand-new project starts with, which is exactly what
  // makes a silent overwrite here indistinguishable from a new project.
  assert(
    report,
    afterCorrupt.tree.length === STRUCTURAL_FOLDERS.length &&
      afterCorrupt.tree.every((node) => node.children.length === 0) &&
      afterCorrupt.projectName === null,
    `an unparseable binder loads as an empty project rather than throwing (got ${afterCorrupt.tree.length} top-level nodes)`
  )
  await pokeBinder()
  assert(report, (await read(binderPath(corruptRoot))) === truncated, 'the unparseable bytes are still on disk after three mutations')

  // 2. Valid JSON that is not a binder.
  const wrongShapeRoot = await mkdtemp(join(parent, 'wrongshape-'))
  setProjectRoot(wrongShapeRoot)
  binderStore.invalidateCache()
  const wrongShape = JSON.stringify({ version: 1, tree: { draft: [] } }, null, 2)
  await writeFile(binderPath(wrongShapeRoot), wrongShape, 'utf-8')
  binderStore.invalidateCache()
  await binderStore.getState()
  await pokeBinder()
  assert(report, (await read(binderPath(wrongShapeRoot))) === wrongShape, 'a file with no usable tree is left exactly as found')

  // 3. A file that exists but cannot be read — the transient case the guard
  //    was written for, standing in here as a directory where the file goes.
  const unreadableRoot = await mkdtemp(join(parent, 'unreadable-'))
  setProjectRoot(unreadableRoot)
  binderStore.invalidateCache()
  await mkdir(binderPath(unreadableRoot), { recursive: true })
  await binderStore.getState()
  await pokeBinder()
  const unreadableEntries = readdirSync(unreadableRoot)
  assert(
    report,
    statSync(binderPath(unreadableRoot)).isDirectory() && !unreadableEntries.some((name) => name.includes('binder.json.tmp-')),
    'a binder that exists but cannot be read is neither replaced nor written beside'
  )

  // 4. The control. Without this the three assertions above would also pass if
  //    persist() had simply stopped writing.
  const healthyRoot = await mkdtemp(join(parent, 'healthy-'))
  const before = await seedBinder(healthyRoot)
  await binderStore.setProjectName('Renamed')
  const after = await read(binderPath(healthyRoot))
  assert(report, after !== before && after.includes('Renamed'), 'a readable binder is still written to (the guard can fail)')

  // 5. A failed load must not keep writes blocked after switching projects.
  setProjectRoot(corruptRoot)
  binderStore.invalidateCache()
  await binderStore.getState()
  const switchRoot = await mkdtemp(join(parent, 'switched-'))
  setProjectRoot(switchRoot)
  binderStore.invalidateCache()
  await binderStore.setProjectName('After The Switch')
  assert(
    report,
    existsSync(binderPath(switchRoot)) && (await read(binderPath(switchRoot))).includes('After The Switch'),
    'switching to a readable project clears the block from a failed load'
  )
}

async function storyBibleGuard(report: TestReport, parent: string): Promise<void> {
  section(report, 'story bible guard: unreadable index.json is never overwritten')

  const idxPath = (root: string): string => join(root, 'storybible', 'index.json')

  const seed = async (root: string): Promise<string> => {
    setProjectRoot(root)
    storyBibleStore.invalidateCache()
    await storyBibleStore.createItem('sb-character', 'Katrina')
    await storyBibleStore.createItem('sb-location', 'The Mill')
    return read(idxPath(root))
  }

  const corruptRoot = await mkdtemp(join(parent, 'sb-corrupt-'))
  const seeded = await seed(corruptRoot)
  const truncated = seeded.slice(0, Math.floor(seeded.length / 2))
  await writeFile(idxPath(corruptRoot), truncated, 'utf-8')
  storyBibleStore.invalidateCache()
  const state = await storyBibleStore.getState()
  assert(report, state.items.length === 0, 'an unparseable index loads as no items rather than throwing')
  await storyBibleStore.createItem('sb-character', 'Sergei')
  await storyBibleStore.setTypes([{ id: 'sb-character', name: 'Character', color: '#000000' }])
  assert(report, (await read(idxPath(corruptRoot))) === truncated, 'the unparseable bytes survive two mutations')

  const wrongShapeRoot = await mkdtemp(join(parent, 'sb-wrongshape-'))
  setProjectRoot(wrongShapeRoot)
  storyBibleStore.invalidateCache()
  await mkdir(join(wrongShapeRoot, 'storybible'), { recursive: true })
  const wrongShape = JSON.stringify({ version: 1, items: {}, types: [] }, null, 2)
  await writeFile(idxPath(wrongShapeRoot), wrongShape, 'utf-8')
  storyBibleStore.invalidateCache()
  await storyBibleStore.getState()
  await storyBibleStore.createItem('sb-character', 'Frederic')
  assert(report, (await read(idxPath(wrongShapeRoot))) === wrongShape, 'an index with no usable items list is left exactly as found')

  const healthyRoot = await mkdtemp(join(parent, 'sb-healthy-'))
  const before = await seed(healthyRoot)
  await storyBibleStore.createItem('sb-object', 'The Ledger')
  const after = await read(idxPath(healthyRoot))
  assert(report, after !== before && after.includes('The Ledger'), 'a readable index is still written to (the guard can fail)')
}

// ---- what the other stores do --------------------------------------------

/**
 * Recorded, not asserted. Only binderStore and storyBibleStore carry the
 * guard; the other project stores read-modify-write their file on every
 * mutation and fall back to an empty file when the read throws. Whether they
 * should refuse the write too is a decision, not a defect, so this section
 * records what happens today for one of them rather than fixing the behaviour
 * in place.
 */
async function unguardedStores(report: TestReport, parent: string): Promise<void> {
  section(report, 'stores without the guard, recorded')

  const root = await mkdtemp(join(parent, 'unguarded-'))
  setProjectRoot(root)
  const mentionsPath = join(root, 'mentions.json')
  await mentionStore.setManualMention('doc-1', 'item-1', true)
  await mentionStore.setManualMention('doc-2', 'item-1', true)
  const seeded = JSON.parse(await read(mentionsPath)) as { mentions: unknown[] }
  note(report, `mentions.json seeded with ${seeded.mentions.length} records`)

  await writeFile(mentionsPath, '{"version":1,"mentions":[', 'utf-8')
  await mentionStore.setManualMention('doc-3', 'item-1', true)
  const afterCorrupt = JSON.parse(await read(mentionsPath)) as { mentions: unknown[] }
  note(
    report,
    `after an unparseable mentions.json, the next mutation rewrote the file with ${afterCorrupt.mentions.length} record(s); the earlier two were not recovered`
  )
  note(report, 'binderStore and storyBibleStore are the only two stores with a loadFailed guard as of 2026-09-11')
}

// ---- entry point ----------------------------------------------------------

async function run(report: TestReport): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'chapterflow-filesystem-test-'))
  setProjectRoot(parent)
  try {
    const scratch = join(parent, 'atomic')
    await mkdir(scratch, { recursive: true })
    await writeOrdering(report, scratch)
    await failedWriteDoesNotWedge(report, scratch)
    await observerFailure(report, scratch)
    await binderGuard(report, parent)
    await storyBibleGuard(report, parent)
    await unguardedStores(report, parent)
    note(report, `temp root: ${parent}`)
  } finally {
    setProjectWriteObserver(null)
    await rm(parent, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function main(): Promise<void> {
  const report = createReport()
  const outDir = process.env.OUT_DIR ?? '.'
  try {
    await run(report)
  } catch (error) {
    report.lines.push(`  FAIL  threw: ${String((error as Error)?.stack ?? error)}`)
    report.failures += 1
  }
  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

app.on('window-all-closed', () => {})

app.whenReady().then(() => void main())
