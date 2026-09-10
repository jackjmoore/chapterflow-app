import { Tokenize } from 'rtf-stream-parser'
import type { Block, Run, Align } from '../../../src/main/export/htmlToBlocks'
import type { ImportWarningKind } from '../../../src/shared/import'
import { decodeBytes, encodingFor } from './codepage'
import { stripMarkers, styleTreatment } from './scrivenerStyles'

/**
 * RTF to the app's Block model.
 *
 * rtf-stream-parser's Tokenize owns the bytes — group nesting, control words
 * and their parameters, and \binN and \'XX as opaque data rather than markup
 * to be scanned. Everything above that is here, because none of it is
 * something a generic tokenizer can know: which destinations to skip and
 * which to keep, RTF's group-scoped property inheritance, the \ucN
 * fallback-skip rule, and the mapping onto Block/Run.
 *
 * The output contract is the one every importer in this app already has:
 * produce Block[], hand it to blocksToHtml(..., { paragraphWrappedNodes:
 * true }), and an imported document has the same shape a natively created one
 * would. Anything the Block model cannot express is tallied, never dropped in
 * silence.
 */

// Not exported by the package, so named here. Verified against the real token
// stream — see probe-tokenizer.cjs.
const GROUP_START = 0
const GROUP_END = 1
const CONTROL = 2
const TEXT = 3

interface RtfToken {
  type: number
  word?: string
  param?: number
  data?: Buffer | Uint8Array
}

/**
 * Two warning kinds beyond what src/shared/import.ts defines today. Kept
 * local while this lives outside the app; folding in means adding both to
 * ImportWarningKind and IMPORT_WARNING_LABELS, which TypeScript forces to
 * happen together since the labels are a Record over the union.
 */
export type LabWarningKind = ImportWarningKind | 'annotationsDropped' | 'textEncodingFallback'

export interface RtfParseResult {
  blocks: Block[]
  warnings: Partial<Record<LabWarningKind, number>>
}

export interface RtfOptions {
  /**
   * Scrivener style index -> style name, for this document.
   *
   * Built by the caller from the document's `content.styles` sidecar resolved
   * through the project's `Files/styles.xml`. Absent for a plain .rtf, in
   * which case the inline markers are still stripped — they are never text —
   * but carry no meaning.
   */
  styleNames?: Map<number, string>
}

class WarningTally {
  private counts = new Map<LabWarningKind, number>()
  add(kind: LabWarningKind, n = 1): void {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + n)
  }
  get result(): Partial<Record<LabWarningKind, number>> {
    return Object.fromEntries(this.counts) as Partial<Record<LabWarningKind, number>>
  }
}

/** Character formatting. Group-scoped: `{` copies it, `}` restores it. */
interface CharFmt {
  bold: boolean
  italic: boolean
  underline: boolean
  color?: string
  highlight?: string
  /** \v — hidden text is dropped rather than rendered. */
  hidden: boolean
  /** Strikethrough, superscript, small caps: real formatting the editor
   *  schema has no node for. Tallied once per run that carries it. */
  unsupported: boolean
}

/** Paragraph formatting. Also group-scoped — the spec treats both the same,
 *  and conflating that is a classic source of bleed between paragraphs. */
interface ParaFmt {
  align?: Align
  list: 'none' | 'bullet' | 'ordered'
  listLevel: number
  outlineLevel: number | null
  inTable: boolean
}

/** What the current group is for. Inherited by child groups. */
type Destination = 'body' | 'skip' | 'colortbl' | 'listtext'

interface Frame {
  char: CharFmt
  para: ParaFmt
  dest: Destination
  /** \ucN — how many items of ANSI fallback follow each \uN. Group-scoped. */
  uc: number
  /** True until the group's first real control word: a destination is only a
   *  destination at the head of its group. */
  fresh: boolean
  /** \* seen — the next control word names an ignorable destination. */
  sawStar: boolean
}

const freshChar = (): CharFmt => ({
  bold: false,
  italic: false,
  underline: false,
  hidden: false,
  unsupported: false
})

const freshPara = (): ParaFmt => ({
  list: 'none',
  listLevel: 0,
  outlineLevel: null,
  inTable: false
})

