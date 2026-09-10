/**
 * Compile scope semantics — the pure-shared half of the compile feature.
 *
 * filterTreeByScope is the one place scope meaning lives: everything
 * downstream (the export renderers, the stored artifact, the history record)
 * just consumes the pruned tree through the unchanged binder walk. So these
 * tests pin the semantics themselves — subtree exclusion, checked-set
 * fidelity for bare divider folders, stale-id tolerance — and the composition
 * with flattenBinderOutline that the export engine actually sees.
 */
import {
  DRAFT_FOLDER_ID,
  MATTER_FOLDER_ID,
  NOTES_FOLDER_ID,
  draftChildren,
  flattenBinderOutline,
  isInDraft,
  type BinderNode,
  type DocumentNode,
  type FolderNode
} from '../src/shared/binder'
import { applyPersonalDetails, filterTreeByScope, summarizeScope, type CompileScope } from '../src/shared/compile'
import { chapterNumberFindings, type ChapterCheckDoc } from '../src/shared/compileValidation'
import { assert, createReport, note, section, summarize } from './harness'

function doc(id: string, name: string, children: BinderNode[] = []): DocumentNode {
  return {
    id,
    type: 'document',
    name,
    collapsed: false,
    synopsis: '',
    notes: '',
    statusId: null,
    tagIds: [],
    wordTarget: null,
    chapterNumber: null,
    children
  }
}

function folder(id: string, name: string, children: BinderNode[] = []): FolderNode {
  return { id, type: 'folder', name, collapsed: false, children }
}

/** The shapes scope has to handle: nested acts, a document with document
 *  children, a childless divider folder, and an excludable appendix. */
function buildTree(): BinderNode[] {
  return [
    folder('f1', 'Act One', [doc('d1', 'Chapter 1'), doc('d2', 'Chapter 2', [doc('d2a', 'Scene A')])]),
    folder('f2', 'Act Two', [doc('d3', 'Chapter 3')]),
    folder('f3', 'Part II'),
    folder('f4', 'Appendix', [doc('d4', 'Notes')])
  ]
}

function selection(...nodeIds: string[]): CompileScope {
  return { mode: 'selection', nodeIds }
}

/** Every node name in walk order — the shape most assertions care about. */
function names(tree: BinderNode[]): string[] {
  return flattenBinderOutline(tree).map((entry) => entry.title)
}

