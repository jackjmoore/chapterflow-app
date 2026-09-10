import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { BinderNode } from '../../shared/binder'
import type { ItemMentionStat, StoryBibleBlock, StoryBibleItem, StoryBibleTypeDef } from '../../shared/storyBible'
import type { Relationship } from '../../shared/relationships'
import { manuscriptDocuments, orderMentionStats, type MentionStatsSummary } from './mentionUtils'
import StoryBibleBrowseGrid from './StoryBibleBrowseGrid'
import StoryBibleSheetDetail from './StoryBibleSheetDetail'
import ManageColorListModal from './ManageColorListModal'

export interface StoryBibleViewHandle {
  flushPendingSave: () => Promise<void>
  /** Opens a specific item's sheet directly — used by the manuscript's
   *  mention hover card ("click to open the full sheet") and by the side
   *  panel's item list. */
  openItem: (id: string) => void
  /** Creates an item of the given type and opens it, exactly as the browse
   *  grid's New… picker does — so the panel's version isn't a second,
   *  subtly-different creation path. */
  createItem: (typeId: string) => void
}

interface StoryBibleViewProps {
  tree: BinderNode[]
  items: StoryBibleItem[]
  types: StoryBibleTypeDef[]
  onRefreshIndex: () => Promise<void>
  relationships: Relationship[]
  onAddRelationship: (fromId: string) => void
  onEditRelationship: (relationship: Relationship) => void
  onDeleteRelationship: (relationship: Relationship) => void
}

// Same debounce/max-wait shape as document autosave (see App.tsx) — a short
// pause-in-editing debounce, plus a hard ceiling so continuous editing still
// gets saved periodically.
const AUTOSAVE_DELAY_MS = 500
const MAX_UNSAVED_MS = 3000

