import { DOMSerializer, Fragment, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { Transform, canSplit } from '@tiptap/pm/transform'

export interface DocumentSplit {
  beforeHtml: string
  afterHtml: string
  /** The after-half's first line, for naming the new document. */
  suggestedName: string
}

/**
 * Splits a document at a position into two complete, schema-valid documents.
 *
 * Everything happens at the ProseMirror node level, never on text: the
 * interior case runs the schema's own `split` transform (the same operation
 * pressing Enter performs), which closes and reopens every node and mark at
 * the boundary — a bold run spanning the split point becomes a bold run
 * ending the first half and another opening the second, automatically. Each
 * half is then serialized through the schema's DOMSerializer, so the HTML
 * written to both documents is exactly what the editor itself would save.
 * At no point does a string get cut.
 *
 * Returns null when either half would carry no real content (cursor at the
 * very start or end), or in the rare case the schema refuses the split.
 */
export function splitDocContent(doc: PMNode, pos: number, schema: Schema): DocumentSplit | null {
  const clamped = Math.max(0, Math.min(pos, doc.content.size))
  const $pos = doc.resolve(clamped)

  let workingDoc = doc
  let boundary: number
  // Set when the split transform had to run at a block edge, where it
  // manufactures an empty textblock on the named side of the seam — ours to
  // remove, since the user had no empty block there.
  let artifact: 'leading' | 'trailing' | null = null

  if ($pos.depth === 0) {
    // Node selection / gap cursor: already a top-level boundary.
    boundary = clamped
  } else if ($pos.parentOffset === 0 && clamped === $pos.start(1)) {
    // Start of a block that is itself the start of its whole top-level
    // ancestor chain: the boundary is simply before that ancestor.
    boundary = $pos.before(1)
  } else if ($pos.parentOffset === $pos.parent.content.size && clamped === $pos.end(1)) {
    boundary = $pos.after(1)
  } else {
    // Interior of a block (or the edge of a nested one): split the full
    // ancestor chain so the seam becomes a top-level boundary.
    if (!canSplit(doc, clamped, $pos.depth)) return null
    const tr = new Transform(doc).split(clamped, $pos.depth)
    workingDoc = tr.doc
    const $seam = workingDoc.resolve(tr.mapping.map(clamped, 1))
    boundary = $seam.depth === 0 ? tr.mapping.map(clamped, 1) : $seam.before(1)
    if ($pos.parentOffset === 0) artifact = 'trailing'
    else if ($pos.parentOffset === $pos.parent.content.size) artifact = 'leading'
  }

  let beforeFragment = workingDoc.content.cut(0, boundary)
  let afterFragment = workingDoc.content.cut(boundary)
  if (artifact === 'trailing') beforeFragment = withoutEdgeEmptyTextblock(beforeFragment, 'trailing')
  if (artifact === 'leading') afterFragment = withoutEdgeEmptyTextblock(afterFragment, 'leading')

  if (!fragmentHasContent(beforeFragment) || !fragmentHasContent(afterFragment)) return null

  return {
    beforeHtml: serializeFragment(beforeFragment, schema),
    afterHtml: serializeFragment(afterFragment, schema),
    suggestedName: firstLineOf(afterFragment) || 'Untitled'
  }
}

/** True when the fragment holds visible text or any non-text leaf (an image,
 *  a break, a footnote) — an empty paragraph alone is not content. */
function fragmentHasContent(fragment: Fragment): boolean {
  let found = false
  const scan = (children: Fragment): void => {
    children.forEach((child) => {
      if (found) return
      if (child.isText) {
        if (child.text && child.text.trim()) found = true
      } else if (child.isLeaf) {
        found = true
      } else {
        scan(child.content)
      }
    })
  }
  scan(fragment)
  return found
}

/** Removes the empty textblock the edge-split manufactured — and only that
 *  one, at the named edge, recursing into nesting when the seam sat inside a
 *  blockquote or list. Never called on interior splits, so a writer's own
 *  deliberately empty paragraphs are untouched. */
function withoutEdgeEmptyTextblock(fragment: Fragment, edge: 'leading' | 'trailing'): Fragment {
  if (fragment.childCount === 0) return fragment
  const index = edge === 'leading' ? 0 : fragment.childCount - 1
  const child = fragment.child(index)
  const children: PMNode[] = []
  fragment.forEach((node) => children.push(node))
  if (child.isTextblock && child.content.size === 0) {
    children.splice(index, 1)
  } else if (!child.isLeaf) {
    children[index] = child.copy(withoutEdgeEmptyTextblock(child.content, edge))
  }
  return Fragment.from(children)
}

function serializeFragment(fragment: Fragment, schema: Schema): string {
  const container = document.createElement('div')
  container.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(fragment))
  return container.innerHTML
}

/** The first textblock's text, trimmed to a name-sized length. */
function firstLineOf(fragment: Fragment): string {
  let line = ''
  const scan = (children: Fragment): void => {
    children.forEach((child) => {
      if (line) return
      if (child.isTextblock) {
        const text = child.textContent.trim()
        if (text) line = text
      } else if (!child.isLeaf) {
        scan(child.content)
      }
    })
  }
  scan(fragment)
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line
}
