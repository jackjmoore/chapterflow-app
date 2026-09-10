/**
 * The RTF reader, against hand-written RTF.
 *
 * Nothing here needs the corpus: every case is a string built in this file, so
 * the parser can be refined before a single real .scriv arrives. The corpus
 * tests (writer matrix, real Scrivener output) come later and go alongside
 * these, not instead of them.
 */
import { rtfToBlocks } from '../src/main/import/scrivener/rtfToBlocks'
import { blocksToHtml } from '../src/main/export/blocksToHtml'
import { htmlToBlocks } from '../src/main/export/htmlToBlocks'
import type { Block } from '../src/main/export/htmlToBlocks'

let passed = 0
let failed = 0
const lines: string[] = []

function section(name: string): void {
  lines.push('')
  lines.push(name + ':')
}

function assert(ok: boolean, label: string): void {
  if (ok) {
    passed++
    lines.push('  ok    ' + label)
  } else {
    failed++
    lines.push('  FAIL  ' + label)
  }
}

function note(text: string): void {
  lines.push('      ' + text)
}

/** RTF is bytes. Building the fixtures as latin1 keeps a written \'92 a
 *  single 0x92 byte rather than a UTF-8 pair. */
const rtf = (source: string): Buffer => Buffer.from(source, 'latin1')

/** The visible text of a parse, paragraphs joined — what a reader would see. */
const textOf = (blocks: Block[]): string =>
  blocks.map((b) => b.runs.map((r) => r.text).join('')).join('\n')

async function parse(source: string): ReturnType<typeof rtfToBlocks> {
  return rtfToBlocks(rtf(source))
}

