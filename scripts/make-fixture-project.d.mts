/** Types for scripts/make-fixture-project.mjs, so `tests/generator.test.ts`
 *  can import the generator under the same typecheck as everything else. The
 *  generator itself stays plain JavaScript: it has to run from a checkout with
 *  nothing built. */

export interface ColorDef {
  id: string
  name: string
  color: string
}

export interface FixtureEntity {
  id: string
  name: string
  typeId: string
  aliases: string[]
  /** Planted occurrences of this item's name and aliases across the project. */
  total: number
  documents: Array<{ id: string; count: number }>
}

export interface FixtureSpanTag {
  id: string
  tagId: string
  documentId: string
  snippet: string
}

export interface FixtureDocument {
  id: string
  name: string
  title: string
  /** Relative to the project root. */
  path: string
  folderPath: string[]
  words: number
  characters: number
  paragraphs: number
  /** Story Bible item id -> planted occurrences in this document. */
  mentionsByItem: Record<string, number>
  /** Surface form -> planted occurrences in this document. */
  mentionsByForm: Record<string, number>
  spanTagIds: string[]
}

export interface FixtureTruth {
  generator: string
  truthVersion: number
  shape: string
  seed: number
  epoch: string
  projectName: string
  totals: {
    documents: number
    words: number
    draftDocuments: number
    draftWords: number
    spanTags: number
    entities: number
  }
  structuralFolderIds: string[]
  statuses: ColorDef[]
  tags: ColorDef[]
  storyBibleTypes: ColorDef[]
  entities: FixtureEntity[]
  spanTags: FixtureSpanTag[]
  documents: FixtureDocument[]
}

export interface WriteFixtureOptions {
  shape: string
  target: string
  seed?: number
  truthPath?: string | null
  force?: boolean
}

export declare const SHAPES: string[]
export declare const DEFAULT_SEED: number
export declare const TAGS: ColorDef[]
export declare const STATUSES: ColorDef[]
export declare const STORY_BIBLE_TYPES: ColorDef[]
export declare const STRUCTURAL: Array<{ id: string; name: string }>

export declare function writeFixture(
  options: WriteFixtureOptions
): Promise<{ truth: FixtureTruth; truthFile: string; files: string[] }>
