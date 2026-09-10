import { useEffect, useRef, useState } from 'react'
import type { MenuDef, MenuEntry } from './menuConfig'
import { useFlyoutFit } from './useFlyoutFit'

interface MenuBarProps {
  menus: MenuDef[]
  onAction: (action: string) => void
  checkedActions?: Set<string>
  /** Actions that cannot be taken right now, each with the one sentence that
   *  says why — shown as the item's tooltip, since a greyed item on its own
   *  only tells you that something is off. */
  disabledActions?: Map<string, string>
}

function EntryList({
  entries,
  onAction,
  checkedActions,
  disabledActions
}: {
  entries: MenuEntry[]
  onAction: (action: string) => void
  checkedActions: Set<string>
  disabledActions: Map<string, string>
}): JSX.Element {
  // A checkable item reserves a gutter for its tick, a plain one does not, so a
  // menu holding both used to sit its labels on two different left edges —
  // View alternated between them six times down a ten-item list. Flagging the
  // list lets the stylesheet indent the plain items to match, so each menu has
  // one left edge; a menu with nothing checkable keeps its flush one.
  const reserveCheck = entries.some((entry) => entry.type === 'item' && entry.checkable)

  return (
    <div className={`menubar-dropdown ${reserveCheck ? 'menubar-dropdown--checkable' : ''}`}>
      {entries.map((entry, i) => {
        if (entry.type === 'separator') return <div key={i} className="menubar-separator" />
        if (entry.type === 'submenu') {
          return (
            <div key={i} className="menubar-item menubar-item--parent">
              <span className="menubar-item-label">{entry.label}</span>
              <span className="menubar-item-chevron">›</span>
              <div className="menubar-flyout">
                <EntryList
                  entries={entry.items}
                  onAction={onAction}
                  checkedActions={checkedActions}
                  disabledActions={disabledActions}
                />
              </div>
            </div>
          )
        }
        const checked = entry.checkable && checkedActions.has(entry.action)
        const disabledReason = disabledActions.get(entry.action)
        return (
          <button
            key={i}
            type="button"
            className={`menubar-item ${entry.checkable ? 'menubar-item--checkable' : ''}`}
            disabled={disabledReason !== undefined}
            title={disabledReason}
            onClick={() => onAction(entry.action)}
          >
            {entry.checkable && <span className="menubar-item-check">{checked ? '✓' : ''}</span>}
            <span className="menubar-item-label">{entry.label}</span>
            {entry.shortcut && <span className="menubar-item-shortcut">{entry.shortcut.display}</span>}
          </button>
        )
      })}
    </div>
  )
}

function MenuBar(props: MenuBarProps): JSX.Element {
  const { menus, onAction, checkedActions = new Set<string>(), disabledActions = new Map<string, string>() } = props
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  useFlyoutFit(containerRef)

  useEffect(() => {
    if (openIndex === null) return
    function handlePointerDown(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIndex(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpenIndex(null)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openIndex])

  function handleAction(action: string): void {
    setOpenIndex(null)
    onAction(action)
  }

  return (
    <div className="menubar" ref={containerRef}>
      {menus.map((menu, i) => (
        <div key={menu.label} className="menubar-top">
          <button
            type="button"
            className={`menubar-top-button ${openIndex === i ? 'is-active' : ''}`}
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            onMouseEnter={() => {
              if (openIndex !== null) setOpenIndex(i)
            }}
          >
            {menu.label}
          </button>
          {openIndex === i && (
            <EntryList
              entries={menu.items}
              onAction={handleAction}
              checkedActions={checkedActions}
              disabledActions={disabledActions}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default MenuBar
