import { useEffect, useRef, useState } from 'react'
import type { MenuDef, MenuEntry } from './menuConfig'

interface MenuBarProps {
  menus: MenuDef[]
  onAction: (action: string) => void
  checkedActions?: Set<string>
}

function EntryList({
  entries,
  onAction,
  checkedActions
}: {
  entries: MenuEntry[]
  onAction: (action: string) => void
  checkedActions: Set<string>
}): JSX.Element {
  return (
    <div className="menubar-dropdown">
      {entries.map((entry, i) => {
        if (entry.type === 'separator') return <div key={i} className="menubar-separator" />
        if (entry.type === 'submenu') {
          return (
            <div key={i} className="menubar-item menubar-item--parent">
              <span className="menubar-item-label">{entry.label}</span>
              <span className="menubar-item-chevron">›</span>
              <div className="menubar-flyout">
                <EntryList entries={entry.items} onAction={onAction} checkedActions={checkedActions} />
              </div>
            </div>
          )
        }
        const checked = entry.checkable && checkedActions.has(entry.action)
        return (
          <button
            key={i}
            type="button"
            className={`menubar-item ${entry.checkable ? 'menubar-item--checkable' : ''}`}
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
  const { menus, onAction, checkedActions = new Set<string>() } = props
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
            <EntryList entries={menu.items} onAction={handleAction} checkedActions={checkedActions} />
          )}
        </div>
      ))}
    </div>
  )
}

export default MenuBar
