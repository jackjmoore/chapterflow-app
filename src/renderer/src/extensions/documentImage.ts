import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documentImage: {
      insertDocumentImage: (attrs: { imageId: string; src: string; alt?: string }) => ReturnType
    }
  }
}

/**
 * An image in the manuscript.
 *
 * Two attributes carry the identity, and the split matters: `imageId` is the
 * durable one — the file's name inside the project's own images folder, the
 * same portability contract storyBibleImageStore.ts already uses, so moving
 * or copying a project never breaks its pictures. `src` is a base64 data URI
 * resolved fresh at load time purely so the editor has something to paint;
 * it is stripped on save (see stripTransientImageSrc) rather than being
 * written into the document file, which would balloon every manuscript by
 * the full size of its images and put binary data in a diffable text file.
 */
export const DocumentImage = Node.create({
  name: 'documentImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-image-id'),
        renderHTML: (attributes) => ({ 'data-image-id': attributes.imageId })
      },
      alt: {
        default: '',
        parseHTML: (element) => element.getAttribute('alt') ?? '',
        renderHTML: (attributes) => ({ alt: attributes.alt ?? '' })
      },
      // Deliberately not serialized — see stripTransientImageSrc.
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('src'),
        renderHTML: (attributes) => (attributes.src ? { src: attributes.src } : {})
      }
    }
  },

  parseHTML() {
    return [{ tag: 'img[data-image-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'chf-document-image' })]
  },

  addCommands() {
    return {
      insertDocumentImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs })
    }
  }
})

/**
 * Removes the transient base64 `src` before a document is written to disk,
 * leaving only the durable `data-image-id`. Without this every save would
 * write megabytes of base64 into the .html file.
 */
export function stripTransientImageSrc(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) =>
    tag.replace(/\ssrc="data:[^"]*"/gi, '').replace(/\ssrc='data:[^']*'/gi, '')
  )
}

/** Every image id referenced by a document's saved HTML — used to resolve the
 *  data URIs the editor needs when a document is opened. */
export function referencedImageIds(html: string): string[] {
  const ids = new Set<string>()
  const pattern = /data-image-id="([^"]+)"/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) ids.add(match[1])
  return [...ids]
}

/** Paints resolved data URIs back onto the saved HTML so the editor can
 *  display the images. The inverse of stripTransientImageSrc. */
export function applyImageSources(html: string, sources: Record<string, string>): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const match = /data-image-id="([^"]+)"/i.exec(tag)
    const src = match ? sources[match[1]] : undefined
    if (!src) return tag
    const withoutSrc = tag.replace(/\ssrc="[^"]*"/gi, '')
    return withoutSrc.replace(/^<img\b/i, `<img src="${src}"`)
  })
}
