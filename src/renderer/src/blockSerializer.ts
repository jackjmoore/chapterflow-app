import { DOMSerializer, type Node as PMNode, type Schema } from '@tiptap/pm/model'

const serializers = new WeakMap<Schema, DOMSerializer>()
/** Node → its HTML. ProseMirror nodes are immutable and an edit leaves every
 *  untouched node shared between the old document and the new one, so an
 *  entry here can never go stale: a changed block is a different object. */
const htmlByNode = new WeakMap<PMNode, string>()
let scratch: Document | null = null

/**
 * The document's top-level blocks as HTML, one string per block.
 *
 * Serializes only the blocks that changed since the last call and hands back
 * the same string object for every block that did not. That is what makes
 * pagination's per-pass diff essentially free on a long manuscript: on a
 * 100,000-word document, editor.getHTML() alone cost about 18ms per pass
 * because it rebuilt every one of a thousand paragraphs to notice that one
 * of them had a new word. Each block's HTML here is exactly what getHTML()
 * would emit for it — the same serializer, the same scratch document — so
 * joining the list reproduces getHTML() byte for byte.
 */
export function serializeTopLevelBlocks(doc: PMNode): string[] {
  const schema = doc.type.schema
  let serializer = serializers.get(schema)
  if (!serializer) {
    serializer = DOMSerializer.fromSchema(schema)
    serializers.set(schema, serializer)
  }
  if (!scratch) scratch = document.implementation.createHTMLDocument()

  const blocks: string[] = []
  doc.forEach((node) => {
    let html = htmlByNode.get(node)
    if (html === undefined) {
      const container = scratch!.createElement('div')
      container.appendChild(serializer!.serializeNode(node, { document: scratch! }))
      html = container.innerHTML
      htmlByNode.set(node, html)
    }
    blocks.push(html)
  })
  return blocks
}
