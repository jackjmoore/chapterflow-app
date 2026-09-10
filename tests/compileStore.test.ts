/**
 * End-to-end compile against a real temp project: binder + documents on disk,
 * scope filtering, the single-pass compile render, and the compiles/ artifact
 * store — everything the compile:run IPC handler does, minus the IPC glue.
 *
 * Runs in a real Electron main process (via run-electron-test.mjs) because
 * the stores sit on getProjectRoot/app paths; the txt format keeps it off the
 * BrowserWindow-based PDF path, which pdf.test.ts already covers.
 */
import { app } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setProjectRoot } from '../src/main/projectRoot'
import * as binderStore from '../src/main/binderStore'
import * as documentStore from '../src/main/documentStore'
import * as compileStore from '../src/main/compileStore'
import * as compileSettingsStore from '../src/main/compileSettingsStore'
import * as mentionStore from '../src/main/mentionStore'
import * as timelineStore from '../src/main/timelineStore'
import { createFrontMatter, createBackMatter } from '../src/main/templates'
import { validateCompileScope } from '../src/main/compile/validate'
import { renderProjectCompile } from '../src/main/export'
import { filterTreeByScope, summarizeScope, type CompileScope } from '../src/shared/compile'
import { draftChildren, matterFolder } from '../src/shared/binder'
import type { ExportOptions } from '../src/shared/export'
import { assert, createReport, note, section, summarize, type TestReport } from './harness'

