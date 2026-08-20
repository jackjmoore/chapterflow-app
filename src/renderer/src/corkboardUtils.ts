import type { BinderNode, DocumentNode } from '../../shared/binder'

export interface CorkboardCard {
  node: DocumentNode
  /** Index within the parent's real children array (folders included) —
   *  needed for moveNode, which operates on that full array, not the
   *  documents-only list a group displays. */
  realIndex: number
}

export interface CorkboardGroup {
  parentId: string | null
  parentName: string | null
  cards: CorkboardCard[]
}

/** One group per parent (root, or any folder/document with document children),
 *  listing its direct document children as cards — documents can themselves
 *  contain child documents, so a document with children forms its own group too. */
export function groupDocumentsForCorkboard(tree: BinderNode[]): CorkboardGroup[] {
  const groups: CorkboardGroup[] = []

  function walk(nodes: BinderNode[], parentId: string | null, parentName: string | null): void {
    const cards: CorkboardCard[] = []
    nodes.forEach((node, realIndex) => {
      if (node.type === 'document') cards.push({ node, realIndex })
    })
    if (cards.length > 0) groups.push({ parentId, parentName, cards })
    for (const node of nodes) walk(node.children, node.id, node.name)
  }

  walk(tree, null, null)
  return groups
}
