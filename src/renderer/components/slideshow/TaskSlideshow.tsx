import { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Space, Typography, Tag, Card, Divider, Message, Table } from '@arco-design/web-react'
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
  getMissingComparisons,
  topologicalSort,
  mapToRankings,
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
  const [comparisonPairs, setComparisonPairs] = useState<Array<[ItemId, ItemId]>>([])
  const [isShowingMissingPairs, setIsShowingMissingPairs] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [shuffledItems, setShuffledItems] = useState<SlideshowItem[]>([])

  // Build graph from comparisons using utility
  const graph = useMemo<ComparisonGraph>(() => buildComparisonGraph(comparisons), [comparisons])

  // Fisher-Yates shuffle algorithm
  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
    }
    return shuffled
  }

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

  // Initialize comparison pairs on first load
  useEffect(() => {
    if (comparisonPairs.length === 0 && !isComplete && items.length > 1) {
      if (comparisons.length === 0 && shuffledItems.length === 0) {
        // First time - shuffle items for better transitivity benefits
        const shuffled = shuffleArray(items)
        setShuffledItems(shuffled)

        // Create tournament-style initial pairs (n/2 pairs)
        const initialPairs: Array<[ItemId, ItemId]> = []
        for (let i = 0; i < shuffled.length - 1; i += 2) {
          if (shuffled[i] && shuffled[i + 1]) {
            initialPairs.push([shuffled[i]!.id, shuffled[i + 1]!.id])
          }
        }
        if (initialPairs.length > 0) {
          setComparisonPairs(initialPairs)
          setCurrentPairIndex(0)
        }
      } else if (comparisons.length > 0) {
        // We have existing comparisons, check what's still needed
        const itemsToUse = shuffledItems.length > 0 ? shuffledItems : items
        const itemIds = itemsToUse.map(item => item.id)
        const stillNeeded = getMissingComparisons(itemIds, graph)
        if (stillNeeded.length > 0) {
          setComparisonPairs(stillNeeded)
          setCurrentPairIndex(0)
        } else {
          setIsComplete(true)
        }
      }
    }
  }, [items, comparisons.length, comparisonPairs.length, isComplete, graph, shuffledItems])

  // Get current pair of items
  const getCurrentPair = () => {
    if (comparisonPairs.length === 0) return null
    if (currentPairIndex >= comparisonPairs.length) return null

    const currentPair = comparisonPairs[currentPairIndex]
    if (!currentPair) return null

    const [idA, idB] = currentPair
    // Use shuffled items if available, otherwise use original items
    const itemsToSearch = shuffledItems.length > 0 ? shuffledItems : items
    const itemA = itemsToSearch.find(item => item.id === idA)
    const itemB = itemsToSearch.find(item => item.id === idB)

    if (!itemA || !itemB) return null
    return [itemA, itemB]
  }

  // Navigation functions
  const goToPrevious = () => {
    if (currentPairIndex > 0) {
      const newIndex = currentPairIndex - 1
      setCurrentPairIndex(newIndex)

      // Check if we have partial answers for this pair
      const targetPair = comparisonPairs[newIndex]
      if (targetPair) {
        const existingComparison = comparisons.find(
          c => (c.itemA === targetPair[0] && c.itemB === targetPair[1]) ||
               (c.itemA === targetPair[1] && c.itemB === targetPair[0]),
        )
        // Reset to appropriate question based on what's been answered
        if (existingComparison?.higherPriority && !existingComparison?.higherUrgency) {
          setCurrentQuestion(ComparisonType.Urgency)
        } else {
          setCurrentQuestion(ComparisonType.Priority)
        }
      } else {
        setCurrentQuestion(ComparisonType.Priority)
      }
    } else {
      Message.info('Already at the first comparison')
    }
  }

  const goToNext = () => {
    // Since we dynamically recompute after each complete comparison,
    // this is mainly for skipping the current pair
    if (currentPairIndex < comparisonPairs.length - 1) {
      setCurrentPairIndex(currentPairIndex + 1)
      setCurrentQuestion(ComparisonType.Priority)
    } else {
      Message.info('This is the last comparison pair. Complete it to see if more are needed.')
    }
  }

  // Handle comparison selection (winner can be ItemId or 'equal')
  const handleComparison = (winner: ItemId | 'equal') => {
    const pair = getCurrentPair()
    if (!pair) return

    const loser = winner !== 'equal' ?
      (winner === pair[0]!.id ? pair[1]!.id : pair[0]!.id) : null

    // Check for cycle before adding comparison (only for non-equal relationships)
    if (winner !== 'equal' && loser) {
      if (currentQuestion === ComparisonType.Priority) {
        // Check if this would create a cycle in priority graph
        if (detectCycle(graph.priorityWins, winner, loser)) {
          Message.warning(`Inconsistency detected: This creates a circular importance relationship! (${winner} beats ${loser} but there's already a path from ${loser} to ${winner})`)
        }
      } else {
        // Check if this would create a cycle in urgency graph
        if (detectCycle(graph.urgencyWins, winner, loser)) {
          Message.warning(`Inconsistency detected: This creates a circular urgency relationship! (${winner} beats ${loser} but there's already a path from ${loser} to ${winner})`)
        }
      }
    }

    const existingComparison = comparisons.find(
      c => c.itemA === pair[0]?.id && c.itemB === pair[1]?.id,
    )

    let newComparisons: ComparisonResult[] = comparisons

    if (currentQuestion === ComparisonType.Priority) {
      if (existingComparison) {
        newComparisons = comparisons.map(c =>
          c.itemA === pair[0]?.id && c.itemB === pair[1]?.id
            ? { ...c, higherPriority: winner }
            : c,
        )
      } else {
        newComparisons = [...comparisons, {
          itemA: pair[0]!.id,
          itemB: pair[1]!.id,
          higherPriority: winner,
          higherUrgency: null,
          timestamp: Date.now(),
        }]
      }
      setComparisons(newComparisons)
      setCurrentQuestion(ComparisonType.Urgency)
    } else {
      newComparisons = comparisons.map(c =>
        c.itemA === pair[0]!.id && c.itemB === pair[1]!.id
          ? { ...c, higherUrgency: winner }
          : c,
      )
      setComparisons(newComparisons)

      // After answering both questions, dynamically recompute needed pairs
      // This applies transitivity immediately
      setTimeout(() => {
        const updatedGraph = buildComparisonGraph(newComparisons)
        const itemsToUse = shuffledItems.length > 0 ? shuffledItems : items
        const itemIds = itemsToUse.map(item => item.id)
        const stillNeeded = getMissingComparisons(itemIds, updatedGraph)

        // Filter out the current pair and any pairs we've already started
        const remainingPairs = stillNeeded.filter(([a, b]) => {
          // Don't include pairs we've already started comparing
          const alreadyStarted = newComparisons.some(c =>
            (c.itemA === a && c.itemB === b) || (c.itemA === b && c.itemB === a),
          )
          return !alreadyStarted
        })

        if (remainingPairs.length > 0) {
          setComparisonPairs(remainingPairs)
          setCurrentPairIndex(0)
          setCurrentQuestion(ComparisonType.Priority)
          setIsShowingMissingPairs(true) // Mark that we're now showing missing pairs
        } else {
          // All comparisons complete!
          Message.success('All comparisons complete! Graph is fully connected.')
          setIsComplete(true)
        }
      }, 0)
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
      } else if (e.key === '=' && pair) {
        handleComparison('equal')
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

  // Reset function to clear all comparisons
  const resetComparisons = () => {
    setComparisons([])
    setCurrentPairIndex(0)
    setCurrentQuestion(ComparisonType.Priority)
    setIsShowingMissingPairs(false)
    setIsComplete(false)
    Message.info('All comparisons cleared. Starting fresh!')
  }

  // Check if comparisons are complete on load
  useEffect(() => {
    if (comparisons.length > 0 && comparisonPairs.length === 0 && !isComplete) {
      const itemIds = items.map(item => item.id)
      const missingPairs = getMissingComparisons(itemIds, graph)
      if (missingPairs.length === 0 && items.length > 1) {
        setIsComplete(true)
      }
    }
  }, [comparisons, comparisonPairs, items, graph, isComplete])

  // Reset navigation when modal opens (but keep comparisons)
  useEffect(() => {
    if (visible) {
      setCurrentQuestion(ComparisonType.Priority)
      // Only reset index if we have pairs to show
      if (comparisonPairs.length > 0 && !isComplete) {
        setCurrentPairIndex(0)
      }
    }
  }, [visible, comparisonPairs.length, isComplete])

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

  // Show completion view with graphs if complete or no more pairs
  if (isComplete || (!currentPair && comparisons.length > 0)) {
    // Compute rankings for both importance and urgency
    const itemIds = items.map(item => item.id)
    const importanceSorted = topologicalSort(itemIds, graph.priorityWins)
    const urgencySorted = topologicalSort(itemIds, graph.urgencyWins)

    const importanceRankings = mapToRankings(importanceSorted)
    const urgencyRankings = mapToRankings(urgencySorted)

    // Build rankings table data
    const rankingsData = items.map(item => {
      const importanceRank = importanceRankings.find(r => r.id === item.id)
      const urgencyRank = urgencyRankings.find(r => r.id === item.id)

      const importanceScore = importanceRank?.score || 5
      const urgencyScore = urgencyRank?.score || 5
      const priorityScore = importanceScore * urgencyScore / 10 // Normalize to 1-10 scale

      return {
        key: item.id,
        name: isRegularTask(item.data)
          ? (item.data as Task).name
          : (item.data as SequencedTask).name,
        importance: importanceScore,
        urgency: urgencyScore,
        priority: priorityScore.toFixed(1),
        type: item.type,
      }
    })

    // Sort by priority for display
    rankingsData.sort((a, b) => parseFloat(b.priority) - parseFloat(a.priority))
    return (
      <Modal
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span>Task & Workflow Comparison - Complete!</span>
            <Tag color="green">✓ All Comparisons Complete</Tag>
          </Space>
        }
        visible={visible}
        onCancel={onClose}
        footer={
          <Space style={{ width: '100%', justifyContent: 'center' }}>
            <Button type="primary" onClick={resetComparisons}>
              Start New Comparison Session
            </Button>
            <Button onClick={onClose}>
              Close
            </Button>
          </Space>
        }
        style={{
          width: isCompact ? '98vw' : isMobile ? '95vw' : 1200,
          maxWidth: isCompact ? '98vw' : isMobile ? '95vw' : '90vw',
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Card style={{ background: '#f0fff0', textAlign: 'center' }}>
            <Title heading={4} style={{ margin: '8px 0', color: '#52c41a' }}>
              Graph Complete! 🎉
            </Title>
            <Text>
              All items have been compared and ranked. The graphs below show the complete
              priority and urgency relationships between all items.
            </Text>
            <div style={{ marginTop: 12 }}>
              <Text type="secondary">
                {comparisons.length} total comparisons made
              </Text>
            </div>
          </Card>

          {/* Rankings Table */}
          <Card>
            <Title heading={5} style={{ marginBottom: 16 }}>
              Computed Rankings (Priority = Importance × Urgency ÷ 10)
            </Title>
            <Table
              columns={[
                {
                  title: 'Task/Workflow',
                  dataIndex: 'name',
                  key: 'name',
                  width: '40%',
                },
                {
                  title: 'Type',
                  dataIndex: 'type',
                  key: 'type',
                  width: '15%',
                  render: (type: EntityType) => (
                    <Tag color={type === EntityType.Task ? 'blue' : 'purple'}>
                      {type === EntityType.Task ? 'Task' : 'Workflow'}
                    </Tag>
                  ),
                },
                {
                  title: 'Importance',
                  dataIndex: 'importance',
                  key: 'importance',
                  width: '15%',
                  align: 'center',
                  render: (score: number) => (
                    <Tag color={score >= 7 ? 'red' : score >= 4 ? 'orange' : 'green'}>
                      {score}
                    </Tag>
                  ),
                },
                {
                  title: 'Urgency',
                  dataIndex: 'urgency',
                  key: 'urgency',
                  width: '15%',
                  align: 'center',
                  render: (score: number) => (
                    <Tag color={score >= 7 ? 'red' : score >= 4 ? 'orange' : 'green'}>
                      {score}
                    </Tag>
                  ),
                },
                {
                  title: 'Priority',
                  dataIndex: 'priority',
                  key: 'priority',
                  width: '15%',
                  align: 'center',
                  render: (score: string) => {
                    const val = parseFloat(score)
                    return (
                      <Tag color={val >= 7 ? 'red' : val >= 4 ? 'orange' : 'green'}>
                        <strong>{score}</strong>
                      </Tag>
                    )
                  },
                },
              ]}
              data={rankingsData}
              pagination={false}
              size="small"
              border
            />
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Higher scores indicate higher importance/urgency. Priority helps determine task order.
              </Text>
            </div>
          </Card>

          {/* Final Graph Visualizations */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            {/* Priority Graph */}
            <div>
              <Title heading={6} style={{ marginBottom: 8, textAlign: 'center' }}>
                Importance Rankings
              </Title>
              <ComparisonGraphMinimap
                graph={{ priorityWins: graph.priorityWins, urgencyWins: new Map() }}
                items={items.map(item => ({
                  id: item.id,
                  title: isRegularTask(item.data)
                    ? (item.data as Task).name
                    : (item.data as SequencedTask).name,
                }))}
                width={isCompact ? 350 : 500}
                height={300}
              />
            </div>

            {/* Urgency Graph */}
            <div>
              <Title heading={6} style={{ marginBottom: 8, textAlign: 'center' }}>
                Urgency Rankings
              </Title>
              <ComparisonGraphMinimap
                graph={{ priorityWins: new Map(), urgencyWins: graph.urgencyWins }}
                items={items.map(item => ({
                  id: item.id,
                  title: isRegularTask(item.data)
                    ? (item.data as Task).name
                    : (item.data as SequencedTask).name,
                }))}
                width={isCompact ? 350 : 500}
                height={300}
              />
            </div>
          </div>
        </Space>
      </Modal>
    )
  }

  // Show empty state if no pairs at all
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
          <Text type="secondary">No items to compare</Text>
        </div>
      </Modal>
    )
  }

  const [itemA, itemB] = currentPair
  const currentComparison = comparisons.find(
    c => c.itemA === itemA!.id && c.itemB === itemB!.id,
  )

  return (
    <Modal
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>Task & Workflow Comparison</span>
          <Tag color={isShowingMissingPairs ? 'orange' : 'blue'}>
            {`Pair ${currentPairIndex + 1} of ${comparisonPairs.length}`}
          </Tag>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button
            icon={<IconLeft />}
            onClick={goToPrevious}
            disabled={comparisonPairs.length <= 1}
          >
            Previous Pair
          </Button>
          <Text type="secondary">Press 1, 2, or = for equal</Text>
          <Button
            onClick={goToNext}
            disabled={comparisonPairs.length <= 1}
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
            Which item has higher {currentQuestion === ComparisonType.Priority ? 'IMPORTANCE' : 'URGENCY'}?
          </Title>
          <Text type="secondary">
            {currentQuestion === ComparisonType.Priority
              ? 'Importance = The intrinsic value, impact, or significance of this item'
              : 'Urgency = How time-sensitive is this item?'}
          </Text>
          {currentComparison && (
            <div style={{ marginTop: 12 }}>
              {currentQuestion === ComparisonType.Priority && currentComparison.higherPriority && (
                <Tag color="green">Importance answered</Tag>
              )}
              {currentQuestion === ComparisonType.Urgency && currentComparison.higherUrgency && (
                <Tag color="green">Urgency answered</Tag>
              )}
            </div>
          )}
        </Card>

        {/* Graph Minimaps - Priority and Urgency */}
        {comparisons.length > 0 && (
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            {/* Priority Graph */}
            <div>
              <Title heading={6} style={{ marginBottom: 8, textAlign: 'center' }}>
                Importance Graph
              </Title>
              <ComparisonGraphMinimap
                graph={{ priorityWins: graph.priorityWins, urgencyWins: new Map() }}
                items={items.map(item => ({
                  id: item.id,
                  title: isRegularTask(item.data)
                    ? (item.data as Task).name
                    : (item.data as SequencedTask).name,
                }))}
                currentComparison={itemA && itemB ? [itemA.id, itemB.id] : undefined}
                currentQuestion={currentQuestion}
                width={isCompact ? 280 : 400}
                height={200}
              />
            </div>

            {/* Urgency Graph */}
            <div>
              <Title heading={6} style={{ marginBottom: 8, textAlign: 'center' }}>
                Urgency Graph
              </Title>
              <ComparisonGraphMinimap
                graph={{ priorityWins: new Map(), urgencyWins: graph.urgencyWins }}
                items={items.map(item => ({
                  id: item.id,
                  title: isRegularTask(item.data)
                    ? (item.data as Task).name
                    : (item.data as SequencedTask).name,
                }))}
                currentComparison={itemA && itemB ? [itemA.id, itemB.id] : undefined}
                currentQuestion={currentQuestion}
                width={isCompact ? 280 : 400}
                height={200}
              />
            </div>
          </div>
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
              Press &quot;1&quot; for this
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
              Press &quot;2&quot; for this
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

        {/* Equal Button */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button
            type={
              (currentQuestion === ComparisonType.Priority && currentComparison?.higherPriority === 'equal') ||
              (currentQuestion === ComparisonType.Urgency && currentComparison?.higherUrgency === 'equal')
                ? 'primary' : 'default'
            }
            onClick={() => handleComparison('equal')}
            size="large"
            style={{ minWidth: 200 }}
          >
            Press &quot;=&quot; if they are equal
          </Button>
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