const StoryBibleView = forwardRef<StoryBibleViewHandle, StoryBibleViewProps>(function StoryBibleView(props, ref) {
  const {
    tree,
    items,
    types,
    onRefreshIndex: refreshIndex,
    relationships,
    onAddRelationship,
    onEditRelationship,
    onDeleteRelationship
  } = props
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<StoryBibleBlock[]>([])
  const [manageTypesOpen, setManageTypesOpen] = useState(false)
  /** Raw per-item statistics for the whole Story Bible, read in one call.
   *  The wall wears a count and a presence strip on every card, so asking
   *  per item would be one round trip per entry over the same file. */
  const [rawStats, setRawStats] = useState<Record<string, ItemMentionStat[]>>({})

  const selectedItemIdRef = useRef<string | null>(null)
  const lastSavedBlocksJson = useRef('')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout>>()

  async function performSave(itemId: string, toSave: StoryBibleBlock[]): Promise<void> {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    if (maxWaitTimer.current) {
      clearTimeout(maxWaitTimer.current)
      maxWaitTimer.current = undefined
    }
    const json = JSON.stringify(toSave)
    if (json === lastSavedBlocksJson.current) return
    await window.api.saveStoryBibleSheet(itemId, toSave)
    lastSavedBlocksJson.current = json
  }

  function scheduleSave(itemId: string, toSave: StoryBibleBlock[]): void {
    const json = JSON.stringify(toSave)
    if (json === lastSavedBlocksJson.current) return

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void performSave(itemId, toSave)
    }, AUTOSAVE_DELAY_MS)

    if (!maxWaitTimer.current) {
      maxWaitTimer.current = setTimeout(() => {
        maxWaitTimer.current = undefined
        void performSave(itemId, toSave)
      }, MAX_UNSAVED_MS)
    }
  }

  async function flushPendingSave(): Promise<void> {
    const itemId = selectedItemIdRef.current
    if (!itemId) return
    await performSave(itemId, blocks)
  }

  useImperativeHandle(ref, () => ({
    flushPendingSave,
    openItem: (id: string) => void openItem(id),
    createItem: (typeId: string) => void handleCreateItem(typeId)
  }))

  async function openItem(id: string): Promise<void> {
    await flushPendingSave()
    const sheet = await window.api.getStoryBibleSheet(id)
    selectedItemIdRef.current = id
    lastSavedBlocksJson.current = JSON.stringify(sheet.blocks)
    setBlocks(sheet.blocks)
    setSelectedItemId(id)
  }

  async function closeItem(): Promise<void> {
    await flushPendingSave()
    selectedItemIdRef.current = null
    setSelectedItemId(null)
    setBlocks([])
  }

  function handleBlocksChange(next: StoryBibleBlock[]): void {
    setBlocks(next)
    if (selectedItemIdRef.current) scheduleSave(selectedItemIdRef.current, next)
  }

  async function handleCreateItem(typeId: string): Promise<void> {
    const item = await window.api.createStoryBibleItem(typeId, 'Untitled')
    await refreshIndex()
    await openItem(item.id)
  }

  async function handleRename(name: string): Promise<void> {
    const id = selectedItemIdRef.current
    if (!id) return
    await window.api.renameStoryBibleItem(id, name)
    await refreshIndex()
  }

  async function handleChangeAliases(aliases: string[]): Promise<void> {
    const id = selectedItemIdRef.current
    if (!id) return
    await window.api.setStoryBibleItemAliases(id, aliases)
    await refreshIndex()
  }

  async function handleChangeType(typeId: string): Promise<void> {
    const id = selectedItemIdRef.current
    if (!id) return
    await window.api.setStoryBibleItemType(id, typeId)
    await refreshIndex()
  }

  async function handleChangeSummary(summary: string): Promise<void> {
    const id = selectedItemIdRef.current
    if (!id) return
    await window.api.setStoryBibleItemSummary(id, summary)
    await refreshIndex()
  }

  async function handleDeleteItem(): Promise<void> {
    const id = selectedItemIdRef.current
    if (!id) return
    const result = await window.api.deleteStoryBibleItem(id)
    if (!result.deleted) return
    selectedItemIdRef.current = null
    setSelectedItemId(null)
    setBlocks([])
    await refreshIndex()
  }

  async function handleSaveTypes(nextTypes: StoryBibleTypeDef[]): Promise<void> {
    await window.api.setStoryBibleTypes(nextTypes)
    setManageTypesOpen(false)
    await refreshIndex()
  }

  // Mentions are rebuilt whenever a document saves, so the counts refresh on
  // that signal as well as when the item list changes.
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      void window.api.getAllMentionStats().then((next) => {
        if (!cancelled) setRawStats(next)
      })
    }
    load()
    const stop = window.api.onMentionsUpdated(load)
    return () => {
      cancelled = true
      stop()
    }
  }, [items])

  const documents = useMemo(() => manuscriptDocuments(tree), [tree])

  /** Raw counts joined to manuscript order once, then shared by the wall and
   *  the open sheet, so a card and a sheet can never disagree about a count. */
  const statsByItem = useMemo(() => {
    const out: Record<string, MentionStatsSummary> = {}
    for (const [itemId, raw] of Object.entries(rawStats)) out[itemId] = orderMentionStats(tree, raw)
    return out
  }, [rawStats, tree])

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null

  return (
    <div className="story-bible">
      {selectedItem ? (
        <StoryBibleSheetDetail
          item={selectedItem}
          types={types}
          blocks={blocks}
          documents={documents}
          stats={statsByItem[selectedItem.id] ?? null}
          onBack={() => void closeItem()}
          onRename={(name) => void handleRename(name)}
          onChangeType={(typeId) => void handleChangeType(typeId)}
          onChangeSummary={(summary) => void handleChangeSummary(summary)}
          onChangeAliases={(aliases) => void handleChangeAliases(aliases)}
          onDelete={() => void handleDeleteItem()}
          onBlocksChange={handleBlocksChange}
          items={items}
          relationships={relationships}
          onOpenItem={(id) => void openItem(id)}
          onAddRelationship={() => onAddRelationship(selectedItem.id)}
          onEditRelationship={onEditRelationship}
          onDeleteRelationship={onDeleteRelationship}
        />
      ) : (
        <StoryBibleBrowseGrid
          items={items}
          types={types}
          documents={documents}
          statsByItem={statsByItem}
          onOpenItem={(id) => void openItem(id)}
          onCreateItem={(typeId) => void handleCreateItem(typeId)}
          onManageTypes={() => setManageTypesOpen(true)}
        />
      )}

      {manageTypesOpen && (
        <ManageColorListModal
          title="Manage types"
          message="Types group the Story Bible and colour its cards. Renaming one updates every entry that uses it. You can add your own alongside Character, Location, and Object, or instead of them."
          items={types}
          addLabel="Type"
          defaultColor="#6f95b8"
          onSave={handleSaveTypes}
          onClose={() => setManageTypesOpen(false)}
        />
      )}
    </div>
  )
})

export default StoryBibleView
