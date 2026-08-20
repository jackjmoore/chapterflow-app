/** A user-defined item category (Character/Location/Object by default, but
 *  extensible) — same shape as StatusDef/TagDef in binder.ts, so it reuses
 *  the same generic color-list editor. */
export interface StoryBibleTypeDef {
  id: string
  name: string
  color: string
}

/** Lightweight index-entry for one item — enough to render the browse grid
 *  without loading its sheet. The sheet's block content lives separately. */
export interface StoryBibleItem {
  id: string
  typeId: string
  name: string
  /** Nicknames, titles, or names this item was previously known by — renaming
   *  the item auto-adds its old name here so detection in already-written
   *  chapters doesn't break. Freely editable afterward. */
  aliases: string[]
  summary: string
  createdAt: string
  updatedAt: string
}

export interface StoryBibleState {
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
}

export interface StoryBibleTextBlock {
  id: string
  kind: 'text'
  label: string
  html: string
}

export interface StoryBibleImageBlock {
  id: string
  kind: 'image'
  label: string
  /** References a file under storybible/images/ (its filename, including
   *  extension) — null until an image has actually been attached. */
  imageId: string | null
  caption: string
}

export interface StoryBibleListBlock {
  id: string
  kind: 'list'
  label: string
  style: 'bullet' | 'numbered'
  items: string[]
}

export interface StoryBibleStatPair {
  id: string
  label: string
  value: string
}

export interface StoryBibleStatsBlock {
  id: string
  kind: 'stats'
  label: string
  pairs: StoryBibleStatPair[]
}

export type StoryBibleBlock = StoryBibleTextBlock | StoryBibleImageBlock | StoryBibleListBlock | StoryBibleStatsBlock
export type StoryBibleBlockKind = StoryBibleBlock['kind']

export interface StoryBibleSheet {
  itemId: string
  blocks: StoryBibleBlock[]
}

/** One document's contribution to an item's mention statistics — raw and
 *  unordered; the renderer combines this with the binder tree (manuscript
 *  reading order) to build chapter breakdowns and first/last appearance. */
export interface ItemMentionStat {
  documentId: string
  count: number
  firstOffset: number | null
  lastOffset: number | null
}