async function run(): Promise<void> {
  // ---------------------------------------------------------------------
  section('the \\uc fallback skip — the one that eats manuscripts')

  // The same sentence written the four ways real writers write it. Every one
  // must survive intact. A parser that hard-codes "skip 1" loses the "t" in
  // the \uc0 case; one that ignores \uc doubles the apostrophe in the others.
  const APOS = String.fromCharCode(0x92) // cp1252 right single quote
  const cases: [string, string][] = [
    ['uc0, no fallback at all (Cocoa writers)', String.raw`{\rtf1\ansi\ansicpg1252\uc0 don\u8217 t stop}`],
    ['uc1 with a hex fallback', String.raw`{\rtf1\ansi\ansicpg1252\uc1 don\u8217\'92t stop}`],
    ['uc1 with a literal ? fallback glued to the prose', String.raw`{\rtf1\ansi\ansicpg1252\uc1 don\u8217?t stop}`],
    ['uc2 with a two-byte fallback', String.raw`{\rtf1\ansi\ansicpg1252\uc2 don\u8217\'92\'92t stop}`]
  ]
  for (const [label, source] of cases) {
    const { blocks } = await parse(source)
    const text = textOf(blocks)
    note(label + ' -> ' + JSON.stringify(text))
    assert(text === 'don’t stop', label)
  }

  // The fallback can also be a whole group, which counts as one item.
  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi\uc1 a\u8217{\f1 x}b}`)
    note('group fallback -> ' + JSON.stringify(textOf(blocks)))
    assert(textOf(blocks) === 'a’b', 'a {group} fallback counts as exactly one item')
  }

  // A raw cp1252 byte with no \u at all is just text.
  {
    const { blocks } = await parse('{\\rtf1\\ansi\\ansicpg1252 don' + APOS + 't stop}')
    assert(textOf(blocks) === 'don’t stop', 'a bare cp1252 smart quote decodes without any \\u')
  }

  // ---------------------------------------------------------------------
  section('codepages')

  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi\ansicpg1252 caf\'e9 \'93quoted\'94 \'96 dash}`)
    note(JSON.stringify(textOf(blocks)))
    assert(
      textOf(blocks) === 'café “quoted” – dash',
      'cp1252 0x80-0x9F decodes to smart quotes, not C1 control characters'
    )
  }
  {
    // UTF-8: one character split across two \'XX escapes. Decoding each alone
    // yields one U+FFFD per byte.
    const { blocks } = await parse(String.raw`{\rtf1\ansi\ansicpg65001 caf\'c3\'a9}`)
    note(JSON.stringify(textOf(blocks)))
    assert(textOf(blocks) === 'café', 'consecutive hex escapes accumulate before decoding under UTF-8')
  }
  {
    const { blocks, warnings } = await parse(String.raw`{\rtf1\ansi\ansicpg9999 plain}`)
    assert(warnings.textEncodingFallback === 1, 'an unknown codepage is reported rather than assumed clean')
    assert(textOf(blocks) === 'plain', 'and the text still comes through')
  }

  // ---------------------------------------------------------------------
  section('formatting')

  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi Hello \b bold\b0  plain \i it\i0 .\par}`)
    const runs = blocks[0].runs
    note(JSON.stringify(runs))
    assert(runs.length === 5, 'runs split at every formatting change (' + runs.length + ')')
    assert(runs[1].bold === true && runs[1].text === 'bold', 'bold run carries its text')
    assert(runs[2].bold === undefined, '\\b0 turns bold off rather than being ignored')
    assert(runs[3].italic === true, 'italic toggles independently')
  }
  {
    // Group scoping: the inner formatting must not leak past the closing brace.
    const { blocks } = await parse(String.raw`{\rtf1\ansi {\b bold} plain}`)
    const runs = blocks[0].runs
    note(JSON.stringify(runs))
    assert(runs[0].bold === true && runs[1].bold === undefined, 'a closing brace restores the outer formatting')
  }
  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi \b\i both \plain neither\par}`)
    const runs = blocks[0].runs
    assert(
      runs[0].bold === true && runs[0].italic === true && runs[1].bold === undefined && runs[1].italic === undefined,
      '\\plain resets character formatting'
    )
  }
  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi \ul under\ulnone plain\par}`)
    assert(blocks[0].runs[0].underline === true && blocks[0].runs[1].underline === undefined, '\\ulnone ends an underline')
  }
  {
    // Run merging: RTF emits a control word per change, so identical
    // formatting either side of a no-op must not produce two runs.
    const { blocks } = await parse(String.raw`{\rtf1\ansi \b a\b b\b c\par}`)
    const html = blocksToHtml(blocks, { paragraphWrappedNodes: true })
    note(html)
    assert(!html.includes('</strong><strong>'), 'adjacent identically-formatted runs are merged')
  }

  // ---------------------------------------------------------------------
  section('paragraphs and alignment')

  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi\pard\ql left\par\pard\qc centred\par}`)
    note(JSON.stringify(blocks.map((b) => ({ align: b.align, text: b.runs.map((r) => r.text).join('') }))))
    assert(blocks.length === 2, 'two paragraphs')
    assert(blocks[0].align === undefined, '\\ql does not stamp an explicit left alignment')
    assert(blocks[1].align === 'center', '\\qc does')
  }
  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi\qc centred\par\pard after\par}`)
    assert(blocks[1].align === undefined, '\\pard resets paragraph formatting')
  }
  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi\qc centred\par still centred\par}`)
    assert(blocks[1].align === 'center', 'but \\par alone does not — properties carry until \\pard')
  }
  {
    const html = blocksToHtml((await parse(String.raw`{\rtf1\ansi\ql a\par\ql b\par}`)).blocks, {
      paragraphWrappedNodes: true
    })
    assert(!html.includes('text-align: left'), 'no text-align: left anywhere in the output')
  }

  // ---------------------------------------------------------------------
  section('destinations')

  {
    // A \pict body is hex digits indistinguishable from prose. 200 KB of it.
    const hex = 'ab'.repeat(100_000)
    const { blocks, warnings } = await parse(
      String.raw`{\rtf1\ansi before {\pict\pngblip ` + hex + String.raw`} after\par}`
    )
    const text = textOf(blocks)
    note('text after a 200KB \\pict: ' + JSON.stringify(text))
    assert(!text.includes('ab'), 'no hex from a \\pict reaches the prose')
    assert(text === 'before  after', 'and the surrounding text is intact')
    assert(warnings.imagesDropped === 1, 'the dropped image is reported once')
  }
  {
    const { warnings } = await parse(String.raw`{\rtf1\ansi{\*\shppict{\pict\pngblip ffff}}x\par}`)
    assert(warnings.imagesDropped === 1, 'a nested shppict/pict pair counts as one image, not two')
  }
  {
    const { blocks } = await parse(
      String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}{\*\generator Riched20}{\info{\title Secret}}Body\par}`
    )
    assert(textOf(blocks) === 'Body', 'font table, generator and info never reach the prose')
  }
  {
    const { blocks } = await parse(String.raw`{\rtf1\ansi{\*\someunknowndest hidden}visible\par}`)
    assert(textOf(blocks) === 'visible', 'an unrecognised ignorable destination is skipped wholesale')
  }
  {
    // The classic inversion: keep fldrslt, drop fldinst.
    const { blocks, warnings } = await parse(
      String.raw`{\rtf1\ansi see {\field{\*\fldinst HYPERLINK "http://example.com"}{\fldrslt the link text}} here\par}`
    )
    const text = textOf(blocks)
    note(JSON.stringify(text))
    assert(!text.includes('HYPERLINK'), 'the field instruction never reaches the prose')
    assert(text.includes('the link text'), 'the field result does')
    assert(warnings.hyperlinksFlattened === 1, 'and the flattening is reported')
  }
  {
    const { blocks, warnings } = await parse(
      String.raw`{\rtf1\ansi text{\footnote a note}more\par}`
    )
    assert(textOf(blocks) === 'textmore', 'footnote bodies do not leak into the prose')
    assert(warnings.footnotesDropped === 1, 'and are reported')
  }
  {
    const { blocks, warnings } = await parse(String.raw`{\rtf1\ansi a{\annotation remark}b\par}`)
    assert(textOf(blocks) === 'ab' && warnings.commentsDropped === 1, 'annotations are dropped and reported')
  }

  // ---------------------------------------------------------------------
  section('colours')

  {
    // The leading ';' is the auto entry and occupies index 0. Dropping it
    // shifts every colour by one, so \cf2 here must be blue, not red.
    const { blocks } = await parse(
      String.raw`{\rtf1\ansi{\colortbl;\red255\green0\blue0;\red0\green0\blue255;}\cf2 blue\par}`
    )
    note(JSON.stringify(blocks[0].runs))
    assert(blocks[0].runs[0].color === '#0000ff', 'the colour table’s leading semicolon is a real entry')
  }

  // ---------------------------------------------------------------------
  section('lists')

  {
    const { blocks } = await parse(
      String.raw`{\rtf1\ansi{\listtext\'b7\tab}\ls1\ilvl0 first item\par{\listtext\'b7\tab}\ls1\ilvl0 second\par}`
    )
    note(JSON.stringify(blocks.map((b) => ({ kind: b.kind, text: b.runs.map((r) => r.text).join('') }))))
    assert(blocks.every((b) => b.kind === 'bullet'), 'a bullet marker makes a bullet list')
    assert(!textOf(blocks).includes('·'), 'and the marker glyph never leaks into the prose')
  }
  {
    const { blocks } = await parse(
      String.raw`{\rtf1\ansi{\listtext 1.\tab}\ls1 first\par{\listtext 2.\tab}\ls1 second\par}`
    )
    assert(blocks.every((b) => b.kind === 'ordered'), 'a numeric marker makes an ordered list')
    assert(!textOf(blocks).startsWith('1.'), 'and the number is not duplicated into the text')
  }
  {
    const { warnings } = await parse(String.raw`{\rtf1\ansi{\listtext\'b7\tab}\ls1\ilvl2 deep\par}`)
    assert(warnings.nestedListsFlattened === 1, 'a nested list level is reported as flattened')
  }

  // ---------------------------------------------------------------------
  section('text-producing control words')

  {
    const { blocks } = await parse(
      String.raw`{\rtf1\ansi a\emdash b\endash c\lquote d\rquote e\ldblquote f\rdblquote g\tab h\par}`
    )
    note(JSON.stringify(textOf(blocks)))
    assert(
      textOf(blocks) === 'a—b–c‘d’e“f”g h',
      'dashes, quotes and tabs arrive as control words and are mapped'
    )
  }

  // ---------------------------------------------------------------------
  section('binary and malformed input')

  {
    // \bin payload containing braces and the literal text \par. The tokenizer
    // makes this opaque; this proves our integration does not re-scan it.
    const payload = '{}\\par{{{'
    const { blocks } = await parse(
      String.raw`{\rtf1\ansi before \bin` + payload.length + ' ' + payload + String.raw` after\par}`
    )
    note(JSON.stringify(textOf(blocks)))
    assert(textOf(blocks) === 'before  after', 'a \\bin payload never desynchronises the parse')
  }

  const malformed: [string, string][] = [
    ['an extra closing brace', String.raw`{\rtf1\ansi ok}}}`],
    ['truncated mid-control', String.raw`{\rtf1\ansi hello \b`],
    ['a trailing lone backslash', '{\\rtf1\\ansi hello \\'],
    ['an empty ignorable destination', String.raw`{\rtf1\ansi{\*\foo}text\par}`],
    ['deeply nested skipped groups', String.raw`{\rtf1\ansi{\*\a{\b{\c{\d{\e x}}}}}text\par}`],
    ['no content at all', '{}'],
    ['not RTF at all', 'just some plain bytes']
  ]
  for (const [label, source] of malformed) {
    let threw = false
    let blockCount = -1
    try {
      const { blocks } = await parse(source)
      blockCount = blocks.length
    } catch {
      threw = true
    }
    assert(!threw, 'no throw on ' + label + ' (' + blockCount + ' blocks)')
  }

  // ---------------------------------------------------------------------
  section("Scrivener's inline style markers")

  // Taken from a real project: every chapter opens with a Title-styled line
  // wrapped in these. They are plain text as far as RTF is concerned, so
  // nothing in a correct parser strips them — and if we do not, every
  // imported chapter begins "<$Scr_Ps::0>".
  const CHAPTER_OPENING =
    String.raw`{\rtf1\ansi\ansicpg1252\uc1\deff0\pard\plain\sl480\slmult1\qc\ltrch\loch ` +
    String.raw`{\f1\fs56\b1\i0 <$Scr_Ps::0>Chapter 23\line Survival is Implausible<!$Scr_Ps::0>}` +
    String.raw`\par\pard\plain\qj Groslo pushed the envelope over the table.\par}`

  {
    const { blocks } = await parse(CHAPTER_OPENING)
    const text = textOf(blocks)
    note(JSON.stringify(text))
    assert(!text.includes('Scr_Ps'), 'no style marker survives into the prose')
    assert(!text.includes('<$') && !text.includes('<!'), 'and neither do the marker delimiters')
  }
  {
    // Without a style table the markers still go, but nothing is promoted.
    const { blocks } = await parse(CHAPTER_OPENING)
    assert(blocks[0].kind === 'paragraph', 'with no style table, a marked line stays a paragraph')
  }
  {
    // With one, index 0 resolves to "Title" and the line becomes a heading —
    // and the \line inside it does not split the title in two.
    const { blocks } = await rtfToBlocks(rtf(CHAPTER_OPENING), {
      styleNames: new Map([[0, 'Title']])
    })
    note(JSON.stringify(blocks.map((b) => ({ kind: b.kind, level: b.level, text: b.runs.map((r) => r.text).join('') }))))
    assert(blocks[0].kind === 'heading' && blocks[0].level === 1, 'a Title-styled line becomes an h1')
    assert(
      blocks[0].runs.map((r) => r.text).join('') === 'Chapter 23 Survival is Implausible',
      'and \\line inside a heading joins rather than splits it'
    )
    assert(blocks[1].kind === 'paragraph', 'the following body text is unaffected')
  }
  {
    // Outside a heading, \line is real structure and still splits.
    const { blocks } = await parse(String.raw`{\rtf1\ansi first\line second\par}`)
    assert(blocks.length === 2, '\\line outside a heading still splits the paragraph')
  }
  {
    const styles = new Map([
      [0, 'Heading 2'],
      [1, 'Block Quote'],
      [2, 'Centered Text'],
      [3, 'Code Block']
    ])
    const source =
      String.raw`{\rtf1\ansi<$Scr_Ps::0>a heading<!$Scr_Ps::0>\par` +
      String.raw`<$Scr_Ps::1>a quotation<!$Scr_Ps::1>\par` +
      String.raw`<$Scr_Ps::2>centred line<!$Scr_Ps::2>\par` +
      String.raw`<$Scr_Ps::3>some code<!$Scr_Ps::3>\par}`
    const { blocks, warnings } = await rtfToBlocks(rtf(source), { styleNames: styles })
    note(JSON.stringify(blocks.map((b) => ({ kind: b.kind, level: b.level, align: b.align }))))
    assert(blocks[0].kind === 'heading' && blocks[0].level === 2, 'Heading 2 maps to level 2')
    assert(blocks[1].kind === 'blockquote', 'Block Quote maps to a blockquote')
    assert(blocks[2].align === 'center', 'Centered Text maps to a centred paragraph')
    assert(
      blocks[3].kind === 'paragraph' && (warnings.unsupportedFormattingDropped ?? 0) > 0,
      'Code Block has no schema equivalent, so it degrades and is reported'
    )
  }
  {
    // The \\$Scr_H family, which nests inside a paragraph style.
    const { blocks } = await rtfToBlocks(
      rtf(String.raw`{\rtf1\ansi<$Scr_Ps::0>x<$Scr_H::1>a heading<!$Scr_H::1><!$Scr_Ps::0>\par}`),
      { styleNames: new Map([[0, 'Title'], [1, 'Heading 1']]) }
    )
    note(JSON.stringify({ kind: blocks[0].kind, level: blocks[0].level, text: textOf(blocks) }))
    assert(!textOf(blocks).includes('Scr_'), 'Scr_H markers are stripped too')
    assert(blocks[0].kind === 'heading' && blocks[0].level === 1, 'and the nested heading range wins')
  }

  // ---------------------------------------------------------------------
  section('the round trip — only ever emits blocks the editor schema holds')

  {
    const source = String.raw`{\rtf1\ansi\ansicpg1252{\colortbl;\red255\green0\blue0;}
\pard\qc \b A heading-ish line\b0\par
\pard\ql Plain text with \i italics\i0  and \ul underline\ulnone , plus caf\'e9.\par
\pard{\listtext\'b7\tab}\ls1 a bullet\par
\pard\qr right aligned\par}`
    const { blocks } = await parse(source)
    const html = blocksToHtml(blocks, { paragraphWrappedNodes: true })
    const reparsed = htmlToBlocks(html)
    note(html.slice(0, 160) + (html.length > 160 ? '…' : ''))
    // Key order differs between the two producers and means nothing, so
    // compare canonically rather than by raw JSON text.
    const canonical = (value: unknown): string =>
      JSON.stringify(value, (_k, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)))
          : v
      )
    const a = canonical(blocks)
    const b = canonical(reparsed)
    if (a !== b) {
      note('  blocks:   ' + a)
      note('  reparsed: ' + b)
    }
    assert(a === b, 'blocks survive blocksToHtml -> htmlToBlocks unchanged')
  }

  // ---------------------------------------------------------------------
  section('scale')

  {
    const big = String.raw`{\rtf1\ansi ` + String.raw`Some ordinary sentence of prose.\par `.repeat(20_000) + '}'
    const started = Date.now()
    const { blocks } = await parse(big)
    const ms = Date.now() - started
    note(blocks.length + ' paragraphs in ' + ms + 'ms')
    assert(blocks.length === 20_000, '20,000 paragraphs all arrive')
    assert(ms < 10_000, 'and parse in under ten seconds (' + ms + 'ms)')
  }
}

run()
  .then(() => {
    console.log(lines.join('\n'))
    console.log('')
    console.log(failed === 0 ? `all ${passed} assertions passed` : `${failed} of ${passed + failed} assertions FAILED`)
    process.exit(failed === 0 ? 1 && 0 : 1)
  })
  .catch((error) => {
    console.log(lines.join('\n'))
    console.error('\nthrew: ' + ((error as Error)?.stack ?? error))
    process.exit(1)
  })
