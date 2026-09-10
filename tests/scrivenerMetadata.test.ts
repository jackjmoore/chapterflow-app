/**
 * The Scrivener metadata mapping.
 *
 * Node-only: none of this touches Electron or the filesystem. The .scrivx
 * fragments are taken verbatim from a real Scrivener 3 project on Windows —
 * the label colours below are that project's actual six.
 */
import {
  mapPalettes,
  readMetadataSettings,
  scrivColorToHex,
  isPartSectionType
} from '../src/main/import/scrivener/metadata'
import { contentFileNameFor, parseScrivenerDate } from '../src/main/import/scrivener/snapshots'
import { assert, createReport, note, section, summarize } from './harness'
import { writeFile } from 'fs/promises'

const REAL_SETTINGS = `<ScrivenerProject>
  <LabelSettings>
    <Title>Label</Title>
    <DefaultLabelID>-1</DefaultLabelID>
    <Labels>
      <Label ID="-1">No Label</Label>
      <Label ID="0" Color="0.993500 0.701213 0.732586">Red</Label>
      <Label ID="1" Color="0.995422 0.790951 0.652384">Orange</Label>
      <Label ID="2" Color="0.997726 0.892729 0.652567">Yellow</Label>
      <Label ID="3" Color="0.715862 0.948714 0.697688">Green</Label>
      <Label ID="4" Color="0.702312 0.888273 0.974258">Blue</Label>
      <Label ID="5" Color="0.957565 0.766751 0.999619">Purple</Label>
    </Labels>
  </LabelSettings>
  <StatusSettings>
    <Title>Status</Title>
    <DefaultStatusID>-1</DefaultStatusID>
    <StatusItems>
      <Status ID="-1">No Status</Status>
      <Status ID="0">To Do</Status>
      <Status ID="1">In Progress</Status>
      <Status ID="2">First Draft</Status>
      <Status ID="3">Revised Draft</Status>
      <Status ID="4">Final Draft</Status>
      <Status ID="5">Done</Status>
    </StatusItems>
  </StatusSettings>
  <SectionTypes>
    <TypeDefinitions>
      <Type ID="A746711D-D3C0-402F-B45C-461B5A7EDD90">Heading</Type>
      <Type ID="B900659A-7BFE-4978-9D16-99615C61851F">Sub-Heading</Type>
      <Type ID="8CDE39C1-E604-4144-B61C-52672FE324A9">Section</Type>
    </TypeDefinitions>
  </SectionTypes>
</ScrivenerProject>`

