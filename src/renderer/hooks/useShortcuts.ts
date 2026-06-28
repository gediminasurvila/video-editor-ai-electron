import { useEffect } from 'react'
import { useEditor } from '../state/store'
import { runCommand } from '../commands'
import { importViaDialog } from '../actions/quickActions'

/** Is the user typing into a field? If so, leave their keys alone. */
function isEditing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

/**
 * Camtasia-style keyboard shortcuts. Kept deliberately small and familiar:
 * Space to play, Delete to remove, S to split, arrows to nudge, ⌘/Ctrl+Z to undo.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isEditing(e.target)) return
      const s = useEditor.getState()
      const mod = e.metaKey || e.ctrlKey

      // Undo / redo
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        void importViaDialog()
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.togglePlay()
          break
        case 'Delete':
        case 'Backspace':
          if (s.selectedClipId) {
            e.preventDefault()
            // Shift+Delete → ripple delete (close gap); plain Delete → leave gap
            void runCommand('delete_clip', { clipId: s.selectedClipId, ripple: e.shiftKey })
          }
          break
        case 'i':
          e.preventDefault()
          s.setRangeIn(s.playhead)
          break
        case 'o':
          e.preventDefault()
          s.setRangeOut(s.playhead)
          break
        case 'x':
        case 'X':
          if (s.rangeIn !== null && s.rangeOut !== null && s.rangeOut > s.rangeIn) {
            e.preventDefault()
            void runCommand('delete_range', { inPoint: s.rangeIn, outPoint: s.rangeOut, ripple: true })
            s.clearRange()
          }
          break
        case 'Escape':
          s.clearRange()
          break
        case 's':
        case 'S':
        case 'b':
        case 'B':
          if (s.selectedClipId) {
            e.preventDefault()
            void runCommand('split_clip', { clipId: s.selectedClipId, at: s.playhead })
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          s.setPlayhead(s.playhead - (e.shiftKey ? 1 : 0.1))
          break
        case 'ArrowRight':
          e.preventDefault()
          s.setPlayhead(s.playhead + (e.shiftKey ? 1 : 0.1))
          break
        case 'Home':
          e.preventDefault()
          s.setPlayhead(0)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
