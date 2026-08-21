/**
 * Builds a fully-populated ChapterFlow project on disk.
 *
 * Exists so search-index work (and anything else needing realistic input) can
 * be tested against a project that uses every content type the app has, at a
 * realistic size, rather than a handful of synthetic paragraphs. Writes the
 * same files the app's own stores write, in the same shapes, so the result
 * opens as an ordinary project with no migration or repair step.
 *
 *   node scripts/make-demo-project.mjs "<target folder>"
 *
 * Refuses to write into a folder that already contains a binder.json unless
 * --force is passed: this generates 20,000 words over the top of whatever is
 * there, and doing that to somebody's manuscript by accident is unforgivable.
 */
import { mkdir, writeFile, readdir, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const target = process.argv[2]
const force = process.argv.includes('--force')
if (!target) {
  console.error('usage: node scripts/make-demo-project.mjs "<target folder>" [--force]')
  process.exit(2)
}
if (existsSync(join(target, 'binder.json')) && !force) {
  console.error(`Refusing to overwrite an existing project at ${target} (pass --force if you mean it).`)
  process.exit(1)
}

const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toISOString()
const ymd = (daysAgo) => iso(daysAgo).slice(0, 10)

// ---------------------------------------------------------------- story bible
const TYPES = [
  { id: 'sb-character', name: 'Character', color: '#6f95b8' },
  { id: 'sb-location', name: 'Location', color: '#4b9363' },
  { id: 'sb-object', name: 'Object', color: '#d9a441' }
]

const CHARACTERS = [
  ['Wren Halloway', ['Wren', 'Halloway', 'the cartographer'], 'A cartographer who no longer trusts her own maps.'],
  ['Ivo Marchetti', ['Ivo', 'Marchetti'], 'Lighthouse keeper at Kestrel Point; keeps the log nobody reads.'],
  ['Serafine Okonkwo', ['Serafine', 'Sera', 'Dr Okonkwo'], 'Marine archaeologist, brought in to date the wreck.'],
  ['Tobias Wren-Hall', ['Tobias', 'Toby'], "Wren's estranged brother, harbourmaster by inheritance."],
  ['Marguerite Vance', ['Marguerite', 'Vance', 'the Commissioner'], 'Harbour commissioner with a reason to keep the survey quiet.'],
  ['Elias Thorn', ['Elias', 'Thorn'], 'Salvage diver. Talks less than he knows.'],
  ['Nadia Ferrell', ['Nadia', 'Ferrell'], 'Local journalist chasing the story of the missing survey.'],
  ['Old Corwin', ['Corwin', 'the ferryman'], 'Ferryman on the strait for forty years. Remembers the first light.']
]

const LOCATIONS = [
  ['Kestrel Point', ['the Point'], 'A headland with a lighthouse and very little else.'],
  ['The Drowned Mile', ['Drowned Mile'], 'A stretch of coast that floods twice a day and hides a wreck.'],
  ['Halloway Cottage', ['the cottage'], "Wren's inherited house, full of her father's charts."],
  ['Sallow Harbour', ['the harbour', 'Sallow'], 'Working port, silting up, arguing about dredging.'],
  ['The Anchorline', ['Anchorline'], 'The pub where every version of the story gets told.']
]

const OBJECTS = [
  ['The Meridian Chart', ['Meridian Chart', 'the chart'], 'A survey chart with a coastline that does not exist.'],
  ['The Kestrel Log', ['Kestrel Log', 'the log'], "The lighthouse logbook, kept in Ivo's hand for eleven years."],
  ['The Brass Sounding Line', ['sounding line'], 'Older than the harbour office that lost it.']
]

const items = []
const push = (typeId, [name, aliases, summary], i) =>
  items.push({
    id: `${typeId}-${i}`,
    typeId,
    name,
    aliases,
    summary,
    createdAt: iso(60 - i),
    updatedAt: iso(10 - (i % 10))
  })
CHARACTERS.forEach((c, i) => push('sb-character', c, i))
LOCATIONS.forEach((l, i) => push('sb-location', l, i))
OBJECTS.forEach((o, i) => push('sb-object', o, i))

const byName = Object.fromEntries(items.map((i) => [i.name, i.id]))

// --------------------------------------------------------------- relationships
const RELATIONSHIPS = [
  ['Wren Halloway', 'Tobias Wren-Hall', 'sister of', 'brother of'],
  ['Wren Halloway', 'Serafine Okonkwo', 'colleague of', null],
  ['Ivo Marchetti', 'Old Corwin', 'old friend of', null],
  ['Marguerite Vance', 'Tobias Wren-Hall', 'employer of', 'reports to'],
  ['Serafine Okonkwo', 'Elias Thorn', 'hired', 'works for'],
  ['Nadia Ferrell', 'Marguerite Vance', 'investigating', 'stonewalling'],
  ['Wren Halloway', 'Ivo Marchetti', 'correspondent of', null],
  ['Elias Thorn', 'Old Corwin', 'nephew of', 'uncle of'],
  ['Wren Halloway', 'Halloway Cottage', 'lives at', 'home of'],
  ['Ivo Marchetti', 'Kestrel Point', 'keeps', 'kept by']
]
const relationships = RELATIONSHIPS.map(([from, to, label, reverseLabel], i) => ({
  id: `rel-${i}`,
  fromId: byName[from],
  toId: byName[to],
  label,
  reverseLabel,
  createdAt: iso(50 - i),
  updatedAt: iso(20 - i)
}))

// -------------------------------------------------------------------- lexicon
const LEXICON = [
  ['bathylith', 'A submerged shelf of rock that shows on no modern survey.', 'BATH-ih-lith'],
  ['sounding', 'A measured depth, taken by line rather than instrument.', 'SOWN-ding'],
  ['cartouche', 'The decorated title panel on an old chart.', 'kar-TOOSH'],
  ['rhumbline', 'A line of constant bearing, straight on a Mercator chart.', 'ROOM-line'],
  ['spindrift', 'Spray blown from the crest of a wave.', 'SPIN-drift'],
  ['foreshore', 'The ground between high and low water.', 'FOR-shore'],
  ['leeward', 'The sheltered side, away from the wind.', 'LOO-word'],
  ['transit', 'Two landmarks lined up to fix a position.', 'TRAN-sit'],
  ['wrackline', 'The debris left at the tide’s furthest reach.', 'RACK-line'],
  ['Kestrelward', 'Local usage: towards the Point, regardless of compass.', 'KES-truhl-word']
]
const lexicon = LEXICON.map(([word, meaning, pronunciation], i) => ({
  id: `lex-${i}`,
  word,
  meaning,
  pronunciation,
  createdAt: iso(40 - i),
  updatedAt: iso(5)
}))

// ----------------------------------------------------------------------- tags
const TAGS = [
  { id: 'tag-foreshadow', name: 'Foreshadowing', color: '#b8862f' },
  { id: 'tag-research', name: 'Needs research', color: '#c26a5a' },
  { id: 'tag-continuity', name: 'Continuity risk', color: '#6f95b8' },
  { id: 'tag-cut', name: 'Possible cut', color: '#8a8a8a' },
  { id: 'tag-theme', name: 'Theme: inheritance', color: '#4b9363' }
]
const STATUSES = [
  { id: 'status-draft', name: 'Draft', color: '#8a8a8a' },
  { id: 'status-revising', name: 'Revising', color: '#d9a441' },
  { id: 'status-final', name: 'Final', color: '#4b9363' }
]

// ------------------------------------------------------------------- the prose
// Deterministic assembly from a broad vocabulary. Breadth matters as much as
// volume here: an earlier version drew on ~40 words and produced 21,000 tokens
// with only 177 distinct ones, which is useless for exercising search — almost
// every query matched almost everything. Real manuscripts of this length carry
// a few thousand distinct words, so the pools below are sized for that.
const NOUNS = [
  'tide','chart','harbour','lighthouse','ledger','anchor','compass','lantern','rope','hull',
  'keel','beacon','current','shoal','estuary','breakwater','jetty','pontoon','mooring','buoy',
  'sediment','gravel','shingle','saltmarsh','headland','promontory','inlet','channel','fathom','bearing',
  'almanac','sextant','theodolite','tripod','benchmark','datum','contour','isobath','soundings','transect',
  'affidavit','deposition','minute','memorandum','inventory','receipt','telegram','postcard','envelope','margin',
  'lantern-room','stairwell','threshold','doorway','window','shutter','hearth','kettle','tablecloth','cupboard',
  'gull','cormorant','oystercatcher','kittiwake','heron','mackerel','herring','crab','limpet','barnacle',
  'weather','squall','gale','drizzle','haar','fog','frost','thaw','swell','undertow',
  'inheritance','deed','covenant','easement','boundary','tenure','freehold','lease','probate','testament',
  'silence','rumour','testimony','confession','apology','argument','bargain','promise','refusal','concession'
]
const ADJECTIVES = [
  'grey','brackish','weathered','salt-stained','uncertain','meticulous','careless','faded','provisional','disputed',
  'shallow','fathomless','narrow','windward','sheltered','exposed','derelict','serviceable','immaculate','ruined',
  'cold','luminous','overcast','brittle','sodden','frayed','tarnished','annotated','unsigned','countersigned',
  'patient','impatient','methodical','evasive','candid','guarded','stubborn','forgiving','unrepentant','courteous'
]
const VERBS = [
  'measured','recorded','disputed','confirmed','withdrew','annotated','misread','recalculated','filed','forgot',
  'remembered','questioned','defended','abandoned','retrieved','copied','burned','buried','inherited','returned',
  'sounded','charted','surveyed','triangulated','dredged','salvaged','anchored','drifted','beached','refloated',
  'admitted','denied','implied','conceded','insisted','hesitated','relented','objected','testified','signed'
]
const ADVERBS = [
  'carefully','reluctantly','twice','openly','privately','again','eventually','deliberately','quietly','at length',
  'without comment','in the margin','before witnesses','under protest','on the record','out of habit'
]
const PLACES = [
  'Kestrel Point','the Drowned Mile','Sallow Harbour','the Anchorline','Halloway Cottage',
  'the harbour office','the lantern room','the north jetty','the coastguard station','the parish archive'
]
const PEOPLE = ['Wren','Ivo','Serafine','Tobias','Marguerite','Elias','Nadia','Corwin']
const CONNECTIVES = [
  'and afterwards','though nobody said so','because the record demanded it','while the light turned',
  'until the figures agreed','before the weather closed in','as the water fell back','once the tide had gone',
  'even so','in the end','for the second time that week','against her better judgement'
]

let seed = 20240817
const rnd = () => {
  // Mulberry32 — small, deterministic, good enough for prose scaffolding.
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]


// A long tail of words used sparsely. Real prose is Zipfian: a few hundred
// common words carry most of the volume, and thousands of rarer ones appear
// once or twice each. Those rare words are exactly what makes a search query
// discriminating, so a fixture without them cannot exercise ranking at all.
const RARE = [
  'abeyance','acquiesce','admonition','aftermath','alluvial','ambergris','anemone','apparatus','appraisal','arbitration',
  'archipelago','ardour','armature','arrears','askance','asperity','attestation','augury','austerity','avarice',
  'ballast','balustrade','bereavement','bittern','bracken','brackets','brigantine','brooding','bulkhead','bureaucracy',
  'cadence','cairn','calamity','calcite','candour','capsize','cartulary','causeway','cavil','censure',
  'chandlery','chastened','chronicle','circumspect','clemency','codicil','coercion','collier','commiserate','compendium',
  'concordance','confluence','conjecture','consignment','contrition','conveyance','coracle','cordage','corroborate','counterfoil',
  'crevice','culvert','cupola','curlew','dalliance','dampness','debenture','decorum','demurrage','desiccated',
  'diffidence','diligence','disquiet','dissent','divergence','dowager','dredger','driftwood','duplicity','eddying',
  'effluent','egress','elegy','embankment','emollient','encroach','endowment','enmity','equinox','erosion',
  'escarpment','estrangement','exigency','expiate','extremity','facsimile','fathomless','felicity','ferrule','fiduciary',
  'filament','firmament','flotsam','forbearance','fortitude','franchise','fulcrum','fusillade','gantry','garnish',
  'glacis','gossamer','gradient','granary','gratuity','gunwale','hallowed','harrowing','hawser','headwater',
  'hinterland','hoarfrost','husbandry','impasse','impound','incumbent','indenture','ingress','inlet','inquest',
  'insolvent','intaglio','interment','intercession','invective','jetsam','jurisprudence','keelson','laconic','lamentable',
  'larboard','latitude','leaching','levee','lichen','liminal','littoral','longshore','lugger','manifest',
  'marginalia','mercantile','meridian','millrace','misgiving','mitigation','moorings','mordant','muniment','nacelle',
  'obdurate','obeisance','obfuscate','occlusion','ordnance','ossuary','outfall','palisade','parapet','parsimony',
  'pellucid','penumbra','peregrine','perfidy','perjury','petrel','pilotage','pinnace','plangent','plumbline',
  'precedent','probity','promontory','provenance','purlieu','quagmire','quarantine','quayside','quiescent','ratification',
  'reclamation','recompense','redress','remittance','repository','requisition','rescind','restitution','revetment','riparian',
  'rookery','salvor','sanction','scarcity','schooner','scrivener','scupper','sedimentary','sequester','sextant',
  'shipwright','sluice','solvency','sounding-line','spillway','stanchion','stipend','stratum','subpoena','subsidence',
  'surveyor','taciturn','tallow','tenement','testator','tidewater','tonnage','topography','transcript','tribunal',
  'truculent','tumult','turbid','umbrage','undertaking','vagary','vellum','veracity','vestige','victualler',
  'vindication','wainscot','warrant','watershed','weir','wharfage','windlass','winnow','wreckage','yardarm'
]

/** Plural / participle variants, so the corpus carries the morphological
 *  spread a real manuscript has rather than one fixed form per word. */
function inflect(word) {
  const r = rnd()
  if (r < 0.55) return word
  if (word.endsWith('ed') || word.endsWith('ing') || word.includes(' ') || word.includes('-')) return word
  if (r < 0.75) return word.endsWith('s') ? word : `${word}s`
  if (r < 0.9) return word.endsWith('e') ? `${word.slice(0, -1)}ing` : `${word}ing`
  return word.endsWith('e') ? `${word}d` : `${word}ed`
}

const SHAPES = [
  () => `${pick(PEOPLE)} ${inflect(pick(VERBS))} the ${pick(ADJECTIVES)} ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))} ${pick(ADVERBS)}.`,
  () => `The ${pick(ADJECTIVES)} ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))} at ${pick(PLACES)} had been ${inflect(pick(VERBS))} ${pick(CONNECTIVES)}.`,
  () => `At ${pick(PLACES)}, ${pick(PEOPLE)} ${inflect(pick(VERBS))} a ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))} nobody had ${inflect(pick(VERBS))}.`,
  () => `${pick(PEOPLE)} ${inflect(pick(VERBS))} the ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))}, ${pick(CONNECTIVES)}, and ${inflect(pick(VERBS))} the ${pick(ADJECTIVES)} ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))}.`,
  () => `There was a ${pick(ADJECTIVES)} ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))} on the ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))}, ${pick(ADVERBS)} ${inflect(pick(VERBS))}.`,
  () => `${pick(ADVERBS)}, the ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))} ${inflect(pick(VERBS))} what the ${pick(ADJECTIVES)} ${inflect(pick(rnd() < 0.25 ? RARE : NOUNS))} could not.`
]
const sentence = () => {
  const s = pick(SHAPES)()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const CHAPTER_TITLES = [
  'The Drowned Mile', 'Soundings', 'Kestrel Point', 'What the Log Says', 'Low Water',
  'The Meridian Chart', 'Harbour Business', 'A Coastline That Isn’t', 'The Ferryman',
  'Spring Tide', 'The Anchorline', 'Salvage', 'Correspondence', 'The Commissioner',
  'Dead Reckoning', 'Neap', 'The Survey', 'Two Brothers', 'Sediment', 'The First Light',
  'Bearings', 'The Cottage', 'Rhumbline', 'Silt', 'A Second Opinion', 'The Dive',
  'Depositions', 'Slack Water', 'The Missing Sheet', 'Cartouche', 'Spindrift',
  'The Dredging Vote', 'Foreshore', 'What Corwin Remembers', 'Transit', 'The Wreck',
  'Leeward', 'Wrackline', 'The Last Sounding', 'Chart of Record'
]

// ------------------------------------------------------------------ assembly
const documents = []   // { id, name, html, words }
const spanTags = []
const comments = []

const CHAPTERS = 40
const TARGET_WORDS = 20000
const WORDS_PER_CHAPTER = Math.round(TARGET_WORDS / CHAPTERS)

for (let c = 0; c < CHAPTERS; c += 1) {
  const id = `doc-ch${String(c + 1).padStart(2, '0')}`
  const title = CHAPTER_TITLES[c]
  const paragraphs = []
  let words = 0

  // Chapter opens with a heading, and every fourth chapter starts a new part.
  const parts = []
  if (c % 10 === 0 && c > 0) parts.push('<div data-chapter-break="true"></div>')
  parts.push(`<h1>${title}</h1>`)

  while (words < WORDS_PER_CHAPTER) {
    const count = 3 + Math.floor(rnd() * 4)
    let text = Array.from({ length: count }, sentence).join(' ')

    // Sprinkle real feature usage through the prose rather than bolting it on
    // at the end: this is what a working manuscript looks like.
    const roll = rnd()
    if (roll < 0.06) {
      const spanId = randomUUID()
      const tag = TAGS[Math.floor(rnd() * TAGS.length)]
      const idx = text.indexOf(' ', 40)
      const cut = idx === -1 ? Math.floor(text.length / 2) : idx
      const snippet = text.slice(0, cut)
      text = `<span data-span-id="${spanId}" data-tag-id="${tag.id}">${snippet}</span>${text.slice(cut)}`
      spanTags.push({ id: spanId, tagId: tag.id, documentId: id, snippet })
    } else if (roll < 0.10) {
      const commentId = randomUUID()
      const idx = text.indexOf(' ', 30)
      const cut = idx === -1 ? Math.floor(text.length / 2) : idx
      const snippet = text.slice(0, cut)
      text = `<span data-comment-id="${commentId}">${snippet}</span>${text.slice(cut)}`
      comments.push({
        id: commentId,
        documentId: id,
        body: pick([
          'Check this against the harbour records — the dates may not line up.',
          'Too close to the phrasing in chapter 9. Vary it.',
          'Is Wren supposed to know this yet? Continuity.',
          'Lovely, but it slows the scene. Consider cutting the second half.',
          'Need the real tidal range here before this can stand.',
          'This is the theme showing its hand a bit too plainly.'
        ]),
        // CommentRecord.createdAt is epoch ms, not an ISO string.
        createdAt: Date.now() - (comments.length % 30) * 86400000,
        snippet,
        resolved: comments.length % 5 === 0
      })
    } else if (roll < 0.13) {
      text += `<sup data-footnote="${pick([
        'The 1911 survey uses the older spelling throughout.',
        'Corwin’s account differs here; see the Kestrel Log.',
        'Tidal figures from the harbour office, not the chart.',
        'This bearing is deliberately wrong — see ch. 35.'
      ])}"></sup>`
    }

    paragraphs.push(`<p>${text}</p>`)
    words += text.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).length

    if (rnd() < 0.05) paragraphs.push('<div data-chapter-line="true"></div>')
  }

  const html = parts.concat(paragraphs).join('')
  documents.push({ id, name: `${c + 1}. ${title}`, html, words })
}

// Group chapters into four parts, so the binder has real structure.
const tree = []
for (let part = 0; part < 4; part += 1) {
  tree.push({
    id: `folder-part${part + 1}`,
    type: 'folder',
    name: `Part ${['One', 'Two', 'Three', 'Four'][part]}`,
    collapsed: part > 1,
    children: documents.slice(part * 10, part * 10 + 10).map((doc, i) => ({
      id: doc.id,
      type: 'document',
      name: doc.name,
      collapsed: false,
      synopsis: `${CHAPTER_TITLES[part * 10 + i]} — ${sentence()}`,
      statusId: STATUSES[(part * 10 + i) % 3].id,
      tagIds: (part * 10 + i) % 3 === 0 ? [TAGS[(part + i) % TAGS.length].id] : [],
      wordTarget: 500,
      children: []
    }))
  })
}
// A research folder that isn't manuscript prose, because real projects have one.
tree.push({
  id: 'folder-research',
  type: 'folder',
  name: 'Research',
  collapsed: true,
  children: [
    { id: 'doc-research-tides', type: 'document', name: 'Tide tables (raw)', collapsed: false, synopsis: 'Copied from the harbour office.', statusId: null, tagIds: ['tag-research'], wordTarget: null, children: [] },
    { id: 'doc-research-names', type: 'document', name: 'Name candidates', collapsed: false, synopsis: 'Discarded names, kept for continuity.', statusId: null, tagIds: [], wordTarget: null, children: [] }
  ]
})
documents.push({
  id: 'doc-research-tides',
  name: 'Tide tables (raw)',
  html: '<h1>Tide tables</h1><p>Spring range 6.1m, neap 2.4m. Slack water roughly forty minutes either side of high. The Drowned Mile is walkable for about ninety minutes at low water on a spring tide, less in onshore wind.</p><p>Harbour office figures, 1974 onward. Earlier records are in the Kestrel Log.</p>',
  words: 55
})
documents.push({
  id: 'doc-research-names',
  name: 'Name candidates',
  html: '<h1>Names</h1><p>Discarded: Marlowe, Pell, Ashgrove, Winterbourne. Kept: Halloway, Marchetti, Okonkwo, Ferrell, Thorn, Vance, Corwin.</p><p>Kestrelward is local usage only — nobody outside the Point says it.</p>',
  words: 34
})

// ------------------------------------------------------------------ timeline
const timeline = [
  ['The first light is lit at Kestrel Point.', 'eighty years before', ['sb-location-0'], null],
  ['The 1911 survey records a coastline that later charts omit.', '1911', ['sb-object-0'], 'doc-ch06'],
  ['Wren’s father completes his last survey of the Drowned Mile.', 'twelve years before', ['sb-character-0', 'sb-location-1'], 'doc-ch01'],
  ['Ivo takes over the Kestrel Log.', 'eleven years before', ['sb-character-1', 'sb-object-1'], 'doc-ch04'],
  ['Wren inherits the cottage and the charts.', 'spring, year one', ['sb-character-0', 'sb-location-2'], 'doc-ch22'],
  ['Serafine arrives to date the wreck.', 'early summer', ['sb-character-2'], 'doc-ch17'],
  ['The harbour commission votes on dredging.', 'midsummer', ['sb-character-4', 'sb-location-3'], 'doc-ch32'],
  ['Elias dives the Drowned Mile and surfaces early.', 'midsummer, three days later', ['sb-character-5', 'sb-location-1'], 'doc-ch26'],
  ['Nadia files the story the commission tried to bury.', 'late summer', ['sb-character-6'], 'doc-ch27'],
  ['The final sounding disagrees with every chart of record.', 'autumn', ['sb-object-0', 'sb-object-2'], 'doc-ch39'],
  ['Corwin tells the version he has never told before.', 'autumn, the last ferry', ['sb-character-7'], 'doc-ch34'],
  ['The chart of record is amended.', 'winter', ['sb-object-0'], 'doc-ch40']
].map(([description, whenText, itemIds, documentId], i) => ({
  id: `tl-${i}`,
  description,
  whenText,
  itemIds,
  documentId,
  createdAt: iso(45 - i),
  updatedAt: iso(15 - (i % 15))
}))

// --------------------------------------------------------------- submissions
const SUB_STATUSES = [
  { id: 'sub-sent', name: 'Sent' },
  { id: 'sub-no-response', name: 'No Response' },
  { id: 'sub-rejected', name: 'Rejected' },
  { id: 'sub-partial', name: 'Requested Partial' },
  { id: 'sub-full', name: 'Requested Full' },
  { id: 'sub-offer', name: 'Offer' },
  { id: 'sub-withdrawn', name: 'Withdrawn' }
]
const submissions = [
  ['Hester Quill — Quill & Vane Literary', 'sub-full', 'Asked for the full after the first fifty. Mentioned the tidal detail specifically.', 12],
  ['Aldous Byrne — Byrne Associates', 'sub-rejected', 'Passed. Said the opening is too quiet for the market.', 40],
  ['Priya Raghunathan — North Light Agency', 'sub-partial', 'Requested first three chapters. Wants the synopsis tightened.', 21],
  ['Marlow & Sons', 'sub-no-response', 'No response after eight weeks. Their stated window is six.', 60],
  ['Coastal Press (open submissions)', 'sub-sent', 'Open reading period, unagented. Sent the manuscript-format PDF.', 6],
  ['Ffion Carew — Carew Literary', 'sub-rejected', 'Kind rejection. Suggested trying again with the next book.', 75],
  ['Tessa Lindqvist — Harbourlight Books', 'sub-offer', 'Offer of representation. Call scheduled.', 3],
  ['Gareth Pryce — Pryce Literary Management', 'sub-withdrawn', 'Withdrew after the Harbourlight offer.', 2]
].map(([recipient, statusId, notes, daysAgo], i) => ({
  id: `sub-${i}`,
  recipient,
  dateSent: ymd(daysAgo),
  statusId,
  notes,
  documentId: i % 3 === 0 ? 'doc-ch01' : null,
  snapshotId: null,
  documentName: i % 3 === 0 ? '1. The Drowned Mile' : null,
  createdAt: iso(daysAgo),
  updatedAt: iso(Math.max(0, daysAgo - 2))
}))

// ------------------------------------------------------------------- sheets
function sheet(item) {
  const blocks = [
    {
      id: randomUUID(),
      kind: 'text',
      label: 'Overview',
      html: `<p>${item.summary}</p><p>${sentence()} ${sentence()}</p>`
    },
    {
      id: randomUUID(),
      kind: 'stats',
      label: 'At a glance',
      pairs:
        item.typeId === 'sb-character'
          ? [
              { id: randomUUID(), label: 'Age', value: String(28 + (item.name.length % 30)) },
              { id: randomUUID(), label: 'From', value: pick(['Sallow Harbour', 'Kestrel Point', 'inland', 'the city']) },
              { id: randomUUID(), label: 'Wants', value: pick(['the truth', 'to be left alone', 'the survey reopened', 'her father’s name cleared']) }
            ]
          : item.typeId === 'sb-location'
            ? [
                { id: randomUUID(), label: 'First appears', value: pick(['Ch. 1', 'Ch. 3', 'Ch. 11', 'Ch. 22']) },
                { id: randomUUID(), label: 'Tidal', value: pick(['yes', 'no', 'at springs only']) }
              ]
            : [
                { id: randomUUID(), label: 'Provenance', value: pick(['1911 survey', 'harbour office', 'unknown', 'Halloway estate']) },
                { id: randomUUID(), label: 'Condition', value: pick(['fragile', 'annotated', 'water-damaged', 'intact']) }
              ]
    },
    {
      id: randomUUID(),
      kind: 'list',
      label: item.typeId === 'sb-character' ? 'Beats' : 'Notes',
      style: 'bullet',
      items: [sentence(), sentence(), sentence()]
    }
  ]
  return { itemId: item.id, blocks }
}

// -------------------------------------------------------------------- write
await mkdir(join(target, 'documents'), { recursive: true })
await mkdir(join(target, 'storybible', 'sheets'), { recursive: true })

for (const doc of documents) {
  await writeFile(join(target, 'documents', `${doc.id}.html`), doc.html, 'utf-8')
}
for (const item of items) {
  await writeFile(join(target, 'storybible', 'sheets', `${item.id}.json`), JSON.stringify(sheet(item), null, 2), 'utf-8')
}

const totalWords = documents.reduce((sum, d) => sum + d.words, 0)

const json = (name, data) => writeFile(join(target, name), JSON.stringify(data, null, 2), 'utf-8')

await json('binder.json', {
  version: 1,
  tree,
  lastOpenDocumentId: 'doc-ch01',
  wordCountBaseline: { date: ymd(0), count: totalWords },
  projectName: 'The Drowned Mile',
  viewState: {
    activeView: 'editor',
    manuscriptView: 'editor',
    outlinerSort: null,
    outlinerFilter: '',
    statusFilter: [],
    tagFilter: [],
    referenceDocumentId: null,
    splitViewLocked: false,
    splitViewSyncScroll: false
  },
  statuses: STATUSES,
  tags: TAGS,
  savedViews: [
    { id: 'view-needs-work', name: 'Needs work', statusFilter: ['status-draft'], tagFilter: ['tag-research'] },
    { id: 'view-final', name: 'Final chapters', statusFilter: ['status-final'], tagFilter: [] }
  ],
  overusedIgnoreList: ['tide', 'chart', 'harbour', 'water'],
  authorName: 'J. Moore',
  projectWordTarget: 90000,
  projectDeadline: ymd(-120),
  projectTargetStartDate: ymd(60),
  projectTargetStartCount: 0
})

await json('storybible/index.json', { version: 1, items, types: TYPES })
await json('lexicon.json', { version: 1, entries: lexicon })
await json('spanTags.json', { version: 1, spans: spanTags })
await json('comments.json', { version: 1, comments })
await json('timeline.json', { version: 1, entries: timeline })
await json('relationships.json', { version: 1, relationships })
await json('submissions.json', { version: 1, submissions, statuses: SUB_STATUSES })
await json('suppressedWords.json', {
  version: 1,
  words: [
    ...lexicon.flatMap((e) => e.word.split(/\s+/).map((w) => ({ word: w.toLowerCase(), sources: ['lexicon'] }))),
    ...items.flatMap((i) =>
      [i.name, ...i.aliases]
        .flatMap((p) => p.split(/[^\p{L}\p{N}'’-]+/u))
        .filter((w) => w.length > 1)
        .map((w) => ({ word: w.toLowerCase(), sources: ['storyBible'] }))
    )
  ].reduce((acc, entry) => {
    const found = acc.find((e) => e.word === entry.word)
    if (found) {
      if (!found.sources.includes(entry.sources[0])) found.sources.push(entry.sources[0])
    } else acc.push(entry)
    return acc
  }, [])
})

console.log(`Demo project written to ${target}`)
console.log(`  ${documents.length} documents (${totalWords.toLocaleString()} words) in ${tree.length} folders`)
console.log(`  ${items.length} Story Bible items (${CHARACTERS.length} characters, ${LOCATIONS.length} locations, ${OBJECTS.length} objects) with sheets`)
console.log(`  ${relationships.length} relationships, ${timeline.length} timeline entries`)
console.log(`  ${lexicon.length} Lexicon entries, ${spanTags.length} span tags, ${comments.length} comments`)
console.log(`  ${submissions.length} query-tracker entries, ${TAGS.length} tags, ${STATUSES.length} statuses`)
