/**
 * Builds a ChapterFlow fixture project on disk, deterministically.
 *
 *   node scripts/make-fixture-project.mjs <shape> "<target folder>" [options]
 *
 *     <shape>            small | realistic
 *     --seed <n>         default 20260913
 *     --truth <path>     where the ground-truth file goes
 *                        (default "<target>.truth.json", beside the project)
 *     --force            allow writing over an existing project
 *     --quiet            no summary on stdout
 *
 * Why this exists rather than stored fixture projects: a generator keeps a
 * large corpus out of git, and it can plant ground truth that a stored file
 * cannot carry. Every number a test wants to assert — words per document,
 * how many times a character's name appears in chapter 19, which tagged spans
 * are where — is decided here and written to a truth file beside the project,
 * so a test asserts exactness rather than asserting that nothing crashed.
 *
 * Three rules hold this together, and each is checked by `tests/generator.test.ts`
 * rather than trusted:
 *
 * 1. **Determinism, all the way down.** Every choice comes from a seeded
 *    generator, every id is derived from the seed, and every date is an offset
 *    from a fixed epoch. Nothing calls `randomUUID`, `Date.now`, or reads the
 *    clock, the locale or the environment. Two runs with the same shape and
 *    seed produce byte-identical files.
 * 2. **The file shapes the stores write.** `binder.json` is written in the key
 *    order `binderStore.persist()` uses, with every field `normalizeTree`
 *    would otherwise backfill already present, so opening a generated project
 *    fires no migration and no repair: load it and persist it and the bytes do
 *    not move. The same goes for `storybible/index.json`, the sheets, and
 *    `spanTags.json`.
 * 3. **The prose can only contain the entity names that were planted.** The
 *    word pools are filtered against every Story Bible name and alias before a
 *    sentence is built, so an occurrence of "Halloway" in chapter 12 is there
 *    because this file put it there. That is what makes the placement counts
 *    ground truth and not an estimate.
 *
 * Two deliberate non-goals. The prose is scaffolding, not writing: it exists
 * to have the right shape, the right size and known contents. And no real
 * manuscript content appears anywhere in here — the names, places and prose
 * are invented for the fixture, per the rule in TESTING-PLAN.md.
 *
 * The Pathological and Ceiling shapes of TESTING-PLAN.md are not here yet;
 * row 7A adds the wide ceiling.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const SHAPES = ['small', 'realistic']
export const DEFAULT_SEED = 20260913

/** Every date in a generated project is this plus a whole number of days. A
 *  fixture that reads the clock is a fixture that stops being byte-identical
 *  tomorrow, so the clock is never read. */
const EPOCH = Date.UTC(2026, 0, 5) // 2026-01-05, a Monday

// ---------------------------------------------------------------- randomness

