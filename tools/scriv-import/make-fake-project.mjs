/**
 * Builds a synthetic .scriv-shaped project, so the intake pipeline can be
 * proved end to end before a real one arrives.
 *
 * This is a GUESS at Scrivener's layout, assembled from the implementation
 * guide. It is deliberately not treated as truth anywhere: its only job is to
 * exercise the plumbing — folder walk, ZIP handling, manifest survey, RTF
 * census — so that when a real project lands, any surprise in the report is a
 * fact about Scrivener rather than a bug in the harness.
 *
 *   node make-fake-project.mjs            -> corpus/Fake Novel.scriv/
 *   node make-fake-project.mjs --zip      -> also corpus/Fake Novel Backup.zip
 */
import { mkdir, writeFile, rm } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const JSZip = require('jszip')

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, 'corpus', 'Fake Novel.scriv')
const B = String.fromCharCode(92)

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** A believable Scrivener-ish RTF body. */
function body(paragraphs) {
  const head =
    '{' + B + 'rtf1' + B + 'ansi' + B + 'ansicpg1252' + B + 'uc0' + B + 'deff0' +
    '{' + B + 'fonttbl{' + B + 'f0' + B + 'fnil' + B + 'fcharset0 Palatino;}}' +
    '{' + B + 'colortbl;' + B + 'red0' + B + 'green0' + B + 'blue0;' + B + 'red200' + B + 'green0' + B + 'blue0;}' +
    B + 'viewkind4' + B + 'uc0'
  const parts = paragraphs.map(
    (p) => B + 'pard' + B + 'sa200' + B + 'sl276' + B + 'slmult1' + B + 'f0' + B + 'fs24 ' + p + B + 'par'
  )
  return Buffer.from(head + parts.join('') + '}', 'latin1')
}

const CH1 = body([
  'The harbour had a way of ' + B + 'i keeping' + B + 'i0  things. Wren didn' + B + 'u8217 t argue with it.',
  'She counted the boats' + B + 'emdash eleven, then ten' + B + 'emdash and wrote the number down.',
  B + 'b A note to self:' + B + 'b0  the tide tables are wrong again. Caf' + B + "'e9" + ' at six.'
])

const CH2 = body([
  'Morning came in ' + B + 'ldblquote layers' + B + 'rdblquote , as Tobias liked to say.',
  '{' + B + 'listtext' + B + "'b7" + B + 'tab}' + B + 'ls1' + B + 'ilvl0 salt',
  '{' + B + 'listtext' + B + "'b7" + B + 'tab}' + B + 'ls1' + B + 'ilvl0 rope'
])

const RESEARCH = body(['Interview, 1974. The harbourmaster remembered the ' + B + 'i Kestrel' + B + 'i0 .'])

const SCRIVX = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="3.0" Creator="Scrivener" Identifier="${uuid(1)}">
    <Binder>
        <BinderItem UUID="${uuid(10)}" Type="DraftFolder" Created="2026-01-04 10:00:00 +0000">
            <Title>Manuscript</Title>
            <Children>
                <BinderItem UUID="${uuid(11)}" Type="Folder">
                    <Title>Part One</Title>
                    <MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData>
                    <Children>
                        <BinderItem UUID="${uuid(12)}" Type="Text">
                            <Title>The Drowned Mile</Title>
                            <MetaData>
                                <IncludeInCompile>Yes</IncludeInCompile>
                                <LabelID>2</LabelID>
                                <StatusID>3</StatusID>
                            </MetaData>
                        </BinderItem>
                        <BinderItem UUID="${uuid(13)}" Type="Text">
                            <Title>Soundings</Title>
                            <MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData>
                        </BinderItem>
                    </Children>
                </BinderItem>
            </Children>
        </BinderItem>
        <BinderItem UUID="${uuid(20)}" Type="ResearchFolder">
            <Title>Research</Title>
            <Children>
                <BinderItem UUID="${uuid(21)}" Type="Text">
                    <Title>Harbourmaster interview</Title>
                </BinderItem>
            </Children>
        </BinderItem>
        <BinderItem UUID="${uuid(30)}" Type="TrashFolder">
            <Title>Trash</Title>
        </BinderItem>
    </Binder>
    <ProjectBookmarks/>
</ScrivenerProject>
`

const files = [
  ['Fake Novel.scrivx', Buffer.from(SCRIVX, 'utf-8')],
  ['project.scrivx.bak', Buffer.from(SCRIVX, 'utf-8')],
  ['Files/version.txt', Buffer.from('16\n', 'utf-8')],
  [`Files/Data/${uuid(12)}/content.rtf`, CH1],
  [`Files/Data/${uuid(12)}/synopsis.txt`, Buffer.from('Wren counts the boats and finds one missing.', 'utf-8')],
  [`Files/Data/${uuid(12)}/notes.rtf`, body(['Check the tide table detail against the 1974 interview.'])],
  [`Files/Data/${uuid(13)}/content.rtf`, CH2],
  [`Files/Data/${uuid(13)}/synopsis.txt`, Buffer.from('Morning. The letter arrives.', 'utf-8')],
  [`Files/Data/${uuid(21)}/content.rtf`, RESEARCH],
  ['Settings/ui.plist', Buffer.from('<plist/>', 'utf-8')],
  ['Snapshots/snapshot.xml', Buffer.from('<Snapshots/>', 'utf-8')]
]

await rm(root, { recursive: true, force: true })
for (const [path, data] of files) {
  const full = join(root, path)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, data)
}
console.log('wrote ' + root)

if (process.argv.includes('--zip')) {
  // Scrivener's own backups wrap everything in a single top-level folder,
  // which is exactly the case zipSource has to rebase away.
  const zip = new JSZip()
  for (const [path, data] of files) zip.file('Fake Novel.scriv/' + path, data)
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const zipPath = join(here, 'corpus', 'Fake Novel Backup.zip')
  await writeFile(zipPath, buffer)
  console.log('wrote ' + zipPath)
}
