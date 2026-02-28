/**
 * NodeQuickCreate — Inline node creation widget.
 *
 * Appears at the double-click position on the canvas.
 * Text input with auto-focus. Enter creates node, Escape cancels.
 */

import { useState, useCallback } from 'react'
import { Input } from '@arco-design/web-react'

interface NodeQuickCreateProps {
  position: { x: number; y: number }
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function NodeQuickCreate({ position, onConfirm, onCancel }: NodeQuickCreateProps) {
  const [name, setName] = useState('')

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && name.trim()) {
      e.preventDefault()
      onConfirm(name.trim())
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }, [name, onConfirm, onCancel])

  const handleBlur = useCallback(() => {
    // If the user clicks away with text, create the node
    if (name.trim()) {
      onConfirm(name.trim())
    } else {
      onCancel()
    }
  }, [name, onConfirm, onCancel])

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 1000,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <Input
        autoFocus
        value={name}
        onChange={setName}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="Task name..."
        style={{
          width: 200,
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          fontSize: 14,
        }}
      />
    </div>
  )
}