async function main(): Promise<void> {
  const report = createReport()

  section(report, 'colour conversion')
  note(report, `Red -> ${scrivColorToHex('0.993500 0.701213 0.732586')}`)
  assert(
    report,
    scrivColorToHex('0.993500 0.701213 0.732586') === '#fdb3bb',
    "Scrivener's floating-point triple becomes hex"
  )
  assert(report, scrivColorToHex('0 0 0') === '#000000', 'black round-trips')
  assert(report, scrivColorToHex('1 1 1') === '#ffffff', 'white round-trips')
  assert(
    report,
    scrivColorToHex('not a colour') === '#8a8a8a',
    'and unparseable input falls back rather than producing #NaNNaNNaN'
  )

  section(report, 'reading the project settings')
  const settings = readMetadataSettings(REAL_SETTINGS)
  note(report, `${settings.labels.length} labels, ${settings.statuses.length} statuses, ${settings.sectionTypes.size} section types`)
  assert(report, settings.labels.length === 6, 'six labels, with "No Label" excluded')
  assert(report, settings.statuses.length === 6, 'six statuses, with "No Status" excluded')
  assert(
    report,
    settings.labels[0].name === 'Red' && settings.labels[0].color === '#fdb3bb',
    'a label carries its name and converted colour'
  )
  assert(
    report,
    settings.statuses.map((s) => s.name).join(', ') ===
      'To Do, In Progress, First Draft, Revised Draft, Final Draft, Done',
    'the statuses come through in order'
  )
  assert(
    report,
    settings.sectionTypes.get('A746711D-D3C0-402F-B45C-461B5A7EDD90') === 'Heading',
    'section types resolve by id'
  )
  assert(report, settings.customFieldNames.length === 0, 'no custom metadata in this project')

  section(report, 'a project with none of it')
  const bare = readMetadataSettings('<ScrivenerProject><Binder/></ScrivenerProject>')
  assert(
    report,
    bare.labels.length === 0 && bare.statuses.length === 0 && bare.sectionTypes.size === 0,
    'missing blocks read as empty rather than throwing'
  )

  section(report, 'mapping onto this app’s two fields')
  const mapped = mapPalettes(settings, ['Weather', 'Foreshadowing', 'weather', 'Red'])
  note(report, `statuses: ${mapped.statuses.map((s) => s.name).join(', ')}`)
  note(report, `tags: ${mapped.tags.map((t) => t.name).join(', ')}`)

  assert(report, mapped.statuses.length === 6, 'every Scrivener status becomes a StatusDef')
  assert(
    report,
    mapped.statusById.get('2') === mapped.statuses[2].id && mapped.statuses[2].name === 'First Draft',
    'and a document’s StatusID resolves to the right one'
  )
  assert(
    report,
    mapped.statusById.get('-1') === undefined,
    '"No Status" maps to nothing, not to a status called "No Status"'
  )
  assert(
    report,
    mapped.tagByLabelId.get('-1') === undefined,
    'and "No Label" produces no tag'
  )
  assert(
    report,
    mapped.tagByLabelId.get('0') !== undefined &&
      mapped.tags.find((t) => t.id === mapped.tagByLabelId.get('0'))?.color === '#fdb3bb',
    'a label becomes a tag keeping its colour'
  )

  assert(
    report,
    mapped.tagByKeyword.get('weather') === mapped.tagByKeyword.get('weather') &&
      mapped.tags.filter((t) => t.name.toLowerCase() === 'weather').length === 1,
    'keywords differing only in case become one tag'
  )
  assert(
    report,
    mapped.tagByKeyword.get('red') === mapped.tagByLabelId.get('0'),
    'a keyword matching a label reuses that tag rather than making a second one reading identically'
  )
  assert(
    report,
    mapped.tags.length === 8,
    `six labels plus two genuinely new keywords (${mapped.tags.length})`
  )

  section(report, 'section types')
  assert(
    report,
    isPartSectionType('A746711D-D3C0-402F-B45C-461B5A7EDD90', settings.sectionTypes),
    'a Heading-typed item is a Part'
  )
  assert(
    report,
    !isPartSectionType('8CDE39C1-E604-4144-B61C-52672FE324A9', settings.sectionTypes),
    'a Section-typed item is not'
  )
  assert(report, !isPartSectionType(null, settings.sectionTypes), 'and neither is one with no explicit type')

  section(report, 'snapshot dates and filenames')
  // Verbatim from a real project's Snapshots/<uuid>.snapshots/index.xml.
  const REAL_DATE = '2026-09-06 19:44:13 +0100'
  note(report, `${REAL_DATE} -> ${parseScrivenerDate(REAL_DATE)}`)
  assert(
    report,
    parseScrivenerDate(REAL_DATE) === '2026-09-06T18:44:13.000Z',
    'a Scrivener date becomes ISO, with its offset applied'
  )
  assert(
    report,
    contentFileNameFor(REAL_DATE) === '2026-09-06-19-44-13+0100.rtf',
    'and the content filename derives from it, which is how a snapshot is matched to its text'
  )
  assert(
    report,
    parseScrivenerDate('nonsense') === null,
    'an unreadable date returns null rather than inventing one — importSnapshot refuses it downstream'
  )
  assert(
    report,
    parseScrivenerDate('2026-01-02 03:04:05 -0500') === '2026-01-02T08:04:05.000Z',
    'a negative offset is applied the right way round'
  )

  const outDir = process.env.OUT_DIR ?? '.'
  await writeFile(`${outDir}/report.txt`, summarize(report))
  console.log(summarize(report))
  process.exit(report.failures > 0 ? 1 : 0)
}

void main()
