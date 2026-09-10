/**
 * What does Tokenize actually emit?
 *
 * Every assumption the importer is built on gets checked here against the real
 * library rather than against its README — particularly the three the plan
 * flagged: how \uN's sign is reported, whether \'XX really arrives as separate
 * one-byte tokens, and whether \binN is opaque.
 */
const { Tokenize } = require('rtf-stream-parser')

const NAMES = ['GROUP_START', 'GROUP_END', 'CONTROL', 'TEXT']

function tokenize(rtf) {
  return new Promise((resolve, reject) => {
    const out = []
    const t = new Tokenize()
    t.on('data', (tok) => out.push(tok))
    t.on('end', () => resolve(out))
    t.on('error', reject)
    t.end(Buffer.isBuffer(rtf) ? rtf : Buffer.from(rtf, 'latin1'))
  })
}

const show = (t) => {
  const bits = [NAMES[t.type] ?? t.type]
  if (t.word !== undefined) bits.push('word=' + JSON.stringify(t.word))
  if (t.param !== undefined) bits.push('param=' + t.param)
  if (t.data !== undefined) {
    const b = Buffer.from(t.data)
    bits.push('data=<' + b.toString('hex') + '>' + (b.length <= 24 ? ' ' + JSON.stringify(b.toString('latin1')) : ''))
  }
  for (const k of Object.keys(t)) if (!['type', 'word', 'param', 'data'].includes(k)) bits.push(k + '=' + JSON.stringify(t[k]))
  return '  ' + bits.join(' ')
}

async function probe(label, rtf) {
  console.log('\n=== ' + label + ' ===')
  try {
    const toks = await tokenize(rtf)
    console.log('  (' + toks.length + ' tokens)')
    toks.forEach((t) => console.log(show(t)))
  } catch (e) {
    console.log('  THREW: ' + e.message)
  }
}

;(async () => {
  console.log('exports:', Object.keys(require('rtf-stream-parser')).join(', '))

  await probe('plain text + bold toggle', String.raw`{\rtf1\ansi\ansicpg1252 Hello \b bold\b0  plain\par}`)

  // The sign question: 8217 fits in signed 16-bit, 65533 does not and is
  // written negative by conforming writers.
  await probe('\\uN sign handling', String.raw`{\rtf1\ansi \u8217? and \u-3928? done}`)

  await probe("\\'XX escapes — separate one-byte tokens?", String.raw`{\rtf1\ansi\ansicpg1252 caf\'e9 \'93quoted\'94}`)

  await probe('\\ucN with a fallback to skip', String.raw`{\rtf1\ansi\uc1 don\u8217\'92t stop}`)

  await probe('\\uc0 with no fallback at all', String.raw`{\rtf1\ansi\uc0 don\u8217 t stop}`)

  // Binary: the bytes contain braces and the literal text \par, which would
  // wreck a hand-rolled scanner.
  const binPayload = Buffer.from('{}\\par{{{', 'latin1')
  const binRtf = Buffer.concat([
    Buffer.from(String.raw`{\rtf1\ansi before \bin` + binPayload.length + ' ', 'latin1'),
    binPayload,
    Buffer.from(String.raw` after\par}`, 'latin1')
  ])
  await probe('\\binN opaque?', binRtf)

  await probe('nested groups + ignorable destination', String.raw`{\rtf1\ansi{\*\generator Riched20}{\fonttbl{\f0 Arial;}}text{\b nested}}`)

  await probe('control symbols', String.raw`{\rtf1\ansi a\~b\-c\_d\\e\{f\}g \emdash \lquote \tab x}`)

  await probe('malformed: unbalanced closing brace', String.raw`{\rtf1\ansi ok}}}`)

  await probe('malformed: truncated mid-control', String.raw`{\rtf1\ansi hello \b`)
})()
