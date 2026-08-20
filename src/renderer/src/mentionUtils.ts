import type { BinderNode } from '../../shared/binder'
import type { ItemMentionStat, StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import { flattenForOutliner } from './outlinerUtils'

/** Resolves mention-rollup item ids into the generic {id,name,color} shape
 *  SpanTagRollupChips renders — color comes through the item's *type*
 *  (StoryBibleItem itself has no color of its own, unlike TagDef/StatusDef),
 *  so this is a join through `types`, not a flat lookup. */
export function resolveMentionChips(
  items: StoryBibleItem[],
  types: StoryBibleTypeDef[],
  itemIds: string[]
): { id: string; name: string; color: string }[] {
  const typesById = new Map(types.map((t) => [t.id, t]))
  return itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((item): item is StoryBibleItem => !!item)
    .map((item) => ({
      id: item.id,
      name: item.name,
      color: typesById.get(item.typeId)?.color ?? 'var(--chrome-text-dim)'
    }))
}

export interface OrderedMentionStat {
  documentId: string
  documentName: string
  /** Position among documents in manuscript (binder tree) order — 0-based. */
  manuscriptIndex: number
  count: number
  firstOffset: number | null
  lastOffset: number | null
}

export interface MentionStatsSummary {
  totalCount: number
  /** Every document with at least one mention, in manuscript order. */
  byChapter: OrderedMentionStat[]
  firstAppearance: OrderedMentionStat | null
  lastAppearance: OrderedMentionStat | null
}

/** Combines the main process's raw, unordered per-document counts with the
 *  binder tree's manuscript order (the same `flattenForOutliner` the
 *  Outliner already uses, called on the un-sorted tree — sibling order in
 *  the binder *is* manuscript order) to produce a ranked breakdown. */
export function orderMentionStats(tree: BinderNode[], stats: ItemMentionStat[]): MentionStatsSummary {
  const rows = flattenForOutliner(tree).filter((r) => r.node.type === 'document')
  const orderById = new Map(rows.map((r, index) => [r.node.id, { index, name: r.node.name }]))
  const statsByDoc = new Map(stats.map((s) => [s.documentId, s]))

  const byChapter: OrderedMentionStat[] = []
  for (const [documentId, order] of orderById) {
    const stat = statsByDoc.get(documentId)
    if (!stat) continue
    byChapter.push({
      documentId,
      documentName: order.name || 'Untitled',
      manuscriptIndex: order.index,
      count: stat.count,
      firstOffset: stat.firstOffset,
      lastOffset: stat.lastOffset
    })
  }
  byChapter.sort((a, b) => a.manuscriptIndex - b.manuscriptIndex)

  const totalCount = byChapter.reduce((sum, c) => sum + c.count, 0)
  return {
    totalCount,
    byChapter,
    firstAppearance: byChapter[0] ?? null,
    lastAppearance: byChapter[byChapter.length - 1] ?? null
  }
}
