import { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Space, Typography, Tag, Card, Divider, Message } from '@arco-design/web-react'
import { IconLeft, IconRight, IconClockCircle } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { EntityType } from '@shared/enums'
import { ComparisonType } from '@/shared/constants'
import {
  buildComparisonGraph,
  detectCycle,
  hasTransitiveRelationship,
  type ComparisonResult,
  type ComparisonGraph,
  type ItemId,
} from '../../utils/comparison-graph'
import { ComparisonGraphMinimap } from './ComparisonGraphMinimap'

const { Title, Text } = Typography

interface TaskSlideshowProps {
  visible: boolean
  onClose: () => void
}

type SlideshowItem = {
  id: ItemId
  type: EntityType.Task | EntityType.Workflow
  data: Task | SequencedTask
}

export function TaskSlideshow({ visible, onClose }: TaskSlideshowProps) {
  const { tasks, sequencedTasks } = useTaskStore()
  const { isCompact, isMobile } = useResponsive()
  const [currentPairIndex, setCurrentPairIndex] = useState(0)
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<ComparisonType>(ComparisonType.Priority)

  // Build graph from comparisons using utility
  const graph = useMemo<ComparisonGraph>(() => buildComparisonGraph(comparisons), [comparisons])

  // Combine and filter tasks and workflows (exclude completed and archived)
  const items = useMemo<SlideshowItem[]>(() => {
    const taskItems: SlideshowItem[] = tasks
      .filter(t => !t.archived && !t.completed)
      .map(task => ({
        id: task.id,
        type: EntityType.Task,
        data: task,
      }))

    const workflowItems: SlideshowItem[] = sequencedTasks
      .filter(w => !w.archived && !w.completed)
      .map(workflow => ({
        id: workflow.id,
        type: EntityType.Workflow,
        data: workflow,
      }))

    // Simply combine all items without sorting
    return [...taskItems, ...workflowItems]

  }, [tasks, sequencedTasks])

  // Get current pair of items
  const getCurrentPair = () => {
    if (items.length < 2) return null
    const indexA = currentPairIndex * 2
    const indexB = currentPairIndex * 2 + 1
    if (indexB >= items.length) return null
    const itemA = items[indexA]
    const itemB = items[indexB]
    if (!itemA || !itemB) return null
    return [itemA, itemB]
  }

  // Navigation functions
  const goToPrevious = () => {
    setCurrentPairIndex(prev => {
      const maxPairs = Math.floor(items.length / 2)
      return prev > 0 ? prev - 1 : maxPairs - 1
    })
    setCurrentQuestion(ComparisonType.Priority)
  }

  const goToNext = () => {
    let nextIndex = currentPairIndex
    const maxPairs = Math.floor(items.length / 2)
    let skippedCount = 0

    // Try to find a pair we don't already know through transitivity
    do {
      nextIndex = nextIndex < maxPairs - 1 ? nextIndex + 1 : 0

      // Check if we've looped through all pairs
      if (nextIndex === currentPairIndex) {
        break
      }

      const indexA = nextIndex * 2
      const indexB = nextIndex * 2 + 1
      if (indexB >= items.length) break

      const itemA = items[indexA]
      const itemB = items[indexB]
      if (!itemA || !itemB) break

      // Check if we already know this relationship through transitivity
      const priorityRel = hasTransitiveRelationship(graph.priorityWins, itemA.id, itemB.id)
      const urgencyRel = hasTransitiveRelationship(graph.urgencyWins, itemA.id, itemB.id)

      if (priorityRel === 'unknown' || urgencyRel === 'unknown') {
        // Found a pair we don't fully know - use it!
        if (skippedCount > 0) {
          Message.info(`Skipped ${skippedCount} pair(s) already known through transitivity`)
        }
        break
      }

      skippedCount++
    } while (nextIndex !== currentPairIndex)

    setCurrentPairIndex(nextIndex)
    setCurrentQuestion(ComparisonType.Priority)
  }

  // Handle comparison selection
  const handleComparison = (winner: ItemId) => {
    const pair = getCurrentPair()
    if (!pair) return

    const loser = winner === pair[0]!.id ? pair[1]!.id : pair[0]!.id

    // Check for cycle before adding comparison
    if (currentQuestion === ComparisonType.Priority) {
      // Check if this would create a cycle in priority graph
      if (detectCycle(graph.priorityWins, winner, loser)) {
        Message.warning(`Inconsistency detected: This creates a circular priority relationship! (${winner} beats ${loser} but there's already a path from ${loser} to ${winner})`)
      }
    } else {
      // Check if this would create a cycle in urgency graph
      if (detectCycle(graph.urgencyWins, winner, loser)) {
        Message.warning(`Inconsistency detected: This creates a circular urgency relationship! (${winner} beats ${loser} but there's already a path from ${loser} to ${winner})`)
      }
    }

    const existingComparison = comparisons.find(
      c => c.itemA === pair[0]?.id && c.itemB === pair[1]?.id,
    )

    if (currentQuestion === ComparisonType.Priority) {
      if (existingComparison) {
        setComparisons(prev => prev.map(c =>
          c.itemA === pair[0]?.id && c.itemB === pair[1]?.id
            ? { ...c, higherPriority: winner }
            : c,
        ))
      } else {
        setComparisons(prev => [...prev, {
          itemA: pair[0]!.id,
          itemB: pair[1]!.id,
          higherPriority: winner,
          higherUrgency: null,
          timestamp: Date.now(),
        }])
      }
      setCurrentQuestion(ComparisonType.Urgency)
    } else {
      setComparisons(prev => prev.map(c =>
        c.itemA === pair[0]!.id && c.itemB === pair[1]!.id
          ? { ...c, higherUrgency: winner }
          : c,
      ))
      goToNext()
    }
  }

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return

    const handleKeyPress = (e: KeyboardEvent) => {
      const pair = getCurrentPair()

      if (e.key === '1' && pair) {
        handleComparison(pair[0]!.id)
      } else if (e.key === '2' && pair) {
        handleComparison(pair[1]!.id)
      } else if (e.key === 'ArrowLeft') {
        goToPrevious()
      } else if (e.key === 'ArrowRight') {
        goToNext()
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [visible, items, currentPairIndex, currentQuestion, comparisons, graph])

  // Reset index when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentPairIndex(0)
      setCurrentQuestion(ComparisonType.Priority)
      setComparisons([])
    }
  }, [visible])

  if (items.length === 0) {
    return (
      <Modal
        title="Task & Workflow Slideshow"
        visible={visible}
        onCancel={onClose}
        footer={null}
        style={{ width: 800 }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">No tasks or workflows to display</Text>
        </div>
      </Modal>
    )
  }

  if (items.length < 2) {
    return (
      <Modal
        title="Task & Workflow Comparison"
        visible={visible}
        onCancel={onClose}
        footer={null}
        style={{ width: 800 }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">Need at least 2 items to compare</Text>
        </div>
      </Modal>
    )
  }

  const currentPair = getCurrentPair()

  // Type guards for better type safety
  const isRegularTask = (data: Task | SequencedTask): data is Task => {
    return 'importance' in data && 'urgency' in data
  }

  if (!currentPair) {
    return (
      <Modal
        title="Task & Workflow Comparison"
        visible={visible}
        onCancel={onClose}
        footer={null}
        style={{ width: 800 }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">No more pairs to compare</Text>
        </div>
      </Modal>
    )
  }

  const [itemA, itemB] = currentPair
  const maxPairs = Math.floor(items.length / 2)
  const currentComparison = comparisons.find(
    c => c.itemA === itemA!.id && c.itemB === itemB!.id,
  )

  return (
    <Modal
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>Task & Workflow Comparison</span>
          <Tag>{`Pair ${currentPairIndex + 1} of ${maxPairs}`}</Tag>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button
            icon={<IconLeft />}
            onClick={goToPrevious}
            disabled={maxPairs <= 1}
          >
            Previous Pair
          </Button>
          <Text type="secondary">Press 1 or 2 to select</Text>
          <Button
            onClick={goToNext}
            disabled={maxPairs <= 1}
          >
            Next Pair
            <IconRight style={{ marginLeft: 4 }} />
          </Button>
        </Space>
      }
      style={{
        width: isCompact ? '98vw' : isMobile ? '95vw' : 1200,
        maxWidth: isCompact ? '98vw' : isMobile ? '95vw' : '90vw',
      }}
      maskClosable={false}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        {/* Current Question */}
        <Card style={{ background: '#f0f5ff', textAlign: 'center' }}>
          <Title heading={4} style={{ margin: '8px 0' }}>
            Which item has higher {currentQuestion === ComparisonType.Priority ? 'PRIORITY' : 'URGENCY'}?
          </Title>
          <Text type="secondary">
            {currentQuestion === ComparisonType.Priority
              ? 'Priority = Importance × Urgency (which should be done first?)'
              : 'Urgency = How time-sensitive is this item?'}
          </Text>
          {currentComparison && (
            <div style={{ marginTop: 12 }}>
              {currentQuestion === ComparisonType.Priority && currentComparison.higherPriority && (
                <Tag color="green">Priority answered</Tag>
              )}
              {currentQuestion === ComparisonType.Urgency && currentComparison.higherUrgency && (
                <Tag color="green">Urgency answered</Tag>
              )}
            </div>
          )}
        </Card>

        {/* Graph Minimap */}
        {comparisons.length > 0 && (
          <ComparisonGraphMinimap
            graph={graph}
            items={items.map(item => ({
              id: item.id,
              title: isRegularTask(item.data)
                ? (item.data as Task).name
                : (item.data as SequencedTask).name,
            }))}
            currentComparison={itemA && itemB ? [itemA.id, itemB.id] : undefined}
            currentQuestion={currentQuestion}
            width={isCompact ? 280 : 320}
            height={180}
          />
        )}

        {/* Items Comparison */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          {/* Item A */}
          <div style={{ flex: 1 }}>
            <Button
              type={
                (currentQuestion === ComparisonType.Priority && currentComparison?.higherPriority === itemA!.id) ||
                (currentQuestion === ComparisonType.Urgency && currentComparison?.higherUrgency === itemA!.id)
                  ? 'primary' : 'default'
              }
              onClick={() => handleComparison(itemA!.id)}
              style={{ width: '100%', marginBottom: 12 }}
            >
              Press &quot;1&quot; to select this
            </Button>
            <Card style={{ height: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color="blue" style={{ alignSelf: 'center' }}>Item 1</Tag>
                <Title heading={5} style={{ margin: '8px 0' }}>
                  {itemA!.data.name}
                </Title>
                <Tag color={itemA!.type === EntityType.Task ? 'arcoblue' : 'purple'}>
                  {itemA!.type === EntityType.Task ? 'Task' : 'Workflow'}
                </Tag>

                {isRegularTask(itemA!.data) && (
                  <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text>Current Importance: {itemA!.data.importance}/10</Text>
                    <Text>Current Urgency: {itemA!.data.urgency}/10</Text>
                  </>
                )}

                <Divider style={{ margin: '12px 0' }} />
                <Space>
                  <IconClockCircle />
                  <Text>{itemA!.data.duration || 0} minutes</Text>
                </Space>

                {itemA!.data.notes && (
                  <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {itemA!.data.notes.substring(0, 100)}
                      {itemA!.data.notes.length > 100 && '...'}
                    </Text>
                  </>
                )}
              </Space>
            </Card>
          </div>

          {/* Item B */}
          <div style={{ flex: 1 }}>
            <Button
              type={
                (currentQuestion === ComparisonType.Priority && currentComparison?.higherPriority === itemB!.id) ||
                (currentQuestion === ComparisonType.Urgency && currentComparison?.higherUrgency === itemB!.id)
                  ? 'primary' : 'default'
              }
              onClick={() => handleComparison(itemB!.id)}
              style={{ width: '100%', marginBottom: 12 }}
            >
              Press &quot;2&quot; to select this
            </Button>
            <Card style={{ height: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tag color="orange" style={{ alignSelf: 'center' }}>Item 2</Tag>
                <Title heading={5} style={{ margin: '8px 0' }}>
                  {itemB!.data.name}
                </Title>
                <Tag color={itemB!.type === EntityType.Task ? 'arcoblue' : 'purple'}>
                  {itemB!.type === EntityType.Task ? 'Task' : 'Workflow'}
                </Tag>

                {isRegularTask(itemB!.data) && (
                  <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text>Current Importance: {itemB!.data.importance}/10</Text>
                    <Text>Current Urgency: {itemB!.data.urgency}/10</Text>
                  </>
                )}

                <Divider style={{ margin: '12px 0' }} />
                <Space>
                  <IconClockCircle />
                  <Text>{itemB!.data.duration || 0} minutes</Text>
                </Space>

                {itemB!.data.notes && (
                  <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {itemB!.data.notes.substring(0, 100)}
                      {itemB!.data.notes.length > 100 && '...'}
                    </Text>
                  </>
                )}
              </Space>
            </Card>
          </div>
        </div>

        {/* Comparisons Summary */}
        <Card>
          <Text style={{ fontWeight: 600 }}>Comparisons Made: </Text>
          <Text>{comparisons.length} pairs evaluated</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Results stored locally for this session
          </Text>
        </Card>
      </Space>
    </Modal>
  )
}
