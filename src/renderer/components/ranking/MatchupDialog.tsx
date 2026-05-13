/**
 * MatchupDialog — Modal popup for picking the winner of one comparison.
 *
 * Used by RankingView in two ways:
 *   1. User clicks "Auto next pair" → the algorithm-picked pair opens here.
 *   2. User clicks two bracket nodes in succession → those open here.
 *
 * Keyboard: 1 = item A, 2 = item B, = = equal, Esc = cancel.
 */

import { useEffect } from 'react'
import { Modal, Button, Card, Space, Typography, Tag, Divider } from '@arco-design/web-react'
import { IconClockCircle } from '@arco-design/web-react/icon'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { EntityType } from '@shared/enums'
import { ComparisonType } from '@/shared/constants'
import type { ItemId } from '../../utils/comparison-graph'

const { Title, Text } = Typography

export type MatchupItem = {
  id: ItemId
  type: EntityType.Task | EntityType.Workflow
  data: Task | SequencedTask
}

interface MatchupDialogProps {
  itemA: MatchupItem | null
  itemB: MatchupItem | null
  dimension: ComparisonType
  /** Previous answer for this pair in the active dimension (if any). */
  currentAnswer: ItemId | 'equal' | null
  onPick: (winner: ItemId | 'equal') => void
  onCancel: () => void
}

function isRegularTask(data: Task | SequencedTask): data is Task {
  return 'duration' in data && 'importance' in data && !('totalDuration' in data)
}

function ItemCard({
  item,
  label,
  isSelected,
  onClick,
  hotkey,
}: {
  item: MatchupItem
  label: string
  isSelected: boolean
  onClick: () => void
  hotkey: string
}) {
  return (
    <div style={{ flex: 1 }}>
      <Button
        type={isSelected ? 'primary' : 'default'}
        onClick={onClick}
        style={{ width: '100%', marginBottom: 12 }}
      >
        {`Press "${hotkey}" for this`}
      </Button>
      <Card style={{ height: '100%' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Tag color="blue" style={{ alignSelf: 'center' }}>{label}</Tag>
          <Title heading={5} style={{ margin: '8px 0' }}>{item.data.name}</Title>
          <Tag color={item.type === EntityType.Task ? 'arcoblue' : 'purple'}>
            {item.type === EntityType.Task ? 'Task' : 'Workflow'}
          </Tag>
          {isRegularTask(item.data) && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Text>Current Importance: {item.data.importance}/10</Text>
              <Text>Current Urgency: {item.data.urgency}/10</Text>
            </>
          )}
          <Divider style={{ margin: '12px 0' }} />
          <Space>
            <IconClockCircle />
            <Text>{item.data.duration || 0} minutes</Text>
          </Space>
          {item.data.notes && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {item.data.notes.substring(0, 100)}
                {item.data.notes.length > 100 && '…'}
              </Text>
            </>
          )}
        </Space>
      </Card>
    </div>
  )
}

export function MatchupDialog({
  itemA,
  itemB,
  dimension,
  currentAnswer,
  onPick,
  onCancel,
}: MatchupDialogProps) {
  const visible = !!(itemA && itemB)

  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (!itemA || !itemB) return
      if (e.key === '1') onPick(itemA.id)
      else if (e.key === '2') onPick(itemB.id)
      else if (e.key === '=') onPick('equal')
      else if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, itemA, itemB, onPick, onCancel])

  if (!itemA || !itemB) return null

  const dimensionLabel = dimension === ComparisonType.Priority ? 'IMPORTANCE' : 'URGENCY'
  const dimensionHint = dimension === ComparisonType.Priority
    ? 'Importance = intrinsic value, impact, or significance'
    : 'Urgency = how time-sensitive is this item?'

  return (
    <Modal
      visible={visible}
      onCancel={onCancel}
      footer={
        <Space style={{ width: '100%', justifyContent: 'center' }}>
          <Button onClick={onCancel}>Cancel (Esc)</Button>
          <Button
            type={currentAnswer === 'equal' ? 'primary' : 'default'}
            onClick={() => onPick('equal')}
          >
            They are equal (=)
          </Button>
        </Space>
      }
      style={{ width: 900, maxWidth: '95vw' }}
      maskClosable
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>Which has higher {dimensionLabel}?</span>
          {currentAnswer !== null && (
            <Tag color="green">You&apos;ve answered this before — change your mind?</Tag>
          )}
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        <Text type="secondary">{dimensionHint}</Text>
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          <ItemCard
            item={itemA}
            label="Item 1"
            isSelected={currentAnswer === itemA.id}
            onClick={() => onPick(itemA.id)}
            hotkey="1"
          />
          <ItemCard
            item={itemB}
            label="Item 2"
            isSelected={currentAnswer === itemB.id}
            onClick={() => onPick(itemB.id)}
            hotkey="2"
          />
        </div>
      </Space>
    </Modal>
  )
}
