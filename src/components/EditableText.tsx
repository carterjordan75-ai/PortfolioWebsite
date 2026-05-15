'use client'

import { useRef, useCallback } from 'react'
import { useEditMode } from '@/contexts/EditModeContext'

interface EditableTextProps {
  slug: string
  field: string
  defaultValue: string
  className?: string
  style?: React.CSSProperties
  tag?: 'span' | 'p' | 'h1' | 'h2' | 'div'
}

export default function EditableText({
  slug,
  field,
  defaultValue,
  className = '',
  style = {},
  tag: Tag = 'span',
}: EditableTextProps) {
  const { editMode, addChange, pendingChanges } = useEditMode()
  const ref = useRef<HTMLElement>(null)

  const currentValue = pendingChanges[slug]?.[field] ?? defaultValue

  const handleBlur = useCallback(() => {
    const el = ref.current
    if (!el) return
    const newText = el.innerText.trim()
    if (newText !== defaultValue) {
      addChange(slug, field, newText)
    }
  }, [slug, field, defaultValue, addChange])

  if (!editMode) {
    return <Tag className={className} style={style}>{currentValue}</Tag>
  }

  return (
    <Tag
      ref={ref as React.RefObject<HTMLElement & HTMLSpanElement & HTMLParagraphElement & HTMLHeadingElement & HTMLDivElement>}
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
      onBlur={handleBlur}
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
    >
      {currentValue}
    </Tag>
  )
}
