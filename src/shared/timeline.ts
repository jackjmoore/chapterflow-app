/**
 * Continuity board — story-internal chronology.
 *
 * A timeline entry owns nothing but its own description, its free-text date,
 * and *references*. Every link is a real id resolved live against the Story
 * Bible index and the binder tree, never a copied name: renaming "Sarah"
 * changes what every entry linking her displays, because nothing here stores
 * "Sarah" in the first place.
 */
export interface TimelineEntry {
  id: string
  /** What happens. The one piece of text an entry genuinely owns. */
  description: string
  /**
   * In-story date/time, entirely free text ("three days after the fire",
   * "midsummer, year 3", ""). Deliberately never parsed — a story's calendar
   * isn't a real one, and a heuristic that guessed wrong would silently
   * reshuffle the board. Ordering is manual; see TimelineState.entries.
   */
  whenText: string
  /**
   * Real StoryBibleItem ids. Not names, not copies — the Story Bible sheet
   * stays the single source of truth for every one of these. An id that no
   * longer resolves is kept, not scrubbed: the board shows it as a broken
   * link you can remove, and a backup restore brings it back to life.
   */
  itemIds: string[]
  /** A real binder document id — where this event happens or is referenced.
   *  Null when the entry isn't pinned to a scene yet. Kept (not nulled) if
   *  that document is deleted, for the same reason as itemIds. */
  documentId: string | null
  createdAt: string
  updatedAt: string
}

/** Array order *is* timeline order — the same convention binder.json uses for
 *  sibling order being manuscript order. New entries append; dragging moves
 *  them. There is no separate sort key to drift out of sync. */
export interface TimelineState {
  entries: TimelineEntry[]
}

export type TimelineDraft = Omit<TimelineEntry, 'id' | 'createdAt' | 'updatedAt'>

/** One entry's unresolvable references, computed fresh at render time against
 *  the live Story Bible index and binder tree. */
export interface BrokenLinks {
  itemIds: string[]
  documentId: string | null
}

export function findBrokenLinks(
  entry: TimelineEntry,
  validItemIds: Set<string>,
  validDocumentIds: Set<string>
): BrokenLinks {
  return {
    itemIds: entry.itemIds.filter((id) => !validItemIds.has(id)),
    documentId: entry.documentId && !validDocumentIds.has(entry.documentId) ? entry.documentId : null
  }
}

export function countBrokenLinks(broken: BrokenLinks): number {
  return broken.itemIds.length + (broken.documentId ? 1 : 0)
}
