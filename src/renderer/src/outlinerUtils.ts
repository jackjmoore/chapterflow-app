import type { BinderNode, OutlinerSort, StatusDef } from '../../shared/binder'

export interface OutlinerRow {
  node: BinderNode
  depth: number
}

function nodeMatchesText(node: BinderNode, query: string): boolean {
  if (node.name.toLowerCase().includes(query)) return true
  if (node.type === 'document' && node.synopsis.toLowerCase().includes(query)) return true
  if (node.type === 'document' && node.notes.toLowerCase().includes(query)) return true
  return false
}

/** Whether a node matches on its own terms (not counting descendants). The
 *  status/tag filter only ever applies to documents — a folder can only ever
 *  match via its own name text, never via status/tag (it has neither). */
function selfMatches(node: BinderNode, query: string, statusFilter: string[], tagFilter: string[]): boolean {
  if (node.type === 'document') {
    const textOk = !query || nodeMatchesText(node, query)
    const statusOk = statusFilter.length === 0 || (!!node.statusId && statusFilter.includes(node.statusId))
    const tagOk = tagFilter.every((t) => node.tagIds.includes(t))
    return textOk && statusOk && tagOk
  }
  return !!query && node.name.toLowerCase().includes(query)
}

function subtreeMatches(
  node: BinderNode,
  query: string,
  statusFilter: string[],
  tagFilter: string[]
): boolean {
  if (selfMatches(node, query, statusFilter, tagFilter)) return true
  return node.children.some((c) => subtreeMatches(c, query, statusFilter, tagFilter))
}

/** Applies the text filter and the shared status/tag filter together, keeping
 *  a node if it matches or has a matching descendant — so a match buried a
 *  few levels deep still shows its ancestors for context, rather than losing
 *  the hierarchy the outliner/corkboard are supposed to respect. */
export function filterOutlinerTree(
  tree: BinderNode[],
  options: { text?: string; statusFilter?: string[]; tagFilter?: string[] }
): BinderNode[] {
  const query = (options.text ?? '').trim().toLowerCase()
  const statusFilter = options.statusFilter ?? []
  const tagFilter = options.tagFilter ?? []
  if (!query && statusFilter.length === 0 && tagFilter.length === 0) return tree

  const result: BinderNode[] = []
  for (const node of tree) {
    if (!subtreeMatches(node, query, statusFilter, tagFilter)) continue
    result.push({
      ...node,
      children: filterOutlinerTree(node.children, options)
    } as BinderNode)
  }
  return result
}

/** Back-compat alias used where only the text filter applies. */
export function filterTree(tree: BinderNode[], query: string): BinderNode[] {
  return filterOutlinerTree(tree, { text: query })
}

function sortValue(
  node: BinderNode,
  column: OutlinerSort['column'],
  wordCounts: Record<string, number>,
  statusesById: Map<string, StatusDef>
): string | number {
  if (column === 'title') return node.name.toLowerCase()
  if (node.type !== 'document') return column === 'wordCount' ? 0 : ''
  if (column === 'synopsis') return node.synopsis.toLowerCase()
  if (column === 'notes') return node.notes.toLowerCase()
  if (column === 'status') return node.statusId ? (statusesById.get(node.statusId)?.name.toLowerCase() ?? '') : ''
  return wordCounts[node.id] ?? 0
}

/** Sorts siblings at every level by the chosen column — hierarchy itself is
 *  never flattened, only the order WITHIN each level changes. Returns a new
 *  tree; never mutates or persists — this is display-only, the real binder
 *  order (used everywhere else) is untouched. */
export function sortTree(
  tree: BinderNode[],
  sort: OutlinerSort | null,
  wordCounts: Record<string, number>,
  statuses: StatusDef[] = []
): BinderNode[] {
  if (!sort) return tree
  const statusesById = new Map(statuses.map((s) => [s.id, s]))
  const dir = sort.direction === 'asc' ? 1 : -1
  const sorted = [...tree].sort((a, b) => {
    const av = sortValue(a, sort.column, wordCounts, statusesById)
    const bv = sortValue(b, sort.column, wordCounts, statusesById)
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  return sorted.map(
    (node) => ({ ...node, children: sortTree(node.children, sort, wordCounts, statuses) }) as BinderNode
  )
}

export function flattenForOutliner(tree: BinderNode[], depth = 0): OutlinerRow[] {
  const rows: OutlinerRow[] = []
  for (const node of tree) {
    rows.push({ node, depth })
    rows.push(...flattenForOutliner(node.children, depth + 1))
  }
  return rows
}
