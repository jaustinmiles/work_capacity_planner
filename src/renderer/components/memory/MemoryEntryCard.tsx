/**
 * MemoryEntryCard Component
 *
 * Displays a single agent memory entry with edit/delete/pin controls.
 */

import React, { useState } from 'react'
import { Card, Button, Tag, Typography, Space, Input } from '@arco-design/web-react'
import {
  IconEdit,
  IconDelete,
  IconStar,
  IconStarFill,
  IconCheck,
  IconClose,
} from '@arco-design/web-react/icon'
import { MemorySource } from '@shared/enums'
import type { AgentMemory } from '@shared/memory-types'
import { useMemoryStore } from '../../store/useMemoryStore'

const { Text } = Typography

const SOURCE_LABELS: Record<MemorySource, { label: string; color: string }> = {
  [MemorySource.AgentObserved]: { label: 'Observed', color: 'purple' },
  [MemorySource.UserStated]: { label: 'You said', color: 'arcoblue' },
  [MemorySource.ConversationSummary]: { label: 'Summary', color: 'gray' },
}

interface MemoryEntryCardProps {
  memory: AgentMemory
}

export function MemoryEntryCard({ memory }: MemoryEntryCardProps): React.ReactElement {
  const { updateMemory, deleteMemory } = useMemoryStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(memory.value)

  const sourceConfig = SOURCE_LABELS[memory.source] ?? { label: memory.source, color: 'gray' }

  const handleSave = async (): Promise<void> => {
    if (editValue.trim() && editValue !== memory.value) {
      await updateMemory(memory.id, { value: editValue.trim() })
    }
    setIsEditing(false)
  }

  const handleTogglePin = async (): Promise<void> => {
    await updateMemory(memory.id, { pinned: !memory.pinned })
  }

  return (
    <Card
      size="small"
      style={{
        borderRadius: 8,
        borderLeft: memory.pinned ? '3px solid var(--color-warning-6)' : undefined,
        background: 'var(--color-bg-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <Space style={{ width: '100%' }}>
              <Input
                value={editValue}
                onChange={setEditValue}
                onPressEnter={handleSave}
                autoFocus
                style={{ flex: 1 }}
              />
              <Button size="mini" type="primary" icon={<IconCheck />} onClick={handleSave} />
              <Button size="mini" icon={<IconClose />} onClick={() => { setIsEditing(false); setEditValue(memory.value) }} />
            </Space>
          ) : (
            <>
              <Text style={{ fontSize: 13 }}>{memory.value}</Text>
              <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center' }}>
                <Tag size="small" color={sourceConfig.color} style={{ fontSize: 10 }}>
                  {sourceConfig.label}
                </Tag>
                <Text type="secondary" style={{ fontSize: 10 }}>
                  {new Date(memory.updatedAt).toLocaleDateString()}
                </Text>
                {memory.confidence < 0.7 && (
                  <Text type="secondary" style={{ fontSize: 10 }}>
                    {Math.round(memory.confidence * 100)}% confident
                  </Text>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {!isEditing && (
          <Space size={2}>
            <Button
              size="mini"
              type="text"
              icon={memory.pinned ? <IconStarFill style={{ color: 'var(--color-warning-6)' }} /> : <IconStar />}
              onClick={handleTogglePin}
            />
            <Button
              size="mini"
              type="text"
              icon={<IconEdit />}
              onClick={() => setIsEditing(true)}
            />
            <Button
              size="mini"
              type="text"
              status="danger"
              icon={<IconDelete />}
              onClick={() => deleteMemory(memory.id)}
            />
          </Space>
        )}
      </div>
    </Card>
  )
}
