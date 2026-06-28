import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../app/theme'

export interface MenuItem {
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
}

export interface MenuSeparator {
  separator: true
}

export type MenuEntry = MenuItem | MenuSeparator

export interface ContextMenuState {
  x: number
  y: number
  items: MenuEntry[]
}

function isSep(e: MenuEntry): e is MenuSeparator {
  return 'separator' in e
}

export function ContextMenu({
  menu,
  onClose
}: {
  menu: ContextMenuState
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const MENU_W = 210
  const ITEM_H = 28
  const itemCount = menu.items.filter((e) => !isSep(e)).length
  const sepCount = menu.items.filter(isSep).length
  const menuH = itemCount * ITEM_H + sepCount * 9 + 8

  const x = Math.min(menu.x, window.innerWidth - MENU_W - 8)
  const y = Math.min(menu.y, window.innerHeight - menuH - 8)

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        width: MENU_W,
        background: '#1a1a26',
        border: `1px solid #35354a`,
        borderRadius: 8,
        boxShadow: '0 12px 40px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)',
        zIndex: 9999,
        padding: '4px 0',
        userSelect: 'none',
        fontFamily: theme.font.ui,
        fontSize: theme.font.size.sm
      }}
    >
      {menu.items.map((entry, i) => {
        if (isSep(entry)) {
          return <div key={i} style={{ height: 1, background: '#2e2e40', margin: '4px 0' }} />
        }
        const item = entry as MenuItem
        return (
          <div
            key={i}
            onMouseDown={(e) => {
              e.stopPropagation()
              if (!item.disabled && item.onClick) {
                item.onClick()
                onClose()
              }
            }}
            style={{
              padding: '5px 12px',
              height: ITEM_H,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 20,
              color: item.disabled
                ? '#44445a'
                : item.danger
                  ? theme.color.danger
                  : theme.color.text,
              cursor: item.disabled ? 'default' : 'pointer',
              borderRadius: 4,
              margin: '0 4px',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => {
              if (!item.disabled)
                (e.currentTarget as HTMLElement).style.background = '#2a2a3c'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
            {item.shortcut && (
              <span style={{ color: '#55556a', fontSize: 10, flexShrink: 0 }}>
                {item.shortcut}
              </span>
            )}
          </div>
        )
      })}
    </div>,
    document.body
  )
}