const ALIGN_MAP: Record<string, Align> = {
  ql: 'left',
  qc: 'center',
  qr: 'right',
  qj: 'justify',
  qd: 'justify'
}

/**
 * Control words that produce a character. They arrive as CONTROL tokens, not
 * TEXT — the tokenizer names them but does not know they are text. Omitting
 * these deletes every curly quote and dash in a manuscript.
 */
const CHAR_WORDS: Record<string, string> = {
  emdash: '—',
  endash: '–',
  bullet: '•',
  lquote: '‘',
  rquote: '’',
  ldblquote: '“',
  rdblquote: '”',
  tab: ' ',
  enspace: ' ',
  emspace: ' ',
  qmspace: ' ',
  // Control symbols.
  '~': ' ',
  _: '-',
  '-': '',
  '\\': '\\',
  '{': '{',
  '}': '}',
  ':': '',
  zwj: '',
  zwnj: '',
  ltrmark: '',
  rtlmark: ''
}

/** Destinations whose contents never reach the prose. */
const SKIP_DESTINATIONS = new Set([
  'fonttbl',
  'filetbl',
  'stylesheet',
  'info',
  'generator',
  'themedata',
  'colorschememapping',
  'datastore',
  'latentstyles',
  'rsidtbl',
  'template',
  'pgdsctbl',
  'xmlnstbl',
  'panose',
  'falt',
  'bkmkstart',
  'bkmkend',
  'listtable',
  'listoverridetable',
  'pn',
  'upr',
  'nesttableprops',
  'do',
  'fldinst',
  'ftnsep',
  'ftnsepc',
  'ftncn',
  'aftnsep',
  'aftnsepc',
  'aftncn',
  'header',
  'headerl',
  'headerr',
  'headerf',
  'footer',
  'footerl',
  'footerr',
  'footerf'
])

/** Destinations that are skipped AND worth telling the writer about. */
const TALLIED_DESTINATIONS: Record<string, LabWarningKind> = {
  pict: 'imagesDropped',
  shppict: 'imagesDropped',
  nonshppict: 'imagesDropped',
  shpinst: 'imagesDropped',
  blipuid: 'imagesDropped',
  object: 'imagesDropped',
  objdata: 'imagesDropped',
  footnote: 'footnotesDropped',
  annotation: 'commentsDropped',
  atnid: 'commentsDropped',
  atnauthor: 'commentsDropped',
  atnref: 'commentsDropped',
  atndate: 'commentsDropped',
  atrfstart: 'commentsDropped',
  atrfend: 'commentsDropped',
  chatn: 'commentsDropped'
}

/** Character-formatting control words with no schema equivalent. */
const UNSUPPORTED_MARKS = new Set([
  'strike',
  'striked',
  'sub',
  'super',
  'scaps',
  'caps',
  'outl',
  'shad',
  'embo',
  'impr'
])

/** Set on essentially every run by every writer. Ignored deliberately, and
 *  deliberately NOT tallied — a five-figure warning count says nothing. */
const IGNORED_WORDS = new Set([
  'fs',
  'f',
  'cb',
  'lang',
  'langfe',
  'langnp',
  'langfenp',
  'noproof',
  'kerning',
  'expnd',
  'expndtw',
  'charscalex',
  'li',
  'fi',
  'ri',
  'sa',
  'sb',
  'sl',
  'slmult',
  'sect',
  'sectd',
  'itap',
  'trowd',
  'nowidctlpar',
  'widctlpar',
  'hyphpar',
  'keep',
  'keepn',
  'rtlch',
  'ltrch',
  'rtlpar',
  'ltrpar',
  'deff',
  'deflang',
  'deflangfe',
  'viewkind',
  'uc1',
  'rtf',
  'ansi',
  'mac',
  'pc',
  'pca',
  'nouicompat',
  'formshade',
  'stshfdbch',
  'stshfloch',
  'stshfhich',
  'stshfbi'
])

function toBytes(data: Buffer | Uint8Array | undefined): number[] {
  if (!data) return []
  return Array.from(data)
}

