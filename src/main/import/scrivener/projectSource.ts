import { readFile, readdir, stat } from 'fs/promises'
import { join, relative, sep } from 'path'
import JSZip from 'jszip'

/**
 * Read-only access to a Scrivener project, whether it arrived as a folder or
 * as one of Scrivener's own ZIP backups.
 *
 * The rest of the importer never learns which it got. Two rules hold for both:
 * paths are always posix-style and relative to the project root, and nothing
 * here ever writes — an import must leave the source byte-identical.
 *
 * jszip is already a dependency of the app (it is how docxToBlocks opens a
 * .docx), so this adds nothing to fold in later.
 */
export interface ProjectSource {
  /** Something human-readable for reports. Never a full filesystem path. */
  label: string
  kind: 'directory' | 'zip'
  /** Every file in the project, posix-relative to its root. */
  list(): Promise<string[]>
  exists(path: string): Promise<boolean>
  read(path: string): Promise<Buffer>
  readText(path: string): Promise<string>
  /** Byte size without reading the whole entry, where that is possible. */
  size(path: string): Promise<number>
}

const posix = (p: string): string => p.split(sep).join('/')

export function directorySource(root: string, label: string): ProjectSource {
  let cache: string[] | null = null

  async function walk(dir: string, out: string[], depth: number): Promise<void> {
    if (depth > 12) return
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(dir, name)
      const info = await stat(full).catch(() => null)
      if (!info) continue
      if (info.isDirectory()) await walk(full, out, depth + 1)
      else out.push(posix(relative(root, full)))
    }
  }

  return {
    label,
    kind: 'directory',
    async list() {
      if (!cache) {
        const out: string[] = []
        await walk(root, out, 0)
        cache = out.sort()
      }
      return cache
    },
    async exists(path) {
      return (await stat(join(root, path)).catch(() => null)) !== null
    },
    read(path) {
      return readFile(join(root, path))
    },
    readText(path) {
      return readFile(join(root, path), 'utf-8')
    },
    async size(path) {
      const info = await stat(join(root, path)).catch(() => null)
      return info ? info.size : 0
    }
  }
}

/**
 * A ZIP source, rebased onto the project root inside it.
 *
 * Scrivener's own backups wrap the whole thing in a single top-level
 * `Name.scriv/` directory, so without rebasing every path would carry that
 * prefix and nothing would resolve. Detected rather than assumed: an archive
 * zipped from inside the project has no wrapper.
 */
export async function zipSource(buffer: Buffer, label: string): Promise<ProjectSource> {
  const zip = await JSZip.loadAsync(buffer)

  const all: string[] = []
  zip.forEach((path, entry) => {
    if (!entry.dir) all.push(path)
  })

  // Find the shortest prefix that holds the .scrivx, and rebase onto it.
  let prefix = ''
  const manifest = all.find((p) => p.toLowerCase().endsWith('.scrivx'))
  if (manifest) {
    const slash = manifest.lastIndexOf('/')
    prefix = slash === -1 ? '' : manifest.slice(0, slash + 1)
  }

  const rebased = all
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length))
    .filter((p) => p !== '' && !p.startsWith('__MACOSX/') && !p.endsWith('/.DS_Store'))
    .sort()

  const entryFor = (path: string): JSZip.JSZipObject | null => zip.file(prefix + path)

  async function read(path: string): Promise<Buffer> {
    const entry = entryFor(path)
    if (!entry) throw new Error('not in archive: ' + path)
    return Buffer.from(await entry.async('nodebuffer'))
  }

  return {
    label,
    kind: 'zip',
    async list() {
      return rebased
    },
    async exists(path) {
      return entryFor(path) !== null
    },
    read,
    async readText(path) {
      return (await read(path)).toString('utf-8')
    },
    async size(path) {
      const entry = entryFor(path)
      if (!entry) return 0
      // jszip does not expose uncompressed size without inflating, and these
      // are small enough that measuring honestly beats guessing.
      return (await entry.async('nodebuffer')).length
    }
  }
}

/** Picks the right source for whatever was dropped in. */
export async function openProject(path: string, label: string): Promise<ProjectSource> {
  const info = await stat(path)
  if (info.isDirectory()) return directorySource(path, label)
  return zipSource(await readFile(path), label)
}