/** FNV-1a, used only to turn a stream name into a seed offset. */
function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Mulberry32 — small, deterministic, and adequate for scaffolding. */
function mulberry32(state) {
  let a = state | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A named stream off the one seed.
 *
 * Named rather than shared because a single stream couples everything to
 * everything: adding one sentence to the Notes folder would shift every id,
 * every status and every entity placement in the manuscript, and a diff
 * between two seeds would say nothing. With named streams a change stays
 * inside the stream it was made in.
 */
function streamFor(seed, name) {
  return mulberry32((seed ^ fnv1a(name)) | 0)
}

const pick = (rnd, list) => list[Math.floor(rnd() * list.length)]

/** An integer in [min, max]. */
const between = (rnd, min, max) => min + Math.floor(rnd() * (max - min + 1))

/**
 * A v4-shaped id drawn from a seeded stream.
 *
 * Shaped like `randomUUID()` output on purpose — a fixture whose ids are all
 * `doc-ch07` exercises shorter filenames and simpler string handling than a
 * real project ever has — but derived from the seed, so it is stable across
 * runs. The truth file carries the id-to-name mapping, so a failing assertion
 * naming a uuid can still be read.
 */
function idFrom(rnd) {
  const hex = (n) =>
    Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('')
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(rnd() * 4)]}${hex(3)}-${hex(12)}`
}

const isoDay = (days) => new Date(EPOCH + days * 86400000).toISOString()
const ymd = (days) => isoDay(days).slice(0, 10)

// ------------------------------------------------------------------ the cast
//
// Invented for the fixture. Every surface form below is deliberately built
// from words that do not appear in the prose pools, so a match in a document
// is always a planted one. `forms` is the name plus its aliases, which is
// exactly what prepareMentionMatching flattens for detection.

const CAST = [
  ['sb-character', 'Ottiline Varrow', ['Ottiline', 'Varrow'], 'Keeps the ledger nobody else will sign.'],
  ['sb-character', 'Bastian Kell', ['Bastian', 'Kell'], 'Inherited the post and the argument that came with it.'],
  ['sb-character', 'Mireille Sandoz', ['Mireille', 'Sandoz'], 'Brought in to settle the question and stayed.'],
  ['sb-character', 'Aurel Pettigrew', ['Aurel', 'Pettigrew'], 'Says less each year and is listened to more.'],
  ['sb-character', 'Halvard Ennis', ['Halvard', 'Ennis'], 'Was there the first time and denies it.'],
  ['sb-character', 'Junia Thackeray', ['Junia', 'Thackeray'], 'Writes it all down, which is the trouble.'],
  ['sb-location', 'Vantry Reach', ['Vantry'], 'Two miles of it, and most of that underwater by evening.'],
  ['sb-location', 'Marrowgate', ['the Marrowgate'], 'The way in, when there is a way in.'],
  ['sb-location', 'Culliver House', ['Culliver'], 'Too large for one occupant and has had one for years.'],
  ['sb-location', 'Ospray Bend', ['Ospray'], 'Where the channel turns and the survey stops.'],
  ['sb-object', 'The Varrow Ledger', ['Varrow Ledger'], 'Eleven years of entries in one hand.'],
  ['sb-object', 'The Marrowgate Key', ['Marrowgate Key'], 'Older than the door it belongs to.']
]

const SMALL_CAST_SIZE = 3

// ------------------------------------------------------------- the word pools
//
// Breadth matters as much as volume: a fixture drawing on forty words produces
// a corpus where almost every query matches almost everything, which cannot
// exercise search ranking at all. Real prose is Zipfian, so a common pool
// carries the volume and a rare tail makes queries discriminating.

const NOUNS = [
  'tide','ledger','anchor','compass','lantern','rope','hull','keel','beacon','current',
  'shoal','estuary','breakwater','jetty','pontoon','mooring','buoy','sediment','gravel','shingle',
  'saltmarsh','headland','inlet','channel','fathom','bearing','almanac','sextant','tripod','benchmark',
  'datum','contour','transect','affidavit','deposition','minute','memorandum','inventory','receipt','margin',
  'stairwell','threshold','doorway','window','shutter','hearth','kettle','tablecloth','cupboard','gull',
  'cormorant','heron','mackerel','herring','crab','limpet','barnacle','weather','squall','gale',
  'drizzle','fog','frost','thaw','swell','undertow','inheritance','deed','covenant','boundary',
  'tenure','freehold','lease','probate','testament','silence','rumour','testimony','confession','apology',
  'argument','bargain','promise','refusal','concession','notebook','envelope','postcard','telegram','signature'
]
const ADJECTIVES = [
  'grey','brackish','weathered','uncertain','meticulous','careless','faded','provisional','disputed','shallow',
  'narrow','windward','sheltered','exposed','derelict','serviceable','immaculate','ruined','cold','luminous',
  'overcast','brittle','sodden','frayed','tarnished','annotated','unsigned','patient','impatient','methodical',
  'evasive','candid','guarded','stubborn','forgiving','courteous','half-finished','second-hand','unremarkable','borrowed'
]
const VERBS = [
  'measured','recorded','disputed','confirmed','withdrew','annotated','misread','recalculated','filed','forgot',
  'remembered','questioned','defended','abandoned','retrieved','copied','burned','buried','inherited','returned',
  'sounded','charted','surveyed','dredged','salvaged','anchored','drifted','beached','admitted','denied',
  'implied','conceded','insisted','hesitated','relented','objected','testified','signed','counted','waited'
]
const ADVERBS = [
  'carefully','reluctantly','twice','openly','privately','again','eventually','deliberately','quietly','afterwards',
  'plainly','briefly','repeatedly','unwillingly','politely','early'
]
const RARE = [
  'abeyance','acquiesce','admonition','alluvial','anemone','appraisal','arbitration','archipelago','armature','arrears',
  'askance','asperity','attestation','augury','austerity','ballast','balustrade','bereavement','bittern','bracken',
  'brigantine','bulkhead','bureaucracy','cadence','cairn','calamity','calcite','candour','causeway','censure',
  'chandlery','chronicle','circumspect','clemency','codicil','coercion','collier','compendium','concordance','confluence',
  'conjecture','consignment','contrition','conveyance','coracle','cordage','counterfoil','crevice','culvert','cupola',
  'curlew','dalliance','debenture','decorum','demurrage','diffidence','diligence','disquiet','dissent','divergence',
  'dowager','dredger','driftwood','duplicity','effluent','egress','elegy','embankment','encroach','endowment',
  'enmity','equinox','erosion','escarpment','estrangement','exigency','extremity','facsimile','felicity','ferrule',
  'fiduciary','filament','firmament','flotsam','forbearance','fortitude','franchise','fulcrum','gantry','glacis',
  'gossamer','gradient','granary','gratuity','gunwale','harrowing','hawser','headwater','hinterland','hoarfrost',
  'husbandry','impasse','impound','incumbent','indenture','ingress','inquest','insolvent','intaglio','interment',
  'invective','jetsam','keelson','laconic','larboard','latitude','leaching','levee','lichen','liminal',
  'littoral','longshore','lugger','manifest','marginalia','mercantile','meridian','millrace','misgiving','mitigation',
  'mordant','muniment','obdurate','obeisance','obfuscate','occlusion','ordnance','ossuary','outfall','palisade',
  'parapet','parsimony','pellucid','penumbra','peregrine','perfidy','perjury','petrel','pilotage','pinnace',
  'plangent','plumbline','precedent','probity','promontory','provenance','purlieu','quagmire','quarantine','quayside',
  'quiescent','ratification','reclamation','recompense','redress','remittance','repository','requisition','rescind','restitution',
  'revetment','riparian','rookery','salvor','sanction','scarcity','schooner','scrivener','scupper','sequester',
  'shipwright','sluice','solvency','spillway','stanchion','stipend','stratum','subpoena','subsidence','surveyor',
  'taciturn','tallow','tenement','testator','tidewater','tonnage','topography','transcript','tribunal','truculent',
  'tumult','turbid','umbrage','undertaking','vagary','vellum','veracity','vestige','victualler','vindication',
  'wainscot','warrant','watershed','weir','wharfage','windlass','winnow','wreckage','yardarm','zephyr'
]
const CONNECTIVES = [
  'and afterwards','though nobody said so','because the record demanded it','while the light turned',
  'until the figures agreed','before the weather closed in','as the water fell back','once the tide had gone',
  'even so','in the end','for the second time that week','against her better judgement'
]

const CHAPTER_TITLES = [
  'Low Water','Soundings','The Ledger','What the Record Says','Slack Tide','Dead Reckoning','Harbour Business',
  'A Coastline That Is Not There','The Ferry','Spring Tide','Salvage','Correspondence','The Commissioner',
  'Neap','The Survey','Two Accounts','Sediment','First Light','Bearings','The House','Rhumbline','Silt',
  'A Second Opinion','The Dive','Depositions','Slack Water','The Missing Sheet','Cartouche','Spindrift',
  'The Vote','Foreshore','What Was Remembered','Transit','The Wreck','Leeward','Wrackline','The Last Sounding',
  'Chart of Record','Undertow','The Long Way Round','Quayside','Ballast','The Second Ledger','Groundswell',
  'The Turning','Backwater','The Amended Chart','Last Entry'
]

export const TAGS = [
  { id: 'tag-foreshadow', name: 'Foreshadowing', color: '#b8862f' },
  { id: 'tag-research', name: 'Needs research', color: '#c26a5a' },
  { id: 'tag-continuity', name: 'Continuity risk', color: '#6f95b8' },
  { id: 'tag-cut', name: 'Possible cut', color: '#8a8a8a' },
  { id: 'tag-theme', name: 'Theme: inheritance', color: '#4b9363' }
]

/** Kept identical to DEFAULT_STATUSES in src/shared/statusDefaults.ts, and to
 *  DEFAULT_STORY_BIBLE_TYPES in src/shared/storyBibleTypeDefaults.ts. The
 *  generator is a .mjs script and cannot import the TypeScript sources, so
 *  `tests/generator.test.ts` imports both and asserts the copies still agree
 *  — drift arrives as a failing assertion rather than as a fixture that
 *  quietly stops resembling a real project. */
export const STATUSES = [
  { id: 'status-draft', name: 'Draft', color: '#8a8a8a' },
  { id: 'status-revising', name: 'Revising', color: '#d9a441' },
  { id: 'status-final', name: 'Final', color: '#4b9363' }
]
export const STORY_BIBLE_TYPES = [
  { id: 'sb-character', name: 'Character', color: '#6f95b8' },
  { id: 'sb-location', name: 'Location', color: '#4b9363' },
  { id: 'sb-object', name: 'Object', color: '#d9a441' }
]

/** The five fixed ids from src/shared/binder.ts. Asserted against the real
 *  constants by the suite, same as the two lists above. */
export const STRUCTURAL = [
  { id: 'structural-draft', name: 'Draft' },
  { id: 'structural-notes', name: 'Notes' },
  { id: 'structural-matter', name: 'Matter' },
  { id: 'structural-archive', name: 'Archive' },
  { id: 'structural-trash', name: 'Trash' }
]

const SNIPPET_MAX_LENGTH = 120 // mirrors spanTagStore

// ------------------------------------------------------------------- prose

/** Every whole word used by any name or alias, lowercased. The pools are
 *  filtered against this, which is what makes a planted occurrence the only
 *  kind of occurrence there can be. */
function entityWordSet(cast) {
  const words = new Set()
  for (const [, name, aliases] of cast) {
    for (const form of [name, ...aliases]) {
      for (const word of form.split(/[^\p{L}\p{N}'’-]+/u)) {
        if (word) words.add(word.toLowerCase())
      }
    }
  }
  return words
}

function buildPools(cast) {
  const banned = entityWordSet(cast)
  const clean = (list) =>
    list.filter((entry) => !entry.split(/\s+/).some((word) => banned.has(word.toLowerCase())))
  return {
    nouns: clean(NOUNS),
    adjectives: clean(ADJECTIVES),
    verbs: clean(VERBS),
    adverbs: clean(ADVERBS),
    rare: clean(RARE),
    connectives: clean(CONNECTIVES)
  }
}

/** Words, never phrases with spaces in them: the token count of a paragraph
 *  is its word count, and that identity is what lets a document be built to an
 *  exact planted total. Phrases from CONNECTIVES are split into their words by
 *  the sentence builder before they are pushed. */
function noun(rnd, pools) {
  return rnd() < 0.25 ? pick(rnd, pools.rare) : pick(rnd, pools.nouns)
}

/** One sentence as a list of word tokens, with no trailing full stop — the
 *  caller closes it, because the caller may have to cut it short to land on a
 *  word budget exactly. */
function sentenceTokens(rnd, pools, opening) {
  const tokens = opening ? [...opening] : []
  const shape = Math.floor(rnd() * 5)
  if (shape === 0) {
    tokens.push(pick(rnd, pools.verbs), 'the', pick(rnd, pools.adjectives), noun(rnd, pools), pick(rnd, pools.adverbs))
  } else if (shape === 1) {
    tokens.push('had', pick(rnd, pools.verbs), 'the', noun(rnd, pools), ...pick(rnd, pools.connectives).split(' '))
  } else if (shape === 2) {
    tokens.push(pick(rnd, pools.verbs), 'a', pick(rnd, pools.adjectives), noun(rnd, pools), 'nobody', 'had', pick(rnd, pools.verbs))
  } else if (shape === 3) {
    tokens.push(
      pick(rnd, pools.verbs), 'the', noun(rnd, pools), 'and', pick(rnd, pools.verbs), 'the',
      pick(rnd, pools.adjectives), noun(rnd, pools)
    )
  } else {
    tokens.push('left', 'the', noun(rnd, pools), 'on', 'the', pick(rnd, pools.adjectives), noun(rnd, pools))
  }
  return tokens
}

/** A subject for a sentence: a planted entity form when one is due, otherwise
 *  an ordinary noun phrase. Returned as word tokens. */
function subjectTokens(rnd, pools, plantedForm) {
  if (plantedForm) return plantedForm.split(' ')
  return rnd() < 0.5 ? ['The', pick(rnd, pools.adjectives), noun(rnd, pools)] : ['Someone']
}

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * Builds one document's body to exactly `budget` words, using up every form in
 * `plantings` on the way.
 *
 * The exactness is the point: `countWords` on the finished HTML has to equal
 * the planted number, or the fixture cannot be used to assert a word count.
 * Tokens never contain whitespace and tags are always separated by tag
 * boundaries, which `countWords` turns into spaces, so token count and word
 * count are the same number.
 */
function buildBody(rnd, pools, budget, plantings, spanPlan) {
  const queue = [...plantings]
  const paragraphs = []
  const spans = []
  let used = 0
  let paragraph = []
  let sentencesInParagraph = 0
  let sentenceIndex = 0
  let openSpan = null
  let openSpanText = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    paragraphs.push(paragraph)
    paragraph = []
    sentencesInParagraph = 0
  }

  while (used < budget) {
    const remaining = budget - used
    // Once the queue is long enough to fill what is left, every remaining
    // sentence opens with a planted form. In practice budgets are far larger
    // than their placements, so this only ever guards the tail.
    // Twelve words is a little more than a sentence of this generator costs,
    // so the forced branch starts early enough for every queued form to get a
    // sentence of its own. planPlacements caps a document's placements well
    // below that, so in practice this only tidies the tail.
    //
    // Never in the document's first sentence. The main process reads a
    // document's text for mention detection as `parse(html).textContent`,
    // which concatenates nodes with nothing between them: a heading ending in
    // a letter and a first sentence starting with a name become one word, and
    // the whole-word match that detection depends on would not fire. A planted
    // occurrence has to be findable by the app's own path, so the junction is
    // simply left alone.
    const takePlanting =
      queue.length > 0 && sentenceIndex > 0 && (rnd() < 0.22 || queue.length * 12 >= remaining)
    const form = takePlanting ? queue.shift() : null
    let tokens = [...subjectTokens(rnd, pools, form), ...sentenceTokens(rnd, pools, null)]
    if (tokens.length > remaining) {
      // Cutting a sentence short is how the document lands on its budget
      // exactly. A planted form is never cut: it is the first thing in the
      // sentence and the tail is what goes.
      if (form && remaining < form.split(' ').length + 1) {
        // Not enough room left for this form — give the budget back to it by
        // closing the previous sentence early. Only reachable for a budget
        // smaller than any shape this generator produces, so it throws rather
        // than silently dropping a planted occurrence.
        throw new Error(`word budget ${budget} too small for its ${plantings.length} plantings`)
      }
      tokens = tokens.slice(0, remaining)
    }
    tokens[0] = capitalize(tokens[0])
    const text = `${tokens.join(' ')}.`
    if (!openSpan) openSpan = spanPlan.find((entry) => entry.sentenceIndex === sentenceIndex) ?? null
    if (openSpan) {
      // A span can run over more than one sentence, which is what a writer
      // tagging a passage actually does — and what makes some snippets longer
      // than spanTagStore's 120-character limit, so the truncation rule is
      // exercised rather than assumed.
      openSpanText.push(text)
      if (openSpanText.length >= openSpan.sentences) {
        const joined = openSpanText.join(' ')
        spans.push({ id: openSpan.id, tagId: openSpan.tagId, text: joined })
        paragraph.push({ spanId: openSpan.id, tagId: openSpan.tagId, text: joined })
        openSpan = null
        openSpanText = []
      }
    } else {
      paragraph.push({ spanId: null, tagId: null, text })
    }
    used += tokens.length
    sentencesInParagraph += 1
    sentenceIndex += 1
    // A paragraph never breaks in the middle of a tagged span: the span is one
    // element, and an element cannot straddle two paragraphs.
    if (!openSpan && sentencesInParagraph >= between(rnd, 3, 6)) flushParagraph()
  }
  if (openSpan && openSpanText.length > 0) {
    // The budget ran out mid-span. The span still has to close, or the HTML
    // would carry sentences the index has no record of.
    const joined = openSpanText.join(' ')
    spans.push({ id: openSpan.id, tagId: openSpan.tagId, text: joined })
    paragraph.push({ spanId: openSpan.id, tagId: openSpan.tagId, text: joined })
  }
  flushParagraph()

  if (queue.length > 0) {
    throw new Error(`${queue.length} planted forms did not fit in a ${budget}-word document`)
  }
  return { paragraphs, spans }
}

/** Mirrors spanTagStore.truncateSnippet exactly; the suite asserts the two
 *  agree by rebuilding the index from the generated HTML. */
function snippetOf(text) {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > SNIPPET_MAX_LENGTH ? `${collapsed.slice(0, SNIPPET_MAX_LENGTH)}…` : collapsed
}

function renderHtml(title, paragraphs) {
  const parts = [`<h1>${title}</h1>`]
  for (const paragraph of paragraphs) {
    const inner = paragraph
      .map((sentence) =>
        sentence.spanId
          ? `<span data-span-id="${sentence.spanId}" data-tag-id="${sentence.tagId}">${sentence.text}</span>`
          : sentence.text
      )
      .join(' ')
    parts.push(`<p>${inner}</p>`)
  }
  return parts.join('')
}

/** The same visible-text reduction countWords uses, so the generator can
 *  check its own arithmetic before it writes anything. */
function visibleText(html) {
  return html.replace(/<[^>]*>/g, ' ')
}

function countWords(html) {
  return visibleText(html).trim().split(/\s+/).filter(Boolean).length
}

// ------------------------------------------------------------- the blueprints
//
// A blueprint is the tree before ids and prose: what folders exist, what
// documents are in them, how many words each document gets and which entity
// forms are planted in it. Keeping it separate is what makes the id
// assignment a single ordered pass, and therefore reproducible.

function smallBlueprint(seed) {
  const rnd = streamFor(seed, 'blueprint-small')
  const cast = CAST.slice(0, SMALL_CAST_SIZE)
  const chapters = [0, 1, 2, 3].map((i) => ({
    kind: 'document',
    title: CHAPTER_TITLES[i],
    name: `${i + 1}. ${CHAPTER_TITLES[i]}`,
    words: 220 + i * 60,
    chapterNumber: i + 1,
    statusId: STATUSES[i % STATUSES.length].id,
    tagIds: i % 2 === 0 ? [TAGS[i % TAGS.length].id] : [],
    wordTarget: 500
  }))
  return {
    shape: 'small',
    projectName: 'Vantry Reach (small fixture)',
    cast,
    draft: [
      { kind: 'folder', name: 'Part One', isPart: true, children: chapters.slice(0, 2) },
      ...chapters.slice(2)
    ],
    notes: [
      { kind: 'document', title: 'Tide notes', name: 'Tide notes', words: 90, statusId: null, tagIds: ['tag-research'], wordTarget: null, chapterNumber: null }
    ],
    matter: [
      { kind: 'document', title: 'Title page', name: 'Title page', words: 40, statusId: null, tagIds: [], wordTarget: null, chapterNumber: null }
    ],
    custom: [],
    archive: [],
    spanCount: 2,
    placementsPerDocument: () => between(rnd, 1, 3)
  }
}

function realisticBlueprint(seed) {
  const rnd = streamFor(seed, 'blueprint-realistic')
  const cast = CAST
  const PARTS = 4
  const PER_PART = 12
  const TOTAL_WORDS = 120000

  // Chapter lengths vary the way a novel's do, then the whole set is scaled
  // onto the stated total and the remaining few words are spread one at a
  // time. Absorbing the correction in one chapter instead would let a change
  // to the length range turn into a chapter of an absurd size, silently.
  const raw = []
  for (let i = 0; i < PARTS * PER_PART; i += 1) raw.push(between(rnd, 1900, 3300))
  const rawTotal = raw.reduce((a, b) => a + b, 0)
  const counts = raw.map((n) => Math.max(800, Math.round((n * TOTAL_WORDS) / rawTotal)))
  let drift = TOTAL_WORDS - counts.reduce((a, b) => a + b, 0)
  for (let i = 0; drift !== 0; i = (i + 1) % counts.length) {
    const step = drift > 0 ? 1 : -1
    counts[i] += step
    drift -= step
  }

  const draft = []
  for (let part = 0; part < PARTS; part += 1) {
    const children = []
    for (let c = 0; c < PER_PART; c += 1) {
      const index = part * PER_PART + c
      children.push({
        kind: 'document',
        title: CHAPTER_TITLES[index],
        name: `${index + 1}. ${CHAPTER_TITLES[index]}`,
        words: counts[index],
        chapterNumber: index + 1,
        statusId: STATUSES[index % STATUSES.length].id,
        tagIds: index % 4 === 0 ? [TAGS[index % TAGS.length].id] : [],
        wordTarget: 2500
      })
    }
    draft.push({
      kind: 'folder',
      name: `Part ${['One', 'Two', 'Three', 'Four'][part]}`,
      isPart: true,
      children
    })
  }

  return {
    shape: 'realistic',
    projectName: 'Vantry Reach',
    cast,
    draft,
    notes: [
      { kind: 'document', title: 'Tide tables', name: 'Tide tables', words: 260, statusId: null, tagIds: ['tag-research'], wordTarget: null, chapterNumber: null },
      { kind: 'document', title: 'Name candidates', name: 'Name candidates', words: 180, statusId: null, tagIds: [], wordTarget: null, chapterNumber: null },
      {
        kind: 'folder',
        name: 'Interviews',
        children: [
          { kind: 'document', title: 'The harbour office', name: 'The harbour office', words: 420, statusId: null, tagIds: ['tag-continuity'], wordTarget: null, chapterNumber: null },
          { kind: 'document', title: 'The ferry log', name: 'The ferry log', words: 380, statusId: null, tagIds: [], wordTarget: null, chapterNumber: null }
        ]
      }
    ],
    matter: [
      { kind: 'document', title: 'Title page', name: 'Title page', words: 40, statusId: null, tagIds: [], wordTarget: null, chapterNumber: null },
      { kind: 'document', title: 'Dedication', name: 'Dedication', words: 24, statusId: null, tagIds: [], wordTarget: null, chapterNumber: null },
      { kind: 'document', title: 'Acknowledgements', name: 'Acknowledgements', words: 210, statusId: null, tagIds: [], wordTarget: null, chapterNumber: null }
    ],
    // One folder of the writer's own, beside Draft rather than inside it — the
    // isTopLevel case, which a fixture without one never exercises.
    custom: [
      {
        kind: 'folder',
        name: 'Planning',
        isTopLevel: true,
        children: [
          { kind: 'document', title: 'Beat sheet', name: 'Beat sheet', words: 340, statusId: null, tagIds: ['tag-theme'], wordTarget: null, chapterNumber: null },
          {
            kind: 'folder',
            name: 'Discarded',
            children: [
              { kind: 'document', title: 'Opening that did not work', name: 'Opening that did not work', words: 520, statusId: null, tagIds: ['tag-cut'], wordTarget: null, chapterNumber: null }
            ]
          }
        ]
      }
    ],
    archive: [
      { kind: 'document', title: 'Cut chapter', name: 'Cut chapter', words: 900, statusId: 'status-draft', tagIds: ['tag-cut'], wordTarget: null, chapterNumber: null }
    ],
    spanCount: 24,
    placementsPerDocument: () => between(rnd, 2, 9)
  }
}

// --------------------------------------------------------------- the assembly

/** Walks the blueprint in a fixed order handing out ids. One pass, one
 *  stream, so the nth document in the tree always gets the nth id. */
function assignIds(blueprint, seed) {
  const rnd = streamFor(seed, 'ids')
  const documents = []
  const walk = (nodes, folderPath) => {
    for (const node of nodes) {
      node.id = idFrom(rnd)
      if (node.kind === 'folder') walk(node.children, [...folderPath, node.name])
      else {
        node.folderPath = folderPath
        documents.push(node)
      }
    }
  }
  // The root each group hangs off, which is what folderPath in the truth file
  // records. The writer's own top-level folders hang off the binder root
  // itself, so their path starts with their own name.
  walk(blueprint.draft, ['Draft'])
  walk(blueprint.notes, ['Notes'])
  walk(blueprint.matter, ['Matter'])
  walk(blueprint.custom, [])
  walk(blueprint.archive, ['Archive'])
  return documents
}

function buildCast(blueprint, seed) {
  const rnd = streamFor(seed, 'cast')
  return blueprint.cast.map(([typeId, name, aliases, summary], i) => ({
    id: idFrom(rnd),
    typeId,
    name,
    aliases,
    summary,
    createdAt: isoDay(i),
    updatedAt: isoDay(30 + i)
  }))
}

/**
 * Decides, before any prose exists, which entity forms go in which document
 * and how many times. The result is the ground truth; the prose is then built
 * to contain exactly this and nothing else.
 */
function planPlacements(blueprint, documents, cast, seed) {
  const rnd = streamFor(seed, 'placements')
  const plan = new Map() // documentId -> array of surface forms, in order
  for (const doc of documents) {
    const forms = []
    // Matter and very short documents carry no cast: a title page with a
    // character name in it is not what a real project looks like, and the
    // budget check would fight it.
    if (doc.words >= 150) {
      // One planted form gets a sentence of its own, so a document can hold
      // roughly one per sixteen words and still read as prose with names in
      // it rather than a list of names. Short documents therefore carry few,
      // which is also what a real project looks like.
      const capacity = Math.floor(doc.words / 16)
      const howMany = blueprint.placementsPerDocument()
      for (let i = 0; i < howMany && forms.length < capacity; i += 1) {
        const item = pick(rnd, cast)
        const surfaces = [item.name, ...item.aliases]
        const form = pick(rnd, surfaces)
        const repeats = between(rnd, 1, 3)
        for (let r = 0; r < repeats && forms.length < capacity; r += 1) forms.push(form)
      }
    }
    plan.set(doc.id, forms)
  }
  return plan
}

/** Which sentences of which documents carry a tagged span. Planned up front
 *  for the same reason placements are: the truth file has to be able to say
 *  where they are. */
function planSpans(blueprint, documents, seed) {
  const rnd = streamFor(seed, 'spans')
  const eligible = documents.filter((doc) => doc.words >= 200)
  const perDocument = new Map(eligible.map((doc) => [doc.id, []]))
  for (let i = 0; i < blueprint.spanCount && eligible.length > 0; i += 1) {
    const doc = pick(rnd, eligible)
    perDocument.get(doc.id).push({
      id: idFrom(rnd),
      tagId: TAGS[i % TAGS.length].id,
      sentenceIndex: between(rnd, 0, 12),
      // One to three sentences. Three of this generator's sentences run past
      // spanTagStore's 120-character snippet limit, so the fixture carries
      // both sides of that rule.
      sentences: between(rnd, 1, 3)
    })
  }
  // Two spans overlapping in one document would produce one element in the
  // HTML and two records in the truth file, so the later one is dropped
  // rather than allowed to disagree.
  for (const [id, spans] of perDocument) {
    const ordered = [...spans].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
    const kept = []
    let nextFree = 0
    for (const span of ordered) {
      if (span.sentenceIndex < nextFree) continue
      kept.push(span)
      nextFree = span.sentenceIndex + span.sentences
    }
    perDocument.set(id, kept)
  }
  return perDocument
}

/** The regex convention prepareMentionMatching uses: longest form first, so a
 *  full name wins over an alias that is a prefix of it, whole-word and
 *  case-insensitive. Mirrored here so the planted counts are counted the way
 *  detection will count them. */
function mentionRegex(cast) {
  const forms = []
  for (const item of cast) for (const form of [item.name, ...item.aliases]) forms.push({ form, itemId: item.id })
  forms.sort((a, b) => b.form.length - a.form.length)
  const escaped = forms.map((f) => f.form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return {
    regex: new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'gi'),
    // Keyed by lowercased text because the match is case-insensitive: an alias
    // written "the Marrowgate" arrives as "The Marrowgate" when it opens a
    // sentence, and both have to count as the same form or the truth file
    // would carry two entries for one alias.
    lookup: new Map(forms.map((f) => [f.form.toLowerCase(), { form: f.form, itemId: f.itemId }]))
  }
}

function generate(shape, seed) {
  const blueprint = shape === 'small' ? smallBlueprint(seed) : realisticBlueprint(seed)
  const pools = buildPools(blueprint.cast)
  const documents = assignIds(blueprint, seed)
  const cast = buildCast(blueprint, seed)
  const placements = planPlacements(blueprint, documents, cast, seed)
  const spanPlans = planSpans(blueprint, documents, seed)
  const prose = streamFor(seed, 'prose')

  const files = new Map() // relative path -> contents
  const truthDocuments = []
  const spanRecords = []
  const { regex, lookup } = mentionRegex(cast)

  for (const doc of documents) {
    const planted = placements.get(doc.id) ?? []
    const spanPlan = spanPlans.get(doc.id) ?? []
    const headingWords = countWords(`<h1>${doc.title}</h1>`)
    const body = buildBody(prose, pools, doc.words - headingWords, planted, spanPlan)
    const html = renderHtml(doc.title, body.paragraphs)

    const words = countWords(html)
    if (words !== doc.words) {
      throw new Error(`document "${doc.name}" came out at ${words} words, not the planned ${doc.words}`)
    }

    for (const span of body.spans) {
      spanRecords.push({ id: span.id, tagId: span.tagId, documentId: doc.id, snippet: snippetOf(span.text) })
    }

    // Counted off the finished text with detection's own convention rather
    // than off the insertion bookkeeping, then checked against it below: what
    // the truth file promises is what a reader of the text would find.
    const text = visibleText(html)
    const byForm = {}
    const byItem = {}
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(text))) {
      const { form, itemId } = lookup.get(match[0].toLowerCase())
      byForm[form] = (byForm[form] ?? 0) + 1
      byItem[itemId] = (byItem[itemId] ?? 0) + 1
    }
    const intended = {}
    for (const form of planted) intended[form] = (intended[form] ?? 0) + 1
    if (JSON.stringify(byForm) !== JSON.stringify(intended)) {
      throw new Error(
        `document "${doc.name}" contains entity names it was not given: ` +
          `${JSON.stringify(byForm)} against ${JSON.stringify(intended)}`
      )
    }

    files.set(`documents/${doc.id}.html`, html)
    truthDocuments.push({
      id: doc.id,
      name: doc.name,
      title: doc.title,
      path: `documents/${doc.id}.html`,
      folderPath: doc.folderPath,
      words,
      characters: visibleText(html).replace(/\s+/g, ' ').trim().length,
      paragraphs: body.paragraphs.length,
      mentionsByItem: byItem,
      mentionsByForm: byForm,
      spanTagIds: body.spans.map((span) => span.id)
    })
  }

  // ---- the binder ---------------------------------------------------------
  //
  // Key order here is binderStore's own: version, tree, lastOpenDocumentId,
  // wordCountBaseline, projectName, viewState, statuses, tags, savedViews,
  // overusedIgnoreList, authorName, projectWordTarget, projectDeadline,
  // projectTargetStartDate, projectTargetStartCount. Node key order is the
  // DocumentNode/FolderNode field order. Both are asserted by the suite, which
  // loads the file and persists it and compares the bytes.
  const toNode = (node) =>
    node.kind === 'folder'
      ? {
          id: node.id,
          type: 'folder',
          name: node.name,
          collapsed: false,
          ...(node.isPart ? { isPart: true } : {}),
          ...(node.isTopLevel ? { isTopLevel: true } : {}),
          children: node.children.map(toNode)
        }
      : {
          id: node.id,
          type: 'document',
          name: node.name,
          collapsed: false,
          synopsis: `${node.title} — ${node.words} words of scaffolding.`,
          notes: '',
          statusId: node.statusId ?? null,
          tagIds: node.tagIds ?? [],
          wordTarget: node.wordTarget ?? null,
          chapterNumber: node.chapterNumber ?? null,
          children: []
        }

  const folder = (id, name, children, extra = {}) => ({
    id,
    type: 'folder',
    name,
    collapsed: false,
    ...extra,
    children
  })

  const tree = [
    folder('structural-draft', 'Draft', blueprint.draft.map(toNode)),
    folder('structural-notes', 'Notes', blueprint.notes.map(toNode)),
    folder('structural-matter', 'Matter', blueprint.matter.map(toNode)),
    ...blueprint.custom.map(toNode),
    folder('structural-archive', 'Archive', blueprint.archive.map(toNode)),
    folder('structural-trash', 'Trash', [])
  ]

  const draftDocuments = truthDocuments.filter((doc) => {
    const inDraft = documents.find((d) => d.id === doc.id)
    return inDraft.folderPath[0] === 'Draft'
  })
  const draftWords = draftDocuments.reduce((sum, doc) => sum + doc.words, 0)
  const totalWords = truthDocuments.reduce((sum, doc) => sum + doc.words, 0)
  const firstDraftDocument = draftDocuments[0]?.id ?? null

  files.set(
    'binder.json',
    `${JSON.stringify(
      {
        version: 1,
        tree,
        lastOpenDocumentId: firstDraftDocument,
        wordCountBaseline: { date: ymd(0), count: draftWords },
        projectName: blueprint.projectName,
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
        overusedIgnoreList: ['tide', 'ledger', 'record'],
        authorName: 'A. Fixture',
        projectWordTarget: blueprint.shape === 'small' ? 2000 : 130000,
        projectDeadline: ymd(180),
        projectTargetStartDate: ymd(0),
        projectTargetStartCount: 0
      },
      null,
      2
    )}`
  )

  // ---- the story bible ----------------------------------------------------
  files.set('storybible/index.json', JSON.stringify({ version: 1, items: cast, types: STORY_BIBLE_TYPES }, null, 2))
  const sheets = streamFor(seed, 'sheets')
  for (const item of cast) {
    const blocks = [
      { id: idFrom(sheets), kind: 'text', label: 'Overview', html: `<p>${item.summary}</p>` },
      {
        id: idFrom(sheets),
        kind: 'stats',
        label: 'At a glance',
        pairs: [
          { id: idFrom(sheets), label: 'First appears', value: `Ch. ${between(sheets, 1, 12)}` },
          { id: idFrom(sheets), label: 'Type', value: STORY_BIBLE_TYPES.find((t) => t.id === item.typeId).name }
        ]
      },
      {
        id: idFrom(sheets),
        kind: 'list',
        label: 'Notes',
        style: 'bullet',
        items: [`Planted in ${truthDocuments.filter((d) => d.mentionsByItem[item.id]).length} documents.`]
      }
    ]
    // saveSheet's own shape: { version, itemId, blocks }.
    files.set(`storybible/sheets/${item.id}.json`, JSON.stringify({ version: 1, itemId: item.id, blocks }, null, 2))
  }

  // ---- the span-tag index -------------------------------------------------
  // spanTagStore rebuilds this per document from the document's own HTML, in
  // document order, which is the order it is written in here.
  files.set('spanTags.json', JSON.stringify({ version: 1, spans: spanRecords }, null, 2))

  const truth = {
    generator: 'scripts/make-fixture-project.mjs',
    truthVersion: 1,
    shape: blueprint.shape,
    seed,
    epoch: ymd(0),
    projectName: blueprint.projectName,
    totals: {
      documents: truthDocuments.length,
      words: totalWords,
      draftDocuments: draftDocuments.length,
      draftWords,
      spanTags: spanRecords.length,
      entities: cast.length
    },
    structuralFolderIds: STRUCTURAL.map((f) => f.id),
    statuses: STATUSES,
    tags: TAGS,
    storyBibleTypes: STORY_BIBLE_TYPES,
    entities: cast.map((item) => ({
      id: item.id,
      name: item.name,
      typeId: item.typeId,
      aliases: item.aliases,
      total: truthDocuments.reduce((sum, doc) => sum + (doc.mentionsByItem[item.id] ?? 0), 0),
      documents: truthDocuments
        .filter((doc) => doc.mentionsByItem[item.id])
        .map((doc) => ({ id: doc.id, count: doc.mentionsByItem[item.id] }))
    })),
    spanTags: spanRecords,
    documents: truthDocuments
  }

  return { files, truth }
}

// ------------------------------------------------------------------- writing

export async function writeFixture({ shape, target, seed = DEFAULT_SEED, truthPath = null, force = false }) {
  if (!SHAPES.includes(shape)) throw new Error(`unknown shape "${shape}" (known: ${SHAPES.join(', ')})`)
  if (existsSync(join(target, 'binder.json')) && !force) {
    throw new Error(`refusing to overwrite an existing project at ${target} (pass --force if you mean it)`)
  }
  const { files, truth } = generate(shape, seed)

  const written = [...files.keys()].sort()
  const directories = new Set(written.map((path) => path.split('/').slice(0, -1).join('/')).filter(Boolean))
  await mkdir(target, { recursive: true })
  for (const directory of [...directories].sort()) {
    await mkdir(join(target, directory), { recursive: true })
  }
  for (const path of written) {
    await writeFile(join(target, path), files.get(path), 'utf-8')
  }

  const truthFile = truthPath ?? `${resolve(target)}.truth.json`
  // Beside the project rather than inside it: a file the app has never heard
  // of, sitting in a project root, is exactly the kind of thing a later
  // "unknown files" rule would have to make an exception for.
  await writeFile(truthFile, `${JSON.stringify(truth, null, 2)}\n`, 'utf-8')

  return { truth, truthFile, files: written }
}

// ---------------------------------------------------------------------- cli

function parseArgs(argv) {
  const options = { shape: null, target: null, seed: DEFAULT_SEED, truthPath: null, force: false, quiet: false }
  const positional = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--force') options.force = true
    else if (arg === '--quiet') options.quiet = true
    else if (arg === '--seed') options.seed = Number(argv[++i])
    else if (arg === '--truth') options.truthPath = argv[++i]
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else positional.push(arg)
  }
  options.shape = positional[0]
  options.target = positional[1]
  if (!Number.isInteger(options.seed)) throw new Error('--seed must be an integer')
  return options
}

/** No top-level await in here, and the whole CLI behind this guard: the test
 *  suite imports `writeFixture` from this file through esbuild's CJS bundle,
 *  which cannot represent a top-level await and would run the CLI if it could
 *  reach it. */
async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (!options.shape || !options.target) {
      console.error('usage: node scripts/make-fixture-project.mjs <small|realistic> "<target folder>" [--seed n] [--truth path] [--force] [--quiet]')
      process.exit(2)
    }
    const { truth, truthFile, files } = await writeFixture(options)
    if (!options.quiet) {
      console.log(`${truth.shape} fixture written to ${options.target} (seed ${truth.seed})`)
      console.log(`  ${files.length} files: ${truth.totals.documents} documents, ${truth.totals.words.toLocaleString()} words`)
      console.log(`  ${truth.totals.draftWords.toLocaleString()} of those words in Draft, across ${truth.totals.draftDocuments} documents`)
      console.log(`  ${truth.totals.entities} Story Bible items, ${truth.totals.spanTags} tagged spans`)
      console.log(`  ground truth: ${truthFile}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

if (process.argv[1] && process.argv[1].endsWith('make-fixture-project.mjs')) main()
