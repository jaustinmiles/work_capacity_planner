/**
 * MemoryPanel Component
 *
 * Dedicated tab showing all agent memories and conversation summaries.
 * Users can view, edit, pin, and delete memories.
 */

import React, { useEffect } from 'react'
import { Typography, Space, Empty, Divider, Collapse, Tag } from '@arco-design/web-react'
import { IconBulb } from '@arco-design/web-react/icon'
import { useMemoryStore } from '../../store/useMemoryStore'
import { MemoryEntryCard } from './MemoryEntryCard'
import { MemoryCategory } from '@shared/enums'
import type { AgentMemory } from '@shared/memory-types'

const { Title, Text } = Typography

const CATEGORY_CONFIG: Record<MemoryCategory, { label: string; color: string }> = {
  [MemoryCategory.Preference]: { label: 'Preferences', color: 'arcoblue' },
  [MemoryCategory.Correction]: { label: 'Corrections', color: 'orangered' },
  [MemoryCategory.Pattern]: { label: 'Observed Patterns', color: 'purple' },
  [MemoryCategory.Fact]: { label: 'Facts', color: 'green' },
}

export function MemoryPanel(): React.ReactElement {
  const { memories, summaries, isLoading, loadMemories, loadSummaries } = useMemoryStore()

  useEffect(() => {
    loadMemories()
    loadSummaries()
  }, [loadMemories, loadSummaries])

  // Group memories by category
  const grouped = new Map<MemoryCategory, AgentMemory[]>()
  for (const mem of memories) {
    const list = grouped.get(mem.category) ?? []
    list.push(mem)
    grouped.set(mem.category, list)
  }

  if (isLoading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Text type="secondary">Loading memories...</Text>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Title heading={4} style={{ margin: 0 }}>
          <IconBulb style={{ marginRight: 8 }} />
          Agent Memory
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Things the AI has learned about you across conversations. Edit or delete anything here.
        </Text>
      </div>

      {/* Empty state */}
      {memories.length === 0 && summaries.length === 0 && (
        <Empty
          description="No memories yet. The agent will learn from your conversations."
          style={{ marginTop: 60 }}
        />
      )}

      {/* Memories grouped by category */}
      {Object.values(MemoryCategory).map(category => {
        const mems = grouped.get(category)
        if (!mems || mems.length === 0) return null

        const config = CATEGORY_CONFIG[category]

        return (
          <div key={category} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Tag color={config.color} size="small">{config.label}</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{mems.length}</Text>
            </div>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              {mems.map(mem => (
                <MemoryEntryCard key={mem.id} memory={mem} />
              ))}
            </Space>
          </div>
        )
      })}

      {/* Conversation Summaries */}
      {summaries.length > 0 && (
        <>
          <Divider style={{ margin: '24px 0 16px' }} />
          <Title heading={6} style={{ marginBottom: 12, color: 'var(--color-text-2)' }}>
            Conversation Summaries ({summaries.length})
          </Title>
          <Collapse bordered={false}>
            {summaries.map(summary => (
              <Collapse.Item
                key={summary.id}
                name={summary.id}
                header={
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13 }}>
                      {summary.summary.substring(0, 80)}
                      {summary.summary.length > 80 ? '...' : ''}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                      {new Date(summary.createdAt).toLocaleDateString()}
                    </Text>
                  </div>
                }
              >
                <div style={{ padding: '8px 0', fontSize: 13 }}>
                  <Text>{summary.summary}</Text>
                  {summary.keyDecisions.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <Text bold style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                        KEY DECISIONS
                      </Text>
                      <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                        {summary.keyDecisions.map((d, i) => (
                          <li key={i} style={{ color: 'var(--color-text-2)', fontSize: 12 }}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Collapse.Item>
            ))}
          </Collapse>
        </>
      )}
    </div>
  )
}
