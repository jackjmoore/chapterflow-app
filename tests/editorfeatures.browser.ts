import { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { createEditorExtensions } from '../src/renderer/src/editorExtensions'
import { splitDocContent } from '../src/renderer/src/docSplit'

export interface Check {
  ok: boolean
  label: string
  detail?: string
}

/**
 * Exercises Split Document Here and document links against a real editor.
 *
 * The split's whole promise is that it happens at the schema level — a mark
 * spanning the boundary must close cleanly on one side and reopen on the
 * other. That is only checkable against the app's real schema with real node
 * boundaries, so like the revision suite these run in a browser window.
 */
function mount(html: string): { editor: Editor; teardown: () => void } {
  const element = document.createElement('div')
  element.className = 'editor'
  document.body.appendChild(element)
  const editor = new Editor({ element, extensions: createEditorExtensions(), content: html })
  return {
    editor,
    teardown: () => {
      editor.destroy()
      element.remove()
    }
  }
}

/** Document position of `needle`'s first character. */
function posOfText(doc: PMNode, needle: string): number {
  let found = -1
  doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.isText && node.text && node.text.includes(needle)) {
      found = pos + node.text.indexOf(needle)
      return false
    }
    return true
  })
  if (found < 0) throw new Error(`"${needle}" not in document`)
  return found
}

export function runChecks(): Check[] {
  const checks: Check[] = []
  const check = (ok: boolean, label: string, detail?: string): void => {
    checks.push({ ok, label, detail: ok ? undefined : detail })
  }

  const withEditor = (html: string, run: (editor: Editor) => void): void => {
    const { editor, teardown } = mount(html)
    try {
      run(editor)
    } finally {
      teardown()
    }
  }

  // ---- the headline case: a bold run spanning the split point ----
  withEditor('<p>alpha <strong>boldspans</strong> omega</p>', (editor) => {
    const { doc, schema } = editor.state
    const pos = posOfText(doc, 'boldspans') + 4 // bold|spans
    const split = splitDocContent(doc, pos, schema)
    check(!!split, 'a mid-mark split succeeds')
    check(
      split?.beforeHtml === '<p>alpha <strong>bold</strong></p>',
      'the first half closes the bold run cleanly',
      `before: ${split?.beforeHtml}`
    )
    check(
      split?.afterHtml === '<p><strong>spans</strong> omega</p>',
      'the second half reopens the bold run',
      `after: ${split?.afterHtml}`
    )
    // Beyond string equality: nothing was lost across the boundary.
    withEditor(split?.beforeHtml ?? '', (before) => {
      withEditor(split?.afterHtml ?? '', (after) => {
        const rejoined = before.state.doc.textContent + after.state.doc.textContent
        check(
          rejoined === doc.textContent,
          'the two halves rejoin to exactly the original text',
          `rejoined: ${rejoined}`
        )
        check(
          after.state.doc.textBetween(0, after.state.doc.content.size).startsWith('spans') &&
            after.getHTML() === split?.afterHtml,
          'the second half round-trips through a fresh editor unchanged',
          `got: ${after.getHTML()}`
        )
      })
    })
  })

  // ---- block-boundary splits: no artifact empty paragraphs ----
  withEditor('<h1>One</h1><p>Two</p>', (editor) => {
    const { doc, schema } = editor.state
    const atStartOfTwo = splitDocContent(doc, posOfText(doc, 'Two'), schema)
    check(
      atStartOfTwo?.beforeHtml === '<h1>One</h1>' && atStartOfTwo?.afterHtml === '<p>Two</p>',
      'a split at a block start cuts between blocks, no empty paragraph',
      `before: ${atStartOfTwo?.beforeHtml} after: ${atStartOfTwo?.afterHtml}`
    )
    const atEndOfOne = splitDocContent(doc, posOfText(doc, 'One') + 3, schema)
    check(
      atEndOfOne?.beforeHtml === '<h1>One</h1>' && atEndOfOne?.afterHtml === '<p>Two</p>',
      'a split at a block end lands on the same boundary',
      `before: ${atEndOfOne?.beforeHtml} after: ${atEndOfOne?.afterHtml}`
    )
  })

  // ---- nested structure: the blockquote splits, artifact removed ----
  withEditor('<blockquote><p>first</p><p>second</p></blockquote>', (editor) => {
    const { doc, schema } = editor.state
    const split = splitDocContent(doc, posOfText(doc, 'second'), schema)
    check(
      split?.beforeHtml === '<blockquote><p>first</p></blockquote>' &&
        split?.afterHtml === '<blockquote><p>second</p></blockquote>',
      'splitting inside a blockquote yields two clean blockquotes',
      `before: ${split?.beforeHtml} after: ${split?.afterHtml}`
    )
  })

  // ---- guards and naming ----
  withEditor('<p>only paragraph</p>', (editor) => {
    const { doc, schema } = editor.state
    check(splitDocContent(doc, 1, schema) === null, 'a split at the very start is refused')
    check(splitDocContent(doc, doc.content.size - 1, schema) === null, 'a split at the very end is refused')
  })
  withEditor('<p>intro</p><p>The next chapter begins here, in earnest.</p>', (editor) => {
    const { doc, schema } = editor.state
    const split = splitDocContent(doc, posOfText(doc, 'The next'), schema)
    check(
      split?.suggestedName === 'The next chapter begins here, in earnest.',
      'the new document is named from its first line',
      `got: ${split?.suggestedName}`
    )
  })

  // ---- document links: id-only storage, removable from a bare cursor ----
  withEditor('<p>see the fire chapter</p>', (editor) => {
    const from = posOfText(editor.state.doc, 'fire')
    editor.commands.setTextSelection({ from, to: from + 4 })
    editor.commands.setDocumentLink('target-123')
    const html = editor.getHTML()
    check(
      html.includes('data-doc-link="target-123"') && html.includes('doc-link-mark'),
      'a link stores the target document id as a mark',
      `html: ${html}`
    )
    const markAttrs = editor.state.doc.nodeAt(from)?.marks.find((m) => m.type.name === 'documentLink')?.attrs
    check(
      JSON.stringify(markAttrs) === JSON.stringify({ documentId: 'target-123' }),
      'the mark stores the id and nothing else — no copied name to go stale',
      `attrs: ${JSON.stringify(markAttrs)}`
    )
    // Round-trip through a fresh parse, then remove from a bare cursor.
    withEditor(html, (reparsed) => {
      const linkPos = posOfText(reparsed.state.doc, 'fire') + 2
      reparsed.commands.setTextSelection({ from: linkPos, to: linkPos })
      check(reparsed.isActive('documentLink'), 'a reloaded document still knows its link')
      reparsed.commands.unsetDocumentLink()
      check(
        !reparsed.getHTML().includes('data-doc-link'),
        'Remove Link works from a cursor inside the text, no selection needed',
        `html: ${reparsed.getHTML()}`
      )
    })
  })

  // ---- a split through linked text keeps the link on both halves ----
  withEditor('<p>before <span data-doc-link="t-9">linked text</span> after</p>', (editor) => {
    const { doc, schema } = editor.state
    const split = splitDocContent(doc, posOfText(doc, 'linked') + 6, schema)
    check(
      (split?.beforeHtml.match(/data-doc-link="t-9"/g)?.length ?? 0) === 1 &&
        (split?.afterHtml.match(/data-doc-link="t-9"/g)?.length ?? 0) === 1,
      'a split through a link leaves a working link in each half',
      `before: ${split?.beforeHtml} after: ${split?.afterHtml}`
    )
  })

  return checks
}