function main(): void {
  const report = createReport()
  const tree = buildTree()
  const before = JSON.stringify(tree)

  section(report, 'all mode')
  assert(report, filterTreeByScope(tree, { mode: 'all' }) === tree, 'returns the tree itself, unfiltered')
  assert(
    report,
    summarizeScope(tree, { mode: 'all' }).includedDocuments === 5 &&
      summarizeScope(tree, { mode: 'all' }).totalDocuments === 5,
    'summary counts every document (5 of 5)'
  )

  section(report, 'selection pruning')
  const actOneOnly = filterTreeByScope(tree, selection('f1', 'd1'))
  assert(
    report,
    names(actOneOnly).join('|') === 'Act One|Chapter 1',
    `checked nodes and nothing else survive (got ${names(actOneOnly).join('|')})`
  )
  const keptParentOnly = filterTreeByScope(tree, selection('f1', 'd2'))
  assert(
    report,
    names(keptParentOnly).join('|') === 'Act One|Chapter 2',
    'a checked document keeps only its checked children (Scene A dropped)'
  )
  const withGhost = filterTreeByScope(tree, selection('f1', 'd1', 'ghost-id'))
  assert(
    report,
    names(withGhost).join('|') === 'Act One|Chapter 1',
    'ids that no longer resolve are ignored (stale preset tolerance)'
  )

  section(report, 'subtree exclusion')
  const orphanChild = filterTreeByScope(tree, selection('f1', 'd2a'))
  assert(
    report,
    !names(orphanChild).includes('Scene A'),
    'a checked child under an unchecked parent is excluded — the parent wins'
  )
  assert(
    report,
    names(orphanChild).join('|') === 'Act One',
    'the checked ancestor itself still appears (as a bare divider)'
  )

  section(report, 'divider folders')
  const withDivider = filterTreeByScope(tree, selection('f2', 'd3', 'f3'))
  assert(
    report,
    names(withDivider).join('|') === 'Act Two|Chapter 3|Part II',
    'a checked childless folder survives a partial compile as a heading'
  )
  const withoutDivider = filterTreeByScope(tree, selection('f2', 'd3'))
  assert(
    report,
    !names(withoutDivider).includes('Part II'),
    'an unchecked childless folder does not'
  )

  section(report, 'composition with the binder walk')
  const outline = flattenBinderOutline(filterTreeByScope(tree, selection('f1', 'd2', 'd2a')))
  assert(
    report,
    outline.map((e) => `${e.title}:${e.level}`).join('|') === 'Act One:1|Chapter 2:2|Scene A:3',
    'pruning preserves each survivor’s depth and order'
  )
  assert(
    report,
    outline.filter((e) => e.isDocument).every((e) => e.id !== null),
    'document entries keep their ids for content loading'
  )

  section(report, 'summary and purity')
  const partial = summarizeScope(tree, selection('f1', 'd1'))
  assert(
    report,
    partial.includedDocuments === 1 && partial.totalDocuments === 5,
    `partial scope summarizes as 1 of 5 (got ${partial.includedDocuments} of ${partial.totalDocuments})`
  )
  const empty = summarizeScope(tree, selection('f3'))
  assert(report, empty.includedDocuments === 0, 'a divider-only scope counts zero documents')
  assert(report, JSON.stringify(tree) === before, 'filtering never mutates the input tree')
  note(report, 'scope semantics: include-list of checked node ids, ancestors win, folders derived only by their own checkmark')

  section(report, 'structural folder helpers')
  const structured: BinderNode[] = [
    { id: DRAFT_FOLDER_ID, type: 'folder', name: 'Draft', collapsed: false, children: [doc('m1', 'Chapter 1')] },
    { id: NOTES_FOLDER_ID, type: 'folder', name: 'Notes', collapsed: false, children: [doc('n1', 'Worldbuilding')] },
    { id: MATTER_FOLDER_ID, type: 'folder', name: 'Matter', collapsed: false, children: [doc('t1', 'Title Page')] }
  ]
  assert(
    report,
    draftChildren(structured).length === 1 && draftChildren(structured)[0].id === 'm1',
    'draftChildren returns the manuscript forest, not the whole tree'
  )
  assert(report, isInDraft(structured, 'm1'), 'a Draft document is in the manuscript')
  assert(report, !isInDraft(structured, 'n1') && !isInDraft(structured, 't1'), 'Notes and Matter documents are not')
  assert(
    report,
    draftChildren(tree) === tree && isInDraft(tree, 'd1'),
    'a bare tree without structural folders keeps its old whole-tree meaning'
  )
  assert(
    report,
    flattenBinderOutline(draftChildren(structured))[0]?.level === 1,
    'manuscript walks keep their heading levels — Draft never becomes a heading'
  )

  section(report, 'chapter numbering rules')
  const chapters = (...numbers: (number | null)[]): ChapterCheckDoc[] =>
    numbers.map((chapterNumber, i) => ({ id: `c${i}`, name: `Doc ${i}`, chapterNumber }))

  assert(report, chapterNumberFindings(chapters(null, null, null)).length === 0, 'an unnumbered manuscript raises nothing')
  assert(report, chapterNumberFindings(chapters(null, 3, null)).length === 0, 'a single numbered document raises nothing')
  assert(report, chapterNumberFindings(chapters(1, null, 2, null, 3)).length === 0, 'a clean sequence with unnumbered scenes between raises nothing')

  const duplicate = chapterNumberFindings(chapters(6, 7, 7))
  assert(
    report,
    duplicate.length === 1 && duplicate[0].kind === 'chapter-duplicate' && duplicate[0].documentId === 'c2',
    `a repeated number is one finding, jumping to the later document (${duplicate[0]?.message})`
  )
  assert(report, duplicate[0].message.includes('7') && duplicate[0].message.includes('“Doc 1”'), 'the duplicate message names the number and the documents')

  const disorder = chapterNumberFindings(chapters(1, 3, 2))
  assert(
    report,
    disorder.some((f) => f.kind === 'chapter-order' && f.documentId === 'c2'),
    `a number running backwards against binder order is flagged (${disorder.map((f) => f.kind).join(', ')})`
  )

  const gap = chapterNumberFindings(chapters(1, 2, 4))
  assert(
    report,
    gap.length === 1 && gap[0].kind === 'chapter-gap' && gap[0].message.includes('2 to 4'),
    `a skipped number is flagged (${gap[0]?.message})`
  )

  const messy = chapterNumberFindings(chapters(2, 2, 5, 1))
  const kinds = messy.map((f) => f.kind).sort()
  assert(
    report,
    JSON.stringify(kinds) === JSON.stringify(['chapter-duplicate', 'chapter-gap', 'chapter-order']),
    `compound problems each get their own finding (${kinds.join(', ')})`
  )

  section(report, 'personal details substitution')
  const details = { name: 'A. Writer', contact: '01234 567890', address: '1 Test Lane\nTestville' }
  assert(
    report,
    applyPersonalDetails('<p>{{name}}</p><p>{{ contact }}</p>', details) ===
      '<p>A. Writer</p><p>01234 567890</p>',
    'markers substitute, whitespace inside braces tolerated'
  )
  assert(
    report,
    applyPersonalDetails('<p>{{address}}</p>', details) === '<p>1 Test Lane</p><p>Testville</p>',
    'multi-line values substitute as separate paragraphs'
  )
  assert(
    report,
    applyPersonalDetails('<p>{{name}}</p>', { name: '<b>x</b>', contact: '', address: '' }) ===
      '<p>&lt;b&gt;x&lt;/b&gt;</p>',
    'stored values are escaped, never injected as markup'
  )
  assert(
    report,
    applyPersonalDetails('<p>{{contact}}</p><p>{{other}}</p>', { name: '', contact: '', address: '' }) ===
      '<p></p><p>{{other}}</p>',
    'an unset detail substitutes as nothing; unknown markers are left alone'
  )

  console.log(summarize(report))
  if (report.failures > 0) process.exitCode = 1
}

main()
