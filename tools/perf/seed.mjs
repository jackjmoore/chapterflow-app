// Builds a scratch ChapterFlow project whose active document holds 100,000+
// words, for pagination performance measurement. Deterministic, so the
// before/after runs measure the same document.
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const [, , base] = process.argv
if (!base) { console.error('usage: node seed.mjs <base dir>'); process.exit(2) }

const DOC_ID = 'perf-100k-doc'
const projectDir = resolve(base, 'project')
const userDataDir = resolve(base, 'userdata')
await mkdir(join(projectDir, 'documents'), { recursive: true })
await mkdir(userDataDir, { recursive: true })

// A small LCG so the prose is varied but identical on every run.
let seed = 42
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = (arr) => arr[Math.floor(rand() * arr.length)]

const openers = ['The lamp guttered', 'She waited', 'Ivo turned the page', 'Nobody spoke', 'The tide came in', 'Wren folded the chart', 'A gull settled', 'The harbour lay still', 'He counted the steps', 'Rain found the window']
const middles = ['and went out again', 'in the dark of the stairwell', 'as if the room had asked a question', 'while the kettle ticked', 'and the light moved across the water', 'without looking up from the log', 'and said nothing for a long while', 'though the door was already open', 'and the clock in the hall ran slow', 'and the sea kept its own account']
const closers = ['before anyone noticed.', 'and that was the end of it.', 'which was not what she had meant.', 'until the bell rang twice.', 'and the night went on.', 'as it always had.', 'and he let it.', 'for reasons she never gave.', 'and the town slept through it.', 'and the tide turned.']

function sentence() {
  const s = `${pick(openers)} ${pick(middles)}, ${pick(closers)}`
  return rand() < 0.08 ? s.replace(/(\w+ \w+),/, '<em>$1</em>,') : s
}
function paragraph() {
  const n = 3 + Math.floor(rand() * 7)
  return `<p>${Array.from({ length: n }, sentence).join(' ')}</p>`
}

let html = ''
let words = 0
let para = 0
while (words < 100_000) {
  if (para % 45 === 0) html += `<h2>Chapter ${Math.floor(para / 45) + 1}</h2>`
  const p = paragraph()
  html += p
  words += p.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length
  para += 1
}
await writeFile(join(projectDir, 'documents', `${DOC_ID}.html`), html)
console.log(`document: ${words.toLocaleString()} words in ${para} paragraphs, ${(html.length / 1024).toFixed(0)} KB html`)

const doc = (id, name) => ({ id, type: 'document', name, collapsed: false, synopsis: '', notes: '', statusId: null, tagIds: [], wordTarget: null, children: [] })
await writeFile(join(projectDir, 'documents', 'perf-small-doc.html'), '<p>A short second document.</p>')
await writeFile(join(projectDir, 'binder.json'), JSON.stringify({
  version: 1,
  tree: [doc(DOC_ID, 'The Long Manuscript'), doc('perf-small-doc', 'Notes')],
  lastOpenDocumentId: DOC_ID,
  wordCountBaseline: null,
  projectName: 'Pagination Perf',
  viewState: { activeView: 'editor', manuscriptView: 'editor', outlinerSort: null, outlinerFilter: '', statusFilter: [], tagFilter: [], referenceDocumentId: null, splitViewLocked: false, splitViewSyncScroll: false },
  statuses: [], tags: [], savedViews: [], overusedIgnoreList: [], authorName: null,
  projectWordTarget: null, projectDeadline: null, projectTargetStartDate: null, projectTargetStartCount: null
}))
await writeFile(join(userDataDir, 'preferences.json'), JSON.stringify({
  theme: 'dark', sidebarWidth: 260, sidebarCollapsed: false, pageSize: 'a4', pageMarginMm: 25, zoomPercent: 100,
  pageViewMode: 'paginated', projectRoot: projectDir, skipDashboardOnLaunch: true
}))
console.log(`seeded ${base}`)
