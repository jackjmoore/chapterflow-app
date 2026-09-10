import { useMemo } from 'react'
import type { BinderNode } from '../../shared/binder'
import type { CompileScope } from '../../shared/compile'
import { DocumentIcon, FolderIcon } from './icons'

interface CompileScopeTreeProps {
  tree: BinderNode[]
  scope: CompileScope
  onChange: (scope: CompileScope) => void
}

/** Node id → its ancestor chain, plus every id in the tree, in one walk. */
function indexTree(tree: BinderNode[]): { allIds: string[]; ancestorsOf: Map<string, string[]> } {
  const allIds: string[] = []
  const ancestorsOf = new Map<string, string[]>()
  const walk = (nodes: BinderNode[], ancestors: string[]): void => {
    for (const node of nodes) {
      allIds.push(node.id)
      ancestorsOf.set(node.id, ancestors)
      walk(node.children, [...ancestors, node.id])
    }
  }
  walk(tree, [])
  return { allIds, ancestorsOf }
}

function subtreeIds(node: BinderNode): string[] {
  const ids: string[] = []
  const walk = (n: BinderNode): void => {
    ids.push(n.id)
    n.children.forEach(walk)
  }
  walk(node)
  return ids
}

/**
 * The compile scope as a checkbox tree over the binder's own structure — a
 * deliberately lightweight mirror of the binder (no drag, no rename, no
 * badges): its one job is deciding inclusion.
 *
 * The invariant maintained here is what makes filterTreeByScope's stored form
 * trustworthy: checking a node checks its whole subtree AND its ancestors
 * (content can't appear without the headings above it), unchecking removes
 * just the subtree. So through this UI, a checked id always has checked
 * ancestors — the subtree-exclusion rule in filterTreeByScope only ever
 * decides anything for stale scopes loaded from an old preset.
 *
 * A fully-checked tree normalizes back to `{ mode: 'all' }`, so "everything"
 * stays a single stable value rather than a list that goes stale as documents
 * are added.
 */
function CompileScopeTree(props: CompileScopeTreeProps): JSX.Element {
  const { tree, scope, onChange } = props

  const { allIds, ancestorsOf } = useMemo(() => indexTree(tree), [tree])

  const checked: ReadonlySet<string> = useMemo(
    () => (scope.mode === 'all' ? new Set(allIds) : new Set(scope.nodeIds)),
    [scope, allIds]
  )

  function emit(next: Set<string>): void {
    // Drop ids that no longer exist so a long session can't accumulate ghosts.
    const live = allIds.filter((id) => next.has(id))
    onChange(live.length === allIds.length ? { mode: 'all' } : { mode: 'selection', nodeIds: live })
  }

  function toggle(node: BinderNode): void {
    const next = new Set(checked)
    if (checked.has(node.id)) {
      for (const id of subtreeIds(node)) next.delete(id)
    } else {
      for (const id of subtreeIds(node)) next.add(id)
      for (const id of ancestorsOf.get(node.id) ?? []) next.add(id)
    }
    emit(next)
  }

  function renderNode(node: BinderNode, depth: number): JSX.Element {
    const descendants = subtreeIds(node).slice(1)
    const isChecked = checked.has(node.id)
    const checkedDescendants = descendants.filter((id) => checked.has(id)).length
    const indeterminate =
      isChecked && checkedDescendants > 0 && checkedDescendants < descendants.length
    // An excluded ancestor means this row is out no matter what it says —
    // dim it so the subtree reads as switched off as a unit.
    const ancestorExcluded = (ancestorsOf.get(node.id) ?? []).some((id) => !checked.has(id))

    return (
      <div key={node.id}>
        <label
          className={`compile-scope-row ${ancestorExcluded ? 'is-parent-excluded' : ''}`}
          style={{ paddingLeft: depth * 18 }}
        >
          <input
            type="checkbox"
            checked={isChecked}
            ref={(el) => {
              if (el) el.indeterminate = indeterminate
            }}
            onChange={() => toggle(node)}
          />
          {node.type === 'folder' ? <FolderIcon /> : <DocumentIcon />}
          <span className="compile-scope-name">{node.name || 'Untitled'}</span>
        </label>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  if (tree.length === 0) {
    return <p className="compile-scope-empty">No documents in the binder yet.</p>
  }

  return <div className="compile-scope-tree">{tree.map((node) => renderNode(node, 0))}</div>
}

export default CompileScopeTree
