import { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Space, Typography, Tag, Card, Divider, Message, Table, Switch, Radio } from '@arco-design/web-react'
import { IconClockCircle, IconCheck } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { EntityType } from '@shared/enums'
import { ComparisonType } from '@/shared/constants'
import { getDatabase } from '../../services/database'
import type { PersistedComparison } from '../../services/database-trpc'
import { logger } from '@/logger'
import {
  buildComparisonGraph,
  detectCycle,
  selectNextPair,
  topologicalSort,
  mapToRankings,
  getTournamentState,
  type ComparisonResult,
  type ComparisonGraph,
  type ItemId,
} from '../../utils/comparison-graph'
import { TournamentBracket } from './TournamentBracket'

// Anti-anchor window: how many of the most-recent items selectNextPair sees.
const RECENT_ITEMS_WINDOW = 6

/**
 * Fold persisted DB rows (one per dimension per pair) into the UI's
 * ComparisonResult shape (one per pair, with both dimensions).
 */
function hydrateComparisons(rows: PersistedComparison[]): ComparisonResult[] {
  const byPair = new Map<string, ComparisonResult>()
  for (const row of rows) {
    const key = `${row.itemAId}|${row.itemBId}`
    if (!byPair.has(key)) {
      byPair.set(key, {
        itemA: row.itemAId,
        itemB: row.itemBId,
        higherPriority: null,
        higherUrgency: null,
        timestamp: row.createdAt.getTime(),
      })
    }
    const entry = byPair.get(key)!
    const value: ItemId | 'equal' | null = row.isEqual ? 'equal' : row.winnerId
    if (row.dimension === ComparisonType.Priority) {
      entry.higherPriority = value
    } else if (row.dimension === ComparisonType.Urgency) {
      entry.higherUrgency = value
    }
  }
  return Array.from(byPair.values())
}

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
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([])
  // One-dimension-per-session: user explicitly picks priority or urgency.
  const [activeDimension, setActiveDimension] = useState<ComparisonType>(ComparisonType.Priority)
  // The single matchup currently in front of the user (computed lazily from graph state).
  const [currentPair, setCurrentPair] = useState<[ItemId, ItemId] | null>(null)
  // Item IDs (oldest → newest) just shown — fed to selectNextPair for anti-anchor.
  const [recentItems, setRecentItems] = useState<ItemId[]>([])
  const [isComplete, setIsComplete] = useState(false)
  const [sprintOnly, setSprintOnly] = useState(false)
  // Persisted-comparison hydration: gates the load-from-DB effect so it
  // fires once per modal open and doesn't clobber in-progress local state.
  const [isHydrated, setIsHydrated] = useState(false)

  // Build graph from comparisons using utility
  const graph = useMemo<ComparisonGraph>(() => buildComparisonGraph(comparisons), [comparisons])

  // Sprint-scope toggle: keep persisted comparisons (they're still valid for the
  // subset of items), but re-run pair selection over the new item set.
  // Resetting isHydrated triggers a fresh DB load scoped to the new item set.
  const handleSprintToggle = (checked: boolean) => {
    setSprintOnly(checked)
    setComparisons([])
    setCurrentPair(null)
    setRecentItems([])
    setIsComplete(false)
    setIsHydrated(false)
  }

  // Combine and filter tasks and workflows (exclude completed and archived)
  const items = useMemo<SlideshowItem[]>(() => {
    // Get workflow IDs to avoid duplicates
    const workflowIds = new Set(sequencedTasks.map(w => w.id))

    // Filter out tasks that are also in workflows
    const taskItems: SlideshowItem[] = tasks
      .filter(t => !t.archived && !t.completed && !workflowIds.has(t.id))
      .filter(t => !sprintOnly || t.inActiveSprint)
      .map(task => ({
        id: task.id,
        type: EntityType.Task,
        data: task,
      }))

    const workflowItems: SlideshowItem[] = sequencedTasks
      .filter(w => !w.archived && !w.completed)
      .filter(w => !sprintOnly || w.inActiveSprint)
      .map(workflow => ({
        id: workflow.id,
        type: EntityType.Workflow,
        data: workflow,
      }))

    // Simply combine all items without sorting
    return [...taskItems, ...workflowItems]

  }, [tasks, sequencedTasks, sprintOnly])

  // Hydrate persisted comparisons from DB when modal opens or scope changes.
  // Runs at most once per (open, scope) pair, gated by isHydrated.
  useEffect(() => {
    if (!visible || isHydrated || items.length === 0) return
    let cancelled = false
    const itemIds = items.map(i => i.id)
    void getDatabase()
      .listComparisons(itemIds)
      .then(rows => {
        if (cancelled) return
        setComparisons(hydrateComparisons(rows))
        setIsHydrated(true)
      })
      .catch(err => {
        if (cancelled) return
        logger.ui.error('Failed to hydrate persisted comparisons', { error: String(err) }, 'task-slideshow-hydrate')
        // Soft-fail: still let user start a fresh tournament
        setIsHydrated(true)
      })
    return () => { cancelled = true }
  }, [visible, isHydrated, items])

  // Reset hydration gate when modal closes so the next open re-fetches fresh state.
  useEffect(() => {
    if (!visible) {
      setIsHydrated(false)
    }
  }, [visible])

  // Pick the wins/equals graphs corresponding to the active dimension.
  const dimensionGraphs = useMemo(() => {
    if (activeDimension === ComparisonType.Priority) {
      return { winsGraph: graph.priorityWins, equalsGraph: graph.priorityEquals }
    }
    return { winsGraph: graph.urgencyWins, equalsGraph: graph.urgencyEquals }
  }, [graph, activeDimension])

  // Lookup map: ID → SlideshowItem. The pair-selection algorithm works in IDs;
  // we resolve to full items only at render time.
  const itemById = useMemo<Map<ItemId, SlideshowItem>>(
    () => new Map(items.map(i => [i.id, i])),
    [items],
  )

  // Whenever the graph or dimension changes (and we're hydrated), pick the next
  // pair to ask. Returns null → this dimension is complete for the active scope.
  useEffect(() => {
    if (!isHydrated || items.length < 2) {
      setCurrentPair(null)
      setIsComplete(items.length >= 2 && isHydrated && false)
      return
    }
    const next = selectNextPair(
      items.map(i => i.id),
      dimensionGraphs.winsGraph,
      dimensionGraphs.equalsGraph,
      { recentItems },
    )
    if (next === null) {
      setCurrentPair(null)
      setIsComplete(true)
    } else {
      setCurrentPair(next)
      setIsComplete(false)
    }
  }, [isHydrated, items, dimensionGraphs, recentItems])

  // Resolve the current pair IDs to full SlideshowItems for rendering.
  const currentPairResolved = useMemo<[SlideshowItem, SlideshowItem] | null>(() => {
    if (!currentPair) return null
    const a = itemById.get(currentPair[0])
    const b = itemById.get(currentPair[1])
    if (!a || !b) return null
    return [a, b]
  }, [currentPair, itemById])

  // Fire-and-forget persistence of one dimension's answer. Local state is the
  // source of truth during the session; the DB write recovers across reopens.
  const persistAnswer = (
    itemAId: ItemId,
    itemBId: ItemId,
    winner: ItemId | 'equal',
    dimension: ComparisonType,
  ): void => {
    const isEqual = winner === 'equal'
    void getDatabase()
      .recordComparison({
        itemAId,
        itemBId,
        winnerId: isEqual ? null : winner,
        isEqual,
        dimension,
      })
      .catch(err => {
        logger.ui.error(
          'Failed to persist comparison',
          { error: String(err), itemAId, itemBId, dimension },
          'task-slideshow-persist',
        )
      })
  }

  // Apply one answer for the active dimension, persist it, update local graph,
  // and let the selectNextPair effect pick the next matchup.
  const handleComparison = (winner: ItemId | 'equal') => {
    if (!currentPair) return
    const [aId, bId] = currentPair
    const loser = winner !== 'equal' ? (winner === aId ? bId : aId) : null

    // Soft cycle warning (doesn't block the answer — the user may want to fix it).
    if (winner !== 'equal' && loser) {
      const winsGraph = activeDimension === ComparisonType.Priority ? graph.priorityWins : graph.urgencyWins
      if (detectCycle(winsGraph, winner, loser)) {
        Message.warning(
          `Inconsistency detected: this creates a circular ${activeDimension} relationship — ` +
          `${winner} now beats ${loser}, but the graph already has a path from ${loser} to ${winner}.`,
        )
      }
    }

    persistAnswer(aId, bId, winner, activeDimension)

    // Merge the answer into the local ComparisonResult[] (the bridge to buildComparisonGraph).
    const existing = comparisons.find(c =>
      (c.itemA === aId && c.itemB === bId) || (c.itemA === bId && c.itemB === aId),
    )
    const fieldKey = activeDimension === ComparisonType.Priority ? 'higherPriority' : 'higherUrgency'
    let newComparisons: ComparisonResult[]
    if (existing) {
      newComparisons = comparisons.map(c =>
        c === existing ? { ...c, [fieldKey]: winner } : c,
      )
    } else {
      newComparisons = [...comparisons, {
        itemA: aId,
        itemB: bId,
        higherPriority: activeDimension === ComparisonType.Priority ? winner : null,
        higherUrgency: activeDimension === ComparisonType.Urgency ? winner : null,
        timestamp: Date.now(),
      }]
    }
    setComparisons(newComparisons)

    // Track recent items for anti-anchor (most recent at the end).
    setRecentItems(prev => {
      const next = [...prev, aId, bId]
      return next.slice(-RECENT_ITEMS_WINDOW)
    })
  }

  // Keyboard shortcuts: 1/2/= answer the current pair; Esc closes the modal.
  // (No prev/next navigation — pair selection is now one-at-a-time.)
  useEffect(() => {
    if (!visible) return
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!currentPair) {
        if (e.key === 'Escape') onClose()
        return
      }
      if (e.key === '1') handleComparison(currentPair[0])
      else if (e.key === '2') handleComparison(currentPair[1])
      else if (e.key === '=') handleComparison('equal')
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [visible, currentPair, activeDimension, comparisons])

  // Apply the computed rankings to the database
  const applyRankings = async () => {
    const itemsToUse = items
    const itemIds = itemsToUse.map(item => item.id)

    // Get sorted items using topological sort
    const prioritySorted = topologicalSort(itemIds, graph.priorityWins) || itemIds
    const urgencySorted = topologicalSort(itemIds, graph.urgencyWins) || itemIds

    // Convert to 1-10 rankings
    const priorityRankings = mapToRankings(prioritySorted)
    const urgencyRankings = mapToRankings(urgencySorted)

    // Create maps for easy lookup
    const priorityScores = new Map<ItemId, number>()
    const urgencyScores = new Map<ItemId, number>()

    priorityRankings.forEach(ranking => {
      priorityScores.set(ranking.id, ranking.score)
    })
    urgencyRankings.forEach(ranking => {
      urgencyScores.set(ranking.id, ranking.score)
    })

    // Update each task/workflow with new rankings
    let updateCount = 0
    const { updateTask, updateSequencedTask } = useTaskStore.getState()

    for (const item of itemsToUse) {
      const importance = priorityScores.get(item.id) || 5
      const urgency = urgencyScores.get(item.id) || 5

      try {
        if (item.type === EntityType.Task) {
          await updateTask(item.id, { importance, urgency })
          updateCount++
        } else if (item.type === EntityType.Workflow) {
          await updateSequencedTask(item.id, { importance, urgency })
          updateCount++
        }
      } catch (error) {
        console.error(`Failed to update ${item.id}:`, error)
      }
    }

    Message.success(`Updated ${updateCount} items with new importance and urgency rankings!`)

    // Close the modal after applying
    onClose()
  }

  // Reset function: clear LOCAL state and persisted DB rows for both dimensions.
  // Fire-and-forget the DB deletes; UI is reactive immediately.
  const resetComparisons = () => {
    setComparisons([])
    setCurrentPair(null)
    setRecentItems([])
    setIsComplete(false)
    const db = getDatabase()
    void Promise.all([
      db.clearComparisonDimension(ComparisonType.Priority),
      db.clearComparisonDimension(ComparisonType.Urgency),
    ]).catch(err => {
      logger.ui.error('Failed to clear persisted comparisons', { error: String(err) }, 'task-slideshow-clear')
    })
    Message.info('All comparisons cleared. Starting fresh!')
  }

  // Pre-select a default dimension when the modal opens: pick whichever
  // dimension has more unresolved pairs so the user is shown useful work first.
  useEffect(() => {
    if (!visible || !isHydrated || items.length < 2) return
    const itemIds = items.map(i => i.id)
    const priorityState = getTournamentState(itemIds, graph.priorityWins, graph.priorityEquals)
    const urgencyState = getTournamentState(itemIds, graph.urgencyWins, graph.urgencyEquals)
    const priorityUnknowns = priorityState.totalPairs - priorityState.knownPairs
    const urgencyUnknowns = urgencyState.totalPairs - urgencyState.knownPairs
    // Default to importance (priority) on ties; switch to urgency only if it
    // has strictly more unknowns and the modal just opened (no prior choice).
    if (urgencyUnknowns > priorityUnknowns) {
      setActiveDimension(ComparisonType.Urgency)
    }
    // Note: we only run this when the modal first opens with a fresh hydration;
    // subsequent dimension switches are user-driven, not auto-picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, isHydrated])

  const sprintScopeToggle = (
    <Space size={12}>
      <Space size={4}>
        <Text style={{ fontSize: 13 }}>Sprint only</Text>
        <Switch
          size="small"
          checked={sprintOnly}
          onChange={handleSprintToggle}
        />
      </Space>
      <Tag color="gray">{items.length} items</Tag>
    </Space>
  )

  if (items.length === 0) {
    return (
      <Modal
        title={<Space style={{ width: '100%', justifyContent: 'space-between' }}><span>Task & Workflow Comparison</span>{sprintScopeToggle}</Space>}
        visible={visible}
        onCancel={onClose}
        footer={null}
        style={{ width: 800 }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">{sprintOnly ? 'No sprint tasks to compare' : 'No tasks or workflows to display'}</Text>
        </div>
      </Modal>
    )
  }

  if (items.length < 2) {
    return (
      <Modal
        title={<Space style={{ width: '100%', justifyContent: 'space-between' }}><span>Task & Workflow Comparison</span>{sprintScopeToggle}</Space>}
        visible={visible}
        onCancel={onClose}
        footer={null}
        style={{ width: 800 }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">{sprintOnly ? 'Need at least 2 sprint items to compare' : 'Need at least 2 items to compare'}</Text>
        </div>
      </Modal>
    )
  }

  // Type guards for better type safety
  const isRegularTask = (data: Task | SequencedTask): data is Task => {
    return 'importance' in data && 'urgency' in data
  }

  // Show completion view with graphs when:
  //   - both dimensions fully resolved, OR
  //   - active dimension is fully resolved and the user has made any comparisons.
  // (The completion view applies BOTH dimensions, so partial answers in either
  //  are still useful — but we only auto-show it when the active dim is done.)
  const showCompletionView = isComplete && comparisons.length > 0
  if (showCompletionView) {
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
            <Button
              type="primary"
              onClick={applyRankings}
              icon={<IconCheck />}
              size="large"
            >
              Apply Rankings to Database
            </Button>
            <Button onClick={resetComparisons}>
              Start New Comparison Session
            </Button>
            <Button onClick={onClose}>
              Close Without Applying
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

          {/* Final Bracket Visualizations — one per dimension */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <Title heading={6} style={{ marginBottom: 8, textAlign: 'center' }}>
                Importance Bracket
              </Title>
              <TournamentBracket
                items={items.map(i => ({
                  id: i.id,
                  title: isRegularTask(i.data) ? (i.data as Task).name : (i.data as SequencedTask).name,
                }))}
                winsGraph={graph.priorityWins}
                equalsGraph={graph.priorityEquals}
                width={isCompact ? 700 : 1100}
                height={300}
              />
            </div>
            <div>
              <Title heading={6} style={{ marginBottom: 8, textAlign: 'center' }}>
                Urgency Bracket
              </Title>
              <TournamentBracket
                items={items.map(i => ({
                  id: i.id,
                  title: isRegularTask(i.data) ? (i.data as Task).name : (i.data as SequencedTask).name,
                }))}
                winsGraph={graph.urgencyWins}
                equalsGraph={graph.urgencyEquals}
                width={isCompact ? 700 : 1100}
                height={300}
              />
            </div>
          </div>
        </Space>
      </Modal>
    )
  }

  // No current pair AND no comparisons yet → just-opened-with-no-data state.
  if (!currentPairResolved && comparisons.length === 0) {
    return (
      <Modal
        title="Task & Workflow Comparison"
        visible={visible}
        onCancel={onClose}
        footer={null}
        style={{ width: 800 }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Text type="secondary">{isHydrated ? 'No items to compare' : 'Loading…'}</Text>
        </div>
      </Modal>
    )
  }

  // No current pair BUT comparisons exist → active dimension fully resolved.
  // Soft-landing screen: switch dimension or finalize.
  if (!currentPairResolved) {
    const otherDimension = activeDimension === ComparisonType.Priority
      ? ComparisonType.Urgency
      : ComparisonType.Priority
    return (
      <Modal
        title={
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <span>Task & Workflow Comparison</span>
            <Tag color="green">{activeDimension === ComparisonType.Priority ? 'Importance' : 'Urgency'} ranking complete</Tag>
          </Space>
        }
        visible={visible}
        onCancel={onClose}
        footer={
          <Space style={{ width: '100%', justifyContent: 'center' }}>
            <Button onClick={() => setActiveDimension(otherDimension)}>
              {`Continue with ${otherDimension === ComparisonType.Priority ? 'Importance' : 'Urgency'}`}
            </Button>
            <Button type="primary" icon={<IconCheck />} onClick={applyRankings}>
              Apply Rankings to Database
            </Button>
            <Button onClick={resetComparisons}>Start Over</Button>
            <Button onClick={onClose}>Close</Button>
          </Space>
        }
        style={{
          width: isCompact ? '98vw' : isMobile ? '95vw' : 1200,
          maxWidth: isCompact ? '98vw' : isMobile ? '95vw' : '90vw',
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Card style={{ background: '#f6ffed' }}>
            <Title heading={5} style={{ margin: 0 }}>
              All {activeDimension === ComparisonType.Priority ? 'importance' : 'urgency'} relationships resolved
            </Title>
            <Text type="secondary">
              {`Switch to ${otherDimension === ComparisonType.Priority ? 'importance' : 'urgency'} to rank in that dimension too, or apply the rankings now.`}
            </Text>
          </Card>
          <TournamentBracket
            items={items.map(i => ({ id: i.id, title: isRegularTask(i.data) ? (i.data as Task).name : (i.data as SequencedTask).name }))}
            winsGraph={dimensionGraphs.winsGraph}
            equalsGraph={dimensionGraphs.equalsGraph}
            width={isCompact ? 700 : 1100}
            height={400}
          />
        </Space>
      </Modal>
    )
  }

  const [itemA, itemB] = currentPairResolved
  const currentComparison = comparisons.find(c =>
    (c.itemA === itemA.id && c.itemB === itemB.id) ||
    (c.itemA === itemB.id && c.itemB === itemA.id),
  )
  const fieldKey = activeDimension === ComparisonType.Priority ? 'higherPriority' : 'higherUrgency'
  const activeAnswer: ItemId | 'equal' | null = currentComparison?.[fieldKey] ?? null
  const itemIdsForState = items.map(i => i.id)
  const dimensionState = getTournamentState(itemIdsForState, dimensionGraphs.winsGraph, dimensionGraphs.equalsGraph)
  const progressPct = dimensionState.totalPairs === 0 ? 0 : Math.round(100 * dimensionState.knownPairs / dimensionState.totalPairs)

  return (
    <Modal
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <span>Task & Workflow Comparison</span>
          <Space size={12}>
            {sprintScopeToggle}
            <Radio.Group
              type="button"
              size="small"
              value={activeDimension}
              onChange={(v) => setActiveDimension(v as ComparisonType)}
            >
              <Radio value={ComparisonType.Priority}>Importance</Radio>
              <Radio value={ComparisonType.Urgency}>Urgency</Radio>
            </Radio.Group>
            <Tag color="blue">{`${dimensionState.knownPairs}/${dimensionState.totalPairs} · ${progressPct}%`}</Tag>
          </Space>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Button onClick={resetComparisons}>Start Over</Button>
          <Text type="secondary">Press 1, 2, or = for equal</Text>
          <Button type="primary" icon={<IconCheck />} onClick={applyRankings}>
            Apply Rankings
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
            Which item has higher {activeDimension === ComparisonType.Priority ? 'IMPORTANCE' : 'URGENCY'}?
          </Title>
          <Text type="secondary">
            {activeDimension === ComparisonType.Priority
              ? 'Importance = The intrinsic value, impact, or significance of this item'
              : 'Urgency = How time-sensitive is this item?'}
          </Text>
          {activeAnswer !== null && (
            <div style={{ marginTop: 12 }}>
              <Tag color="green">Answered (you can change your mind)</Tag>
            </div>
          )}
        </Card>

        {/* Tournament Bracket — visual progress for the active dimension */}
        {comparisons.length > 0 && (
          <TournamentBracket
            items={items.map(i => ({
              id: i.id,
              title: isRegularTask(i.data) ? (i.data as Task).name : (i.data as SequencedTask).name,
            }))}
            winsGraph={dimensionGraphs.winsGraph}
            equalsGraph={dimensionGraphs.equalsGraph}
            currentPair={currentPair}
            width={isCompact ? 700 : 1100}
            height={isCompact ? 260 : 360}
          />
        )}

        {/* Items Comparison */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
          {/* Item A */}
          <div style={{ flex: 1 }}>
            <Button
              type={activeAnswer === itemA.id ? 'primary' : 'default'}
              onClick={() => handleComparison(itemA.id)}
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
              type={activeAnswer === itemB.id ? 'primary' : 'default'}
              onClick={() => handleComparison(itemB.id)}
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
            type={activeAnswer === 'equal' ? 'primary' : 'default'}
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
            Results saved automatically — reopen any time to resume
          </Text>
        </Card>
      </Space>
    </Modal>
  )
}