function hexColor(r: number, g: number, b: number): string {
  const h = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * Reads the whole token stream into memory first.
 *
 * A Scrivener scene is a few hundred KB at the very outside, and holding the
 * tokens keeps the \uc skip simple — it can rewrite a partially-consumed TEXT
 * token in place instead of needing a push-back buffer. If this ever meets a
 * pathological file, the fix is a small lookahead window, not a more
 * complicated state machine.
 */
function readTokens(buffer: Buffer): Promise<RtfToken[]> {
  return new Promise((resolve, reject) => {
    const out: RtfToken[] = []
    const stream = new Tokenize()
    stream.on('data', (token: RtfToken) => out.push(token))
    stream.on('end', () => resolve(out))
    stream.on('error', reject)
    stream.end(buffer)
  })
}

export async function rtfToBlocks(fileBuffer: Buffer, options: RtfOptions = {}): Promise<RtfParseResult> {
  const tally = new WarningTally()
  const tokens = await readTokens(fileBuffer)
  const styleNames = options.styleNames

  const blocks: Block[] = []
  let runs: Run[] = []
  let runText = ''
  /** Bytes awaiting a codepage decode — see decodeBytes for why they queue. */
  let pending: number[] = []

  let encoding = 'win1252'

  // The colour table. Index 0 is the "auto" entry produced by the table's
  // leading semicolon, which is a real entry: dropping it shifts every colour
  // by one.
  const colors: (string | undefined)[] = []
  let colorPending = { r: 0, g: 0, b: 0, seen: false }

  /** Marker text captured from a \listtext / \pntext group — how a list item
   *  announces itself when the list tables are absent or unreadable. */
  let listMarkerBuffer = ''
  let listMarker: string | null = null
  let tableRunOpen = false

  const stack: Frame[] = [
    {
      char: freshChar(),
      para: freshPara(),
      dest: 'body',
      uc: 1,
      fresh: true,
      sawStar: false
    }
  ]
  const top = (): Frame => stack[stack.length - 1]
  const inBody = (): boolean => top().dest === 'body'

  /**
   * The style index applied anywhere in the paragraph being built.
   *
   * Set when a marker opens and deliberately NOT cleared when it closes: the
   * close comes before the \par, so clearing there would lose the style by the
   * time the paragraph is emitted. Reset per paragraph instead.
   */
  let paragraphStyle: number | null = null

  /** Appends decoded text, removing Scrivener's inline style markers first.
   *  They are plain text to RTF, so this is the only place they can go. */
  function appendText(text: string, toListMarker: boolean): void {
    const scan = stripMarkers(text)
    for (const index of scan.opened) {
      // A \\$Scr_H range is more specific than the paragraph style wrapping
      // it, so it wins; otherwise the first style seen holds the paragraph.
      if (paragraphStyle === null || scan.sawHeadingMarker) paragraphStyle = index
    }
    if (scan.text === '') return
    if (toListMarker) listMarkerBuffer += scan.text
    else runText += scan.text
  }

  function flushBytes(): void {
    if (pending.length === 0) return
    const text = decodeBytes(pending, encoding)
    pending = []
    appendText(text, top().dest === 'listtext')
  }

  function emit(text: string): void {
    if (text === '') return
    flushBytes()
    if (top().dest === 'listtext') appendText(text, true)
    else if (inBody()) appendText(text, false)
  }

  /** The treatment the current paragraph's Scrivener style asks for. */
  function currentTreatment(): ReturnType<typeof styleTreatment> {
    if (paragraphStyle === null || !styleNames) return null
    return styleTreatment(styleNames.get(paragraphStyle))
  }

  function flushRun(): void {
    flushBytes()
    if (runText === '') return
    const fmt = top().char
    if (fmt.hidden) {
      runText = ''
      return
    }
    const run: Run = { text: runText }
    if (fmt.bold) run.bold = true
    if (fmt.italic) run.italic = true
    if (fmt.underline) run.underline = true
    if (fmt.color) run.color = fmt.color
    if (fmt.highlight) run.highlight = fmt.highlight
    if (fmt.unsupported) tally.add('unsupportedFormattingDropped')
    runs.push(run)
    runText = ''
  }

  function sameFormatting(a: Run, b: Run): boolean {
    return (
      !!a.bold === !!b.bold &&
      !!a.italic === !!b.italic &&
      !!a.underline === !!b.underline &&
      a.color === b.color &&
      a.highlight === b.highlight &&
      a.footnote === undefined &&
      b.footnote === undefined
    )
  }

  /** RTF emits a control word per attribute change, so one sentence can
   *  arrive as dozens of single-character runs. Left unmerged, blocksToHtml
   *  renders <strong>a</strong><strong>b</strong> and the saved file is both
   *  enormous and horrible to diff. */
  function mergeRuns(input: Run[]): Run[] {
    const out: Run[] = []
    for (const run of input) {
      const last = out[out.length - 1]
      if (last && sameFormatting(last, run)) last.text += run.text
      else out.push({ ...run })
    }
    return out.filter((r) => r.text !== '')
  }

  function flushParagraph(): void {
    flushRun()
    const para = top().para
    const merged = mergeRuns(runs)
    runs = []

    let kind: Block['kind'] = 'paragraph'
    let level: number | undefined
    let align = para.align

    const treatment = currentTreatment()
    paragraphStyle = null

    if (listMarker !== null || para.list !== 'none') {
      const marker = (listMarker ?? '').trim()
      const ordered =
        para.list === 'ordered' || /^[0-9]+[.)]?$/.test(marker) || /^[a-zA-Z][.)]$/.test(marker)
      kind = ordered ? 'ordered' : 'bullet'
      if (para.listLevel > 0) tally.add('nestedListsFlattened')
    } else if (treatment) {
      // A Scrivener named style beats \outlinelevel, because in a real
      // project the style is the only heading signal that exists.
      if (treatment.kind === 'heading') {
        kind = 'heading'
        level = treatment.level
      } else if (treatment.kind === 'blockquote') {
        kind = 'blockquote'
      } else if (treatment.kind === 'paragraph') {
        if (treatment.align) align = treatment.align
      } else if (treatment.kind === 'unsupported') {
        tally.add('unsupportedFormattingDropped')
      }
    } else if (para.outlineLevel !== null) {
      kind = 'heading'
      const raw = para.outlineLevel + 1
      level = Math.min(raw, 3)
      if (raw > 3) tally.add('headingsClamped')
    }

    listMarker = null

    const block: Block = { kind, runs: merged }
    if (level !== undefined) block.level = level
    // \ql is emitted on nearly every \pard, so honouring 'left' would stamp an
    // explicit text-align on every paragraph in the project.
    if (align && align !== 'left') block.align = align
    blocks.push(block)
  }

  // --- the \uc fallback skip -------------------------------------------
  //
  // After a \uN, `uc` items of ANSI fallback follow and must be discarded,
  // because the \uN was already taken. The tokenizer has no concept of this.
  // An item is one token, or one balanced group — except inside a TEXT token,
  // where the fallback is frequently glued to the front of the prose that
  // follows it, so there the skip consumes BYTES and lets the remainder fall
  // through. Getting that wrong eats the next real character after every
  // curly apostrophe in the manuscript.
  let skipItems = 0
  let skipGroupDepth = 0

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (skipGroupDepth > 0) {
      if (token.type === GROUP_START) skipGroupDepth++
      else if (token.type === GROUP_END) {
        skipGroupDepth--
        if (skipGroupDepth === 0) skipItems--
      }
      continue
    }

    if (skipItems > 0) {
      if (token.type === GROUP_START) {
        skipGroupDepth = 1
        continue
      }
      if (token.type === TEXT) {
        const bytes = toBytes(token.data)
        const eat = Math.min(skipItems, bytes.length)
        skipItems -= eat
        const rest = bytes.slice(eat)
        if (rest.length === 0) continue
        token.data = Buffer.from(rest)
        // Falls through to normal handling: the remainder is real prose.
      } else {
        skipItems--
        continue
      }
    }

    switch (token.type) {
      case GROUP_START: {
        const parent = top()
        stack.push({
          char: { ...parent.char },
          para: { ...parent.para },
          dest: parent.dest,
          uc: parent.uc,
          fresh: true,
          sawStar: false
        })
        break
      }

      case GROUP_END: {
        flushRun()
        const closing = top()
        const parent = stack[stack.length - 2]
        if (closing.dest === 'listtext' && (!parent || parent.dest !== 'listtext')) {
          listMarker = listMarkerBuffer
          listMarkerBuffer = ''
        }
        // An unbalanced closing brace must not underflow the stack — the
        // tokenizer passes malformed input straight through.
        if (stack.length > 1) stack.pop()
        break
      }

      case TEXT: {
        const frame = top()
        frame.fresh = false
        const bytes = toBytes(token.data)
        if (frame.dest === 'colortbl') {
          // Each ';' closes one entry. The leading one, with no components
          // before it, is the "auto" entry and must occupy index 0.
          for (const byte of bytes) {
            if (byte === 0x3b) {
              colors.push(colorPending.seen ? hexColor(colorPending.r, colorPending.g, colorPending.b) : undefined)
              colorPending = { r: 0, g: 0, b: 0, seen: false }
            }
          }
        } else if (frame.dest === 'listtext' || inBody()) {
          pending.push(...bytes)
        }
        break
      }

      case CONTROL:
        handleControl(token)
        break

      default:
        break
    }
  }

  if (runs.length > 0 || runText !== '' || pending.length > 0) flushParagraph()

  // A trailing \par is universal, so the final block is usually empty.
  while (blocks.length > 0) {
    const last = blocks[blocks.length - 1]
    if (last.kind === 'paragraph' && last.runs.length === 0) blocks.pop()
    else break
  }

  return { blocks, warnings: tally.result }

  // ---------------------------------------------------------------- control

  function handleControl(token: RtfToken): void {
    const frame = top()
    const word = token.word ?? ''
    const param = token.param

    // \* marks the next control word as an ignorable destination. It does not
    // itself end the group's "fresh" state.
    if (word === '*') {
      frame.sawStar = true
      return
    }

    // A destination is only a destination at the head of its group.
    if (frame.fresh) {
      frame.fresh = false
      if (applyDestination(frame, word)) return
      // An unrecognised ignorable destination is skipped wholesale. This
      // default is what lets the parser survive writers it has never seen.
      if (frame.sawStar) {
        frame.dest = 'skip'
        return
      }
    }

    // \'XX — one byte of codepage text, delivered as a control token.
    if (word === "'") {
      const bytes = toBytes(token.data)
      if (frame.dest === 'colortbl') return
      if (frame.dest === 'listtext' || inBody()) pending.push(...bytes)
      return
    }

    // Binary payload: opaque by the time it reaches here, and never prose.
    if (word === 'bin') return

    switch (word) {
      case 'ansicpg': {
        const resolved = encodingFor(param ?? null)
        encoding = resolved.encoding
        if (resolved.fellBack) tally.add('textEncodingFallback')
        return
      }
      case 'uc':
        frame.uc = Math.max(0, param ?? 1)
        return

      case 'u': {
        // Signed 16-bit in the spec, and the tokenizer passes the raw
        // negative straight through — verified against the real stream.
        const raw = param ?? 0
        const code = raw < 0 ? raw + 65536 : raw
        emit(String.fromCharCode(code))
        skipItems = frame.uc
        return
      }

      // ---- character formatting ---------------------------------------
      case 'plain':
        flushRun()
        frame.char = freshChar()
        return
      case 'b':
        flushRun()
        frame.char.bold = param !== 0
        return
      case 'i':
        flushRun()
        frame.char.italic = param !== 0
        return
      case 'ul':
        flushRun()
        frame.char.underline = param !== 0
        return
      case 'ulnone':
        flushRun()
        frame.char.underline = false
        return
      case 'v':
        flushRun()
        frame.char.hidden = param !== 0
        return
      case 'cf':
        flushRun()
        frame.char.color = param === undefined ? undefined : colors[param]
        return
      case 'highlight':
        flushRun()
        frame.char.highlight = param === undefined || param === 0 ? undefined : colors[param]
        return

      // ---- paragraph formatting ---------------------------------------
      case 'pard':
        frame.para = freshPara()
        return
      case 'ql':
      case 'qc':
      case 'qr':
      case 'qj':
      case 'qd':
        frame.para.align = ALIGN_MAP[word]
        return
      case 'outlinelevel':
        frame.para.outlineLevel = param === undefined || param < 0 ? null : param
        return
      case 'ls':
        if ((param ?? 0) > 0 && frame.para.list === 'none') frame.para.list = 'bullet'
        return
      case 'ilvl':
      case 'pnlvl':
        frame.para.listLevel = param ?? 0
        return
      case 'pnlvlblt':
        frame.para.list = 'bullet'
        return
      case 'pnlvlbody':
      case 'pndec':
      case 'pnucltr':
      case 'pnlcltr':
      case 'pnucrm':
      case 'pnlcrm':
        frame.para.list = 'ordered'
        return

      // ---- breaks ------------------------------------------------------
      case 'par':
        flushParagraph()
        return
      case 'line': {
        // The schema has no hard-break node, so a <br> would be discarded by
        // htmlToBlocks entirely. Two different right answers:
        //
        // Inside a heading, \line separates a chapter number from its
        // subtitle ("Chapter 23 \line Survival is Implausible"). Splitting
        // there produces an h1 followed by an orphan paragraph, which is
        // worse than one heading holding both, so it becomes a space.
        //
        // Everywhere else it is real structure — verse and address blocks are
        // built entirely from \line — so the paragraph splits.
        //
        // Decode first: the opening marker is still sitting in the pending
        // byte buffer at this point, so without this the style is not yet
        // known and every heading splits at its \line.
        flushBytes()
        const treatment = currentTreatment()
        if (treatment?.kind === 'heading') emit(' ')
        else flushParagraph()
        return
      }
      case 'page':
        flushParagraph()
        blocks.push({ kind: 'pageBreak', runs: [] })
        return

      // ---- tables ------------------------------------------------------
      case 'intbl':
        if (!tableRunOpen) {
          tableRunOpen = true
          tally.add('tablesFlattened')
        }
        frame.para.inTable = true
        return
      case 'cell':
      case 'nestcell':
      case 'row':
      case 'nestrow':
        flushParagraph()
        return

      // ---- colour table -------------------------------------------------
      case 'red':
        colorPending.r = param ?? 0
        colorPending.seen = true
        return
      case 'green':
        colorPending.g = param ?? 0
        colorPending.seen = true
        return
      case 'blue':
        colorPending.b = param ?? 0
        colorPending.seen = true
        return

      default:
        break
    }

    if (IGNORED_WORDS.has(word)) return

    if (UNSUPPORTED_MARKS.has(word)) {
      flushRun()
      frame.char.unsupported = param !== 0
      return
    }

    const ch = CHAR_WORDS[word]
    if (ch !== undefined) {
      emit(ch)
      return
    }
  }

  /** Recognises a group-opening destination. Returns true when handled. */
  function applyDestination(frame: Frame, word: string): boolean {
    // Already inside something being skipped: adopt it without re-tallying,
    // or a {\*\shppict{\pict ...}} counts as two dropped images.
    const alreadySkipping = frame.dest === 'skip'

    if (word === 'colortbl') {
      frame.dest = 'colortbl'
      colors.length = 0
      colorPending = { r: 0, g: 0, b: 0, seen: false }
      return true
    }
    if (word === 'listtext' || word === 'pntext') {
      frame.dest = 'listtext'
      listMarkerBuffer = ''
      return true
    }
    if (word === 'fldrslt') {
      // The visible result of a field IS the prose. Skipping it and keeping
      // fldinst instead is the classic inversion that pastes
      // HYPERLINK "http://..." into the manuscript.
      frame.dest = 'body'
      tally.add('hyperlinksFlattened')
      return true
    }
    const tallied = TALLIED_DESTINATIONS[word]
    if (tallied) {
      frame.dest = 'skip'
      if (!alreadySkipping) tally.add(tallied)
      return true
    }
    if (SKIP_DESTINATIONS.has(word)) {
      frame.dest = 'skip'
      return true
    }
    return false
  }
}
