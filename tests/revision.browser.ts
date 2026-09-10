import { Editor } from '@tiptap/core'
import { createEditorExtensions } from '../src/renderer/src/editorExtensions'
import { RevisionHighlight } from '../src/renderer/src/extensions/revisionHighlight'
import { computeRevisionDiff, type RevisionDiff } from '../src/renderer/src/revisionDiff'

export interface Check {
  ok: boolean
  label: string
  detail?: string
}

/**
 * Exercises revision mode against a real editor.
 *
 * The diff algorithm itself is jsdiff's and needs no testing here. What does
 * need testing is the half this feature adds: turning offsets into a flat
 * string back into positions in a live ProseMirror document. That mapping is
 * only correct against a real schema with real node boundaries, which is why
 * these run in a browser window rather than as plain unit tests — and it is
 * exactly where an off-by-one lands highlights on the wrong words.
 */
function mount(html: string): { editor: Editor; teardown: () => void } {
  const element = document.createElement('div')
  element.className = 'editor'
  document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [...createEditorExtensions(), RevisionHighlight],
    content: html
  })
  return {
    editor,
    teardown: () => {
      editor.destroy()
      element.remove()
    }
  }
}

/** The text each addition decoration actually covers, read back out of the
 *  document — what the reader sees highlighted, not what the diff claims. */
function coveredText(editor: Editor, diff: RevisionDiff): string {
  return diff.additions.map((a) => editor.state.doc.textBetween(a.from, a.to, '\n', '\n')).join(' | ')
}

export function runChecks(): Check[] {
  const checks: Check[] = []
  const check = (ok: boolean, label: string, detail?: string): void => {
    checks.push({ ok, label, detail: ok ? undefined : detail })
  }

  const withDocs = (snapshot: string, current: string, run: (editor: Editor, diff: RevisionDiff) => void): void => {
    const { editor, teardown } = mount(current)
    try {
      run(editor, computeRevisionDiff(snapshot, editor.state.doc))
    } finally {
      teardown()
    }
  }

  withDocs('<p>The cat sat on the mat.</p>', '<p>The cat sat quietly on the mat.</p>', (editor, diff) => {
    const covered = coveredText(editor, diff)
    check(covered.includes('quietly'), 'an inserted word is the text actually highlighted', `covered: ${covered}`)
    check(!covered.includes('The cat sat on'), 'the highlight does not spill into unchanged text', `covered: ${covered}`)
    check(diff.deletions.length === 0, 'a pure insertion reports no deletions', `got ${diff.deletions.length}`)
  })

  withDocs('<p>The cat sat quietly on the mat.</p>', '<p>The cat sat on the mat.</p>', (editor, diff) => {
    const removed = diff.deletions.map((d) => d.text).join(' | ')
    check(removed.includes('quietly'), 'a removed word is carried in the deletion', `removed: ${removed}`)
    check(diff.additions.length === 0, 'a pure deletion reports no additions', `got ${diff.additions.length}`)
    const pos = diff.deletions[0]?.pos ?? -1
    check(
      pos > 0 && pos <= editor.state.doc.content.size,
      'the deletion anchors inside the document, not at position zero',
      `pos ${pos} of ${editor.state.doc.content.size}`
    )
  })

  withDocs('<p>Identical text here.</p>', '<p>Identical text here.</p>', (_editor, diff) => {
    check(!diff.hasChanges, 'identical content reports no changes')
    check(diff.additions.length === 0 && diff.deletions.length === 0, 'and carries no stray segments')
  })

  // The case a naive offset map gets wrong: positions past a block boundary
  // drift by one per block crossed.
  withDocs(
    '<p>First paragraph.</p><p>Second paragraph.</p>',
    '<p>First paragraph.</p><p>Second wonderful paragraph.</p>',
    (editor, diff) => {
      const covered = coveredText(editor, diff)
      check(
        covered.includes('wonderful'),
        'an addition in a later block is not off by the block boundary',
        `covered: ${covered}`
      )
    }
  )

  // Marks split one paragraph into several text nodes; a range spanning them
  // must still resolve.
  withDocs('<p>Plain words only.</p>', '<p>Plain <strong>bold</strong> words only.</p>', (editor, diff) => {
    const covered = coveredText(editor, diff)
    check(covered.includes('bold'), 'an addition across a mark boundary resolves', `covered: ${covered}`)
  })

  withDocs('<p>Keep this. Remove this tail.</p>', '<p>Keep this.</p>', (editor, diff) => {
    const size = editor.state.doc.content.size
    check(diff.deletions.length > 0, 'a deletion at the very end is reported')
    check(
      diff.deletions.every((d) => d.pos >= 0 && d.pos <= size),
      'a tail deletion stays inside the document bounds',
      `size ${size}, positions ${JSON.stringify(diff.deletions.map((d) => d.pos))}`
    )
  })

  withDocs('<p>She walked slowly toward the door.</p>', '<p>She strode quickly toward the door.</p>', (editor, diff) => {
    const covered = coveredText(editor, diff)
    const removed = diff.deletions.map((d) => d.text).join(' ')
    check(covered.includes('strode'), 'a reword marks the new wording added', `covered: ${covered}`)
    check(removed.includes('walked'), 'a reword marks the old wording deleted', `removed: ${removed}`)
  })

  // The whole premise of the feature: it is a rendering layer, so none of it
  // may reach the document that gets saved.
  {
    const { editor, teardown } = mount('<p>After text entirely.</p>')
    try {
      editor.commands.setRevisionDiff(computeRevisionDiff('<p>Before text.</p>', editor.state.doc))
      const html = editor.getHTML()
      check(!html.includes('chf-revision'), 'revision markup never reaches getHTML()', html)
      check(!html.includes('Before text'), 'deleted text is never serialized back in', html)
    } finally {
      teardown()
    }
  }

  // Repainting must not become something the writer has to undo through.
  {
    const { editor, teardown } = mount('<p>Original.</p>')
    try {
      editor.commands.insertContent(' Typed addition.')
      const diff = computeRevisionDiff('<p>Original.</p>', editor.state.doc)
      editor.commands.setRevisionDiff(diff)
      editor.commands.setRevisionDiff(diff)
      editor.commands.setRevisionDiff(null)
      editor.commands.undo()
      const afterUndo = editor.getHTML()
      check(
        !afterUndo.includes('Typed addition'),
        'one undo reverses the edit, not a decoration repaint',
        `after undo: ${afterUndo}`
      )
    } finally {
      teardown()
    }
  }

  // Highlights must survive editing elsewhere without a recompute, or they
  // would slide off their words between debounced passes.
  {
    const { editor, teardown } = mount('<p>Alpha inserted beta.</p>')
    try {
      const diff = computeRevisionDiff('<p>Alpha beta.</p>', editor.state.doc)
      editor.commands.setRevisionDiff(diff)
      // Type at the very start; every stored position shifts right.
      editor.commands.setTextSelection(1)
      editor.commands.insertContent('XX ')
      const remapped = computeRevisionDiff('<p>Alpha beta.</p>', editor.state.doc)
      const covered = coveredText(editor, remapped)
      check(covered.includes('inserted'), 'highlights still cover their words after an edit before them', `covered: ${covered}`)
    } finally {
      teardown()
    }
  }

  return checks
}
