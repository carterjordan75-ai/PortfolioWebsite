'use client'

import { useRef, useCallback, useEffect } from 'react'
import { useEditMode } from '@/contexts/EditModeContext'

interface EditableTextProps {
  slug: string
  field: string
  defaultValue: string
  className?: string
  style?: React.CSSProperties
  tag?: 'span' | 'p' | 'h1' | 'h2' | 'div'
}

/**
 * In-page editable text — backed by a contentEditable element.
 *
 * Why so much ceremony? React doesn't play well with contentEditable.
 * If you render `{value}` as JSX children and the parent re-renders
 * during a keystroke, React's reconciler can update the text node and
 * a) wipe what the user just typed, b) move the cursor to the start.
 * It also makes the Save button feel broken: previously addChange only
 * fired on blur, so the toolbar's "Save All" stayed greyed-out until
 * the user clicked off the field — which, since clicking the greyed
 * button doesn't blur, meant they could never save without first
 * clicking somewhere else.
 *
 * The fix:
 *  - The contentEditable element has NO React children. React never
 *    reconciles a text node, so it can never touch the user's typing.
 *  - The initial DOM content is set imperatively in the ref callback
 *    (once, gated by a data-attribute).
 *  - A useEffect re-syncs the DOM when `currentValue` changes from the
 *    outside (e.g. after an admin-saved refetch updates defaultValue)
 *    BUT only when the user isn't currently focused on the field —
 *    we never disturb an in-progress edit.
 *  - `onInput` (every keystroke, not just blur) feeds addChange so the
 *    pending-change counter and the Save button respond live.
 */
export default function EditableText({
  slug,
  field,
  defaultValue,
  className = '',
  style = {},
  tag: Tag = 'span',
}: EditableTextProps) {
  const { editMode, addChange, pendingChanges } = useEditMode()
  const ref = useRef<HTMLElement | null>(null)

  const currentValue = pendingChanges[slug]?.[field] ?? defaultValue

  // Ref callback — runs once when the contentEditable mounts. Sets the
  // initial text via innerText (preserves newlines, no HTML escaping
  // gotchas) and stamps a data-attribute so a stale callback firing
  // again on the same element doesn't overwrite the user's edits.
  const setRef = useCallback((el: HTMLElement | null) => {
    ref.current = el
    if (el && el.dataset.editableReady !== '1') {
      el.innerText = currentValue
      el.dataset.editableReady = '1'
    }
    // We deliberately exclude currentValue from deps — the initial value
    // should only be applied at mount. External updates are handled by
    // the useEffect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external changes (e.g. after Save → admin-saved → refetch) only
  // when the user is NOT actively editing this field. document.activeElement
  // === el means the cursor is in here, so we leave the DOM alone.
  useEffect(() => {
    if (!editMode) return
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.innerText !== currentValue) {
      el.innerText = currentValue
    }
  }, [currentValue, editMode])

  // Fires on EVERY input, not just blur. That's what makes the Save
  // button responsive — the moment the user types anything, the
  // toolbar's changeCount ticks up and "Save All" becomes clickable.
  const captureChange = useCallback(() => {
    const el = ref.current
    if (!el) return
    const newText = el.innerText
    if (newText !== defaultValue) {
      addChange(slug, field, newText)
    }
  }, [slug, field, defaultValue, addChange])

  if (!editMode) {
    return <Tag className={className} style={style}>{currentValue}</Tag>
  }

  return (
    <Tag
      ref={setRef as React.RefCallback<HTMLElement & HTMLSpanElement & HTMLParagraphElement & HTMLHeadingElement & HTMLDivElement>}
      className={className}
      style={{
        ...style,
        outline: 'none',
        cursor: 'text',
        borderBottom: '2px dashed rgba(59, 130, 246, 0.4)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      contentEditable
      suppressContentEditableWarning
      onInput={captureChange}
      onBlur={captureChange}
      onFocus={() => {
        const el = ref.current
        if (el) {
          el.style.background = 'rgba(250, 204, 21, 0.12)'
          el.style.borderBottomColor = 'rgba(59, 130, 246, 0.8)'
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          ;(e.target as HTMLElement).blur()
        }
      }}
    />
  )
}
