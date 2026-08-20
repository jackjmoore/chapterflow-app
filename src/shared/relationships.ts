/**
 * Relationships between Story Bible items.
 *
 * Like timeline entries, a relationship owns nothing but its own labels and a
 * pair of *references*. Names are never copied — they're resolved live from
 * the Story Bible index at render time, so renaming an item updates every
 * relationship display with no write to this store at all.
 */
export interface Relationship {
  id: string
  /** Real StoryBibleItem ids. Kept (never scrubbed) if an item is deleted, so
   *  restoring a backup revives the link — see the continuity board's
   *  broken-link cleanup for the opt-in removal path. */
  fromId: string
  toId: string
  /**
   * How the relationship reads from `fromId` towards `toId`: "siblings",
   * "mentor of", "rivals".
   */
  label: string
  /**
   * How it reads in the other direction.
   *
   * `null` means mutual — "siblings" reads identically from either side, so
   * both sheets show `label`. A value makes the pair directional: `label` is
   * "mentor of" on one sheet and `reverseLabel` is "student of" on the other.
   * One relationship record covers both cases; there is never a second,
   * mirrored record to keep in sync.
   */
  reverseLabel: string | null
  createdAt: string
  updatedAt: string
}

export type RelationshipDraft = Omit<Relationship, 'id' | 'createdAt' | 'updatedAt'>

export interface RelationshipState {
  relationships: Relationship[]
}

export function isMutual(relationship: Relationship): boolean {
  return relationship.reverseLabel === null
}

/** One relationship as seen from a particular item's sheet. */
export interface RelationshipSide {
  relationship: Relationship
  /** The item at the other end. */
  otherId: string
  /** The wording to show on `selfId`'s sheet. */
  label: string
  /** False for a mutual relationship; otherwise whether `selfId` is the
   *  `from` side (the mentor rather than the student). */
  outgoing: boolean
  mutual: boolean
}

/**
 * Reads a relationship from one end. Returns null when `selfId` isn't part of
 * it, so a sheet can simply map over every relationship and filter.
 *
 * A self-link (both ends the same item) is treated as outgoing once rather
 * than being listed twice.
 */
export function sideFor(relationship: Relationship, selfId: string): RelationshipSide | null {
  const mutual = isMutual(relationship)
  if (relationship.fromId === selfId) {
    return { relationship, otherId: relationship.toId, label: relationship.label, outgoing: true, mutual }
  }
  if (relationship.toId === selfId) {
    return {
      relationship,
      otherId: relationship.fromId,
      label: relationship.reverseLabel ?? relationship.label,
      outgoing: false,
      mutual
    }
  }
  return null
}

/** Every relationship touching `itemId`, read from that item's side. */
export function sidesFor(relationships: Relationship[], itemId: string): RelationshipSide[] {
  const out: RelationshipSide[] = []
  for (const relationship of relationships) {
    const side = sideFor(relationship, itemId)
    if (side) out.push(side)
  }
  return out
}

/** Which ends no longer resolve against the live Story Bible index. */
export function brokenEndpoints(
  relationship: Relationship,
  validItemIds: Set<string>
): { from: boolean; to: boolean } {
  return {
    from: !validItemIds.has(relationship.fromId),
    to: !validItemIds.has(relationship.toId)
  }
}

export function isBroken(relationship: Relationship, validItemIds: Set<string>): boolean {
  const broken = brokenEndpoints(relationship, validItemIds)
  return broken.from || broken.to
}

export function countBrokenRelationships(relationships: Relationship[], validItemIds: Set<string>): number {
  return relationships.filter((r) => isBroken(r, validItemIds)).length
}