async function run(report: TestReport): Promise<void> {
  const projectRoot = await mkdtemp(join(tmpdir(), 'chapterflow-compile-store-test-'))
  setProjectRoot(projectRoot)
  binderStore.invalidateCache()

  try {
    // A project with an act to include and an appendix to leave out.
    await binderStore.setProjectName('Compile Test')
    await binderStore.setAuthorName('Tester')
    const act = await binderStore.createFolder(null, 'Act One')
    const ch1 = await binderStore.createDocument(act.id, 'Chapter 1')
    const ch2 = await binderStore.createDocument(act.id, 'Chapter 2')
    const appendix = await binderStore.createFolder(null, 'Appendix')
    const notes = await binderStore.createDocument(appendix.id, 'Notes')
    await documentStore.saveDocument(ch1.id, '<p>The lamp guttered and went out.</p>')
    await documentStore.saveDocument(ch2.id, '<p>Morning came grey.</p>')
    await documentStore.saveDocument(notes.id, '<p>Appendix material, never compiled.</p>')

    section(report, 'settings seeding')
    const settings = await compileSettingsStore.getCompileSettings()
    assert(report, existsSync(join(projectRoot, 'compile.json')), 'first read persists the seed (seeded once, not re-derived)')
    assert(
      report,
      settings.format === 'docx' && settings.stylePreset === 'manuscript',
      'workbench defaults seed to docx + manuscript format'
    )

    section(report, 'compile render, scoped')
    const scope: CompileScope = { mode: 'selection', nodeIds: [act.id, ch1.id, ch2.id] }
    const state = await binderStore.getState()
    // Compile selects within the manuscript — Draft's children, exactly as
    // the compile:run handler now does.
    const scopeSummary = summarizeScope(draftChildren(state.tree), scope)
    assert(
      report,
      scopeSummary.includedDocuments === 2 && scopeSummary.totalDocuments === 3,
      `scope summarizes as 2 of 3 (got ${scopeSummary.includedDocuments} of ${scopeSummary.totalDocuments})`
    )
    const options: ExportOptions = {
      preset: 'standard',
      pageSize: settings.pageSize,
      marginMm: settings.marginMm,
      authorName: state.authorName,
      title: 'Compile Test'
    }
    const rendered = await renderProjectCompile(
      filterTreeByScope(draftChildren(state.tree), scope),
      state.projectName,
      'txt',
      options
    )
    const outputText = rendered.output.toString('utf-8')
    assert(report, outputText.includes('The lamp guttered'), 'included document content reaches the output')
    assert(report, !outputText.includes('Appendix material'), 'excluded document content does not')
    assert(report, rendered.viewHtml.includes('Morning came grey'), 'viewer HTML carries the same content')
    assert(report, rendered.wordCount === 9, `word count covers document bodies only (got ${rendered.wordCount})`)

    section(report, 'artifact store')
    const meta = await compileStore.createCompile(
      {
        name: 'Query Package',
        format: 'txt',
        stylePreset: 'standard',
        scope,
        scopeSummary,
        pageSize: settings.pageSize,
        marginMm: settings.marginMm,
        wordCount: rendered.wordCount,
        warningsAccepted: 0
      },
      rendered.output,
      rendered.viewHtml
    )
    const listed = await compileStore.listCompiles()
    assert(report, listed.length === 1 && listed[0]?.id === meta.id, 'compile appears in the index')
    assert(report, existsSync(join(projectRoot, 'compiles', meta.id, 'output.txt')), 'output artifact on disk')
    const storedOutput = await compileStore.readCompileOutput(meta.id)
    assert(report, storedOutput.equals(rendered.output), 'stored output is byte-identical to the render')
    const storedView = await compileStore.getCompileView(meta.id)
    assert(report, storedView === rendered.viewHtml, 'stored view HTML is exactly what was compiled')

    section(report, 'deletion')
    // Deliberately spread from an existing meta: the stray id/createdAt this
    // carries must be ignored — the store owns identity. (This exact spread
    // once produced two index entries sharing one id.)
    const second = await compileStore.createCompile(
      { ...meta, name: 'Second' },
      Buffer.from('second', 'utf-8'),
      '<p>second</p>'
    )
    assert(report, second.id !== meta.id, 'store assigns identity; caller-supplied ids are ignored')
    await compileStore.deleteCompile(meta.id)
    const afterDelete = await compileStore.listCompiles()
    assert(report, afterDelete.length === 1 && afterDelete[0]?.id === second.id, 'delete removes only its own entry')
    assert(report, !existsSync(join(projectRoot, 'compiles', meta.id)), 'delete removes the artifact directory')
    const missing = await compileStore.getCompile(meta.id).then(
      () => false,
      () => true
    )
    assert(report, missing, 'a deleted compile throws rather than returning null')

    section(report, 'settings round-trip')
    const updated = await compileSettingsStore.updateCompileSettings({ ...settings, pageSize: 'trade6x9', format: 'pdf' })
    assert(report, updated.pageSize === 'trade6x9' && updated.format === 'pdf', 'update returns the stored values')
    const reread = await compileSettingsStore.getCompileSettings()
    assert(report, reread.pageSize === 'trade6x9' && reread.format === 'pdf', 'update persists across a fresh read')
    // Fields this version doesn't know about (future presets) must survive an
    // update — the store is read-modify-write over the whole file.
    const raw = JSON.parse(await readFile(join(projectRoot, 'compile.json'), 'utf-8')) as Record<string, unknown>
    await writeFile(join(projectRoot, 'compile.json'), JSON.stringify({ ...raw, presets: [{ id: 'p1' }] }))
    await compileSettingsStore.updateCompileSettings(reread)
    const preserved = JSON.parse(await readFile(join(projectRoot, 'compile.json'), 'utf-8')) as Record<string, unknown>
    assert(report, Array.isArray(preserved.presets), 'unknown compile.json fields survive a settings update')
    // A compile.json from before the preset-agnostic separation setting
    // holds bookDocumentBoundary instead; its values map across.
    const legacySettings = { ...(preserved.settings as Record<string, unknown>) }
    delete legacySettings.documentSeparation
    legacySettings.bookDocumentBoundary = 'scene-break'
    await writeFile(join(projectRoot, 'compile.json'), JSON.stringify({ ...preserved, settings: legacySettings }))
    const migrated = await compileSettingsStore.getCompileSettings()
    assert(report, migrated.documentSeparation === 'divider', "legacy bookDocumentBoundary 'scene-break' reads as 'divider'")
    const withDetails = await compileSettingsStore.updateCompileSettings({
      ...migrated,
      personalDetails: { name: 'A. Writer', contact: '01234 567890', address: '1 Test Lane' }
    })
    assert(
      report,
      withDetails.personalDetails.name === 'A. Writer' &&
        (await compileSettingsStore.getCompileSettings()).personalDetails.address === '1 Test Lane',
      'personal details persist through an update and a fresh read'
    )

    section(report, 'validation pass')
    // Seed one of everything the validator looks for: an empty chapter, a
    // duplicated chapter number, an out-of-order number on the appendix doc,
    // an empty footnote, a dangling manual mention, a broken continuity link,
    // and a missing author under manuscript format.
    const ch3 = await binderStore.createDocument(act.id, 'Chapter 3') // never saved → empty
    await binderStore.setChapterNumber(ch1.id, 2)
    await binderStore.setChapterNumber(ch2.id, 2)
    await binderStore.setChapterNumber(ch3.id, 5)
    await binderStore.setChapterNumber(notes.id, 1)
    await documentStore.saveDocument(ch2.id, '<p>Morning came grey.<sup data-footnote=""></sup></p>')
    await mentionStore.setManualMention(ch1.id, 'ghost-item', true)
    await timelineStore.createEntry({ description: 'The fire', whenText: '', itemIds: ['ghost-item'], documentId: ch1.id })
    await binderStore.setAuthorName(null)

    const full = await validateCompileScope({ mode: 'all' }, 'manuscript')
    const fullKinds = new Set(full.findings.map((f) => f.kind))
    assert(report, full.checkedDocuments === 4, `all four documents checked (${full.checkedDocuments})`)
    for (const kind of [
      'missing-author',
      'chapter-duplicate',
      'chapter-order',
      'chapter-gap',
      'empty-document',
      'empty-footnote',
      'dangling-mention',
      'timeline-broken-link'
    ] as const) {
      assert(report, fullKinds.has(kind), `finds ${kind}`)
    }
    const emptyFinding = full.findings.find((f) => f.kind === 'empty-document')
    assert(report, emptyFinding?.documentId === ch3.id, 'the empty-document finding jumps to the right document')

    // Standard format has no running header, so the author check is
    // manuscript-only.
    const standard = await validateCompileScope({ mode: 'all' }, 'standard')
    assert(
      report,
      !standard.findings.some((f) => f.kind === 'missing-author'),
      'missing author is only a finding under manuscript format'
    )

    // Scoped to Act One's real chapters: the appendix's out-of-order number,
    // and nothing else out of scope, may appear.
    const scoped = await validateCompileScope({ mode: 'selection', nodeIds: [act.id, ch1.id, ch2.id] }, 'standard')
    const scopedKinds = new Set(scoped.findings.map((f) => f.kind))
    assert(report, scoped.checkedDocuments === 2, `scoped checks cover only in-scope documents (${scoped.checkedDocuments})`)
    assert(report, scopedKinds.has('chapter-duplicate'), 'in-scope duplicate still found when scoped')
    assert(report, !scopedKinds.has('chapter-order'), 'the out-of-scope appendix cannot cause an order finding')
    assert(report, !scopedKinds.has('empty-document'), 'the out-of-scope empty chapter is not reported')

    // Accepted findings travel onto the stored record, verbatim.
    const waived = await compileStore.createCompile(
      {
        name: 'Waived',
        format: 'txt',
        stylePreset: 'standard',
        scope: { mode: 'all' },
        scopeSummary: { includedDocuments: 4, totalDocuments: 4 },
        pageSize: settings.pageSize,
        marginMm: settings.marginMm,
        wordCount: 9,
        warningsAccepted: scoped.findings.length,
        acceptedFindings: scoped.findings
      },
      Buffer.from('waived', 'utf-8'),
      '<p>waived</p>'
    )
    const storedWaived = await compileStore.getCompile(waived.id)
    assert(
      report,
      storedWaived.warningsAccepted === scoped.findings.length &&
        storedWaived.acceptedFindings?.[0]?.message === scoped.findings[0]?.message,
      'accepted findings round-trip on the stored record'
    )

    section(report, 'presets')
    const preset = await compileSettingsStore.savePreset({
      name: 'Query Package',
      scope: { mode: 'selection', nodeIds: [act.id, ch1.id] },
      format: 'docx',
      stylePreset: 'manuscript'
    })
    const presetsAfterSave = await compileSettingsStore.listPresets()
    assert(
      report,
      presetsAfterSave.length === 1 && presetsAfterSave[0]?.id === preset.id && presetsAfterSave[0]?.name === 'Query Package',
      'a saved preset lists back with its stored identity'
    )
    await compileSettingsStore.updateCompileSettings(await compileSettingsStore.getCompileSettings())
    assert(
      report,
      (await compileSettingsStore.listPresets()).length === 1,
      'presets survive a settings update (shared file, no clobber)'
    )
    await compileSettingsStore.deletePreset(preset.id)
    assert(report, (await compileSettingsStore.listPresets()).length === 0, 'a deleted preset is gone')

    section(report, 'front and back matter')
    await binderStore.setAuthorName('Tester') // restored — the title page seeds from it
    const frontId = await createFrontMatter()
    const backId = await createBackMatter()
    const treeAfter = (await binderStore.getState()).tree
    const matter = matterFolder(treeAfter)
    assert(report, matter?.children[0]?.id === frontId, 'front matter lands first inside Matter')
    assert(
      report,
      matter?.children[matter.children.length - 1]?.id === backId,
      'back matter lands at the end of Matter'
    )
    const frontFolder = matter?.children[0]
    const frontDocs = frontFolder?.children.map((c) => c.name) ?? []
    assert(
      report,
      JSON.stringify(frontDocs) === JSON.stringify(['Half Title', 'Title Page', 'Copyright', 'Dedication']),
      `front matter seeds its four documents in book order (${frontDocs.join(', ')})`
    )
    const titlePageId = frontFolder?.children[1]?.id ?? ''
    const titleHtml = await documentStore.loadDocument(titlePageId)
    assert(
      report,
      titleHtml.includes('Compile Test') && titleHtml.includes('by Tester'),
      'the title page is seeded from the live project name and author'
    )
    // Seeded content means freshly created front matter must not immediately
    // trip the empty-document check (validation now covers included Matter).
    const afterMatter = await validateCompileScope({ mode: 'all' }, 'standard')
    const frontChildIds = new Set(frontFolder?.children.map((c) => c.id))
    assert(
      report,
      !afterMatter.findings.some((f) => f.kind === 'empty-document' && f.documentId && frontChildIds.has(f.documentId)),
      'seeded front matter raises no empty-document findings'
    )

    note(report, `project root: ${projectRoot}`)
  } finally {
    await rm(projectRoot, { recursive: true, force: true })
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

  // Same convention as pdf.test.ts: Electron's main process stdout is not
  // attached to the parent console on Windows, so the runner reads this file.
  await writeFile(`${outDir}/report.txt`, summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

app.on('window-all-closed', () => {})

app.whenReady().then(() => void main())
