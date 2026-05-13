/**
 * RankingView — Full-page ranking flow.
 *
 * Single integrated UI (no popups):
 *   - Top toolbar (dimension switcher, progress, sprint scope).
 *   - Matchup card with the two contenders, inline (no modal).
 *   - Forward/Back arrows to navigate the matchup history.
 *   - Tournament bracket below, visible at all times, with the current
 *     matchup highlighted in orange.
 *   - Bottom toolbar (Start Over, Apply Rankings).
 *
 * Flow:
 *   1. Start screen: explicit "Rank by Importance" vs "Rank by Urgency".
 *      Optional "seed from current scores" produces ~n/2 first-round pairs.
 *   2. First matchup auto-appears. User picks 1 / 2 / = → auto-advance.
 *   3. Back/Forward navigate the history; Forward at the end fetches a
 *      new pair (from the seed queue, then from selectNextPair).
 *   4. Apply Rankings derives 1–10 scores and writes back to tasks.
 */

import { useState, useEffect, useMemo } from 'react'
import { Button, Space, Typography, Tag, Card, Switch } from '@arco-design/web-react'
import {
  IconCheck,
  IconLeft,
  IconRight,
  IconRefresh,
  IconClockCircle,
} from '@arco-design/web-react/icon'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { useTaskStore } from '../../store/useTaskStore'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { EntityType } from '@shared/enums'
import { ComparisonType } from '@/shared/constants'
import { getDatabase } from '../../services/database'
import type { PersistedComparison } from '../../services/database-trpc'
import { Message } from '../common/Message'
import { logger } from '@/logger'
import {
  buildComparisonGraph,
  selectNextPair,
  topologicalSort,
  mapToRankings,
  getTournamentState,
  hasTransitiveRelationship,
  type ComparisonResult,
  type ComparisonGraph,
  type ItemId,
} from '../../utils/comparison-graph'
import { TournamentBracket } from '../slideshow/TournamentBracket'

const { Title, Text, Paragraph } = Typography

const RECENT_ITEMS_WINDOW = 6

type RankingItem = {
  id: ItemId
  type: EntityType.Task | EntityType.Workflow
  data: Task | SequencedTask
}

function itemTitle(item: RankingItem): string {
  return item.data.name
}

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
    if (row.dimension === ComparisonType.Priority) entry.higherPriority = value
    else if (row.dimension === ComparisonType.Urgency) entry.higherUrgency = value
  }
  return Array.from(byPair.values())
}

interface RankingViewProps {
  onClose: () => void
}

export function RankingView({ onClose }: RankingViewProps) {
  const { tasks, sequencedTasks } = useTaskStore()
  const { isCompact } = useResponsive()

  // null = start screen
  const [activeDimension, setActiveDimension] = useState<ComparisonType | null>(null)
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [sprintOnly, setSprintOnly] = useState(false)
  const [seedFromScores, setSeedFromScores] = useState(true)
  // Pending matchups queued up by seeding. Consumed by handleNext.
  const [seedQueue, setSeedQueue] = useState<Array<[ItemId, ItemId]>>([])
  // Chronological list of matchups the user has seen, plus the current
  // pointer. Back/Forward navigate this list. Picking an answer at the end
  // of history appends the next matchup; in the middle it just advances.
  const [history, setHistory] = useState<Array<[ItemId, ItemId]>>([])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [recentItems, setRecentItems] = useState<ItemId[]>([])
  const [seedNotice, setSeedNotice] = useState<string | null>(null)

  // Filtered items (exclude completed/archived; optionally restrict to sprint).
  const items = useMemo<RankingItem[]>(() => {
    const workflowIds = new Set(sequencedTasks.map(w => w.id))
    const taskItems: RankingItem[] = tasks
      .filter(t => !t.archived && !t.completed && !workflowIds.has(t.id))
      .filter(t => !sprintOnly || t.inActiveSprint)
      .map(task => ({ id: task.id, type: EntityType.Task, data: task }))
    const workflowItems: RankingItem[] = sequencedTasks
      .filter(w => !w.archived && !w.completed)
      .filter(w => !sprintOnly || w.inActiveSprint)
      .map(workflow => ({ id: workflow.id, type: EntityType.Workflow, data: workflow }))
    return [...taskItems, ...workflowItems]
  }, [tasks, sequencedTasks, sprintOnly])

  const itemById = useMemo<Map<ItemId, RankingItem>>(
    () => new Map(items.map(i => [i.id, i])),
    [items],
  )

  // Hydrate persisted comparisons on mount + scope change.
  useEffect(() => {
    if (isHydrated || items.length === 0) return
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
        logger.ui.error('Failed to hydrate persisted comparisons', { error: String(err) }, 'ranking-view-hydrate')
        setIsHydrated(true)
      })
    return () => { cancelled = true }
  }, [isHydrated, items])

  const graph = useMemo(() => buildComparisonGraph(comparisons), [comparisons])

  const dimensionGraphs = useMemo(() => {
    if (activeDimension === ComparisonType.Urgency) {
      return { winsGraph: graph.urgencyWins, equalsGraph: graph.urgencyEquals }
    }
    return { winsGraph: graph.priorityWins, equalsGraph: graph.priorityEquals }
  }, [graph, activeDimension])

  const state = useMemo(() => {
    if (!activeDimension) return null
    return getTournamentState(items.map(i => i.id), dimensionGraphs.winsGraph, dimensionGraphs.equalsGraph)
  }, [activeDimension, items, dimensionGraphs])

  const currentMatchup: [ItemId, ItemId] | null = history[historyIndex] ?? null

  function getScore(item: RankingItem, dim: ComparisonType): number {
    if (dim === ComparisonType.Priority) return (item.data as Task).importance ?? 5
    return (item.data as Task).urgency ?? 5
  }

  // Resolve a pair of IDs to full RankingItems, validating both still exist.
  const resolvedPair = useMemo<[RankingItem, RankingItem] | null>(() => {
    if (!currentMatchup) return null
    const a = itemById.get(currentMatchup[0])
    const b = itemById.get(currentMatchup[1])
    if (!a || !b) return null
    return [a, b]
  }, [currentMatchup, itemById])

  // Read the current answer (if any) for the active dimension.
  const currentAnswer: ItemId | 'equal' | null = useMemo(() => {
    if (!currentMatchup || !activeDimension) return null
    const [aId, bId] = currentMatchup
    const existing = comparisons.find(c =>
      (c.itemA === aId && c.itemB === bId) || (c.itemA === bId && c.itemB === aId),
    )
    if (!existing) return null
    return activeDimension === ComparisonType.Priority ? existing.higherPriority : existing.higherUrgency
  }, [currentMatchup, activeDimension, comparisons])

  // Seed queue generation: sort by current score in the dimension, pair
  // adjacent, skip pairs already known transitively. ~n/2 matchups.
  function generateSeedQueue(dim: ComparisonType, currentGraph: ComparisonGraph): Array<[ItemId, ItemId]> {
    if (items.length < 2) return []
    const sorted = [...items].sort((a, b) => getScore(b, dim) - getScore(a, dim))
    const winsGraph = dim === ComparisonType.Priority ? currentGraph.priorityWins : currentGraph.urgencyWins
    const equalsGraph = dim === ComparisonType.Priority ? currentGraph.priorityEquals : currentGraph.urgencyEquals
    const queue: Array<[ItemId, ItemId]> = []
    for (let i = 0; i + 1 < sorted.length; i += 2) {
      const a = sorted[i]!.id
      const b = sorted[i + 1]!.id
      if (hasTransitiveRelationship(winsGraph, equalsGraph, a, b) === 'unknown') {
        queue.push([a, b])
      }
    }
    return queue
  }

  // Pick the next pair to show: dequeue from seedQueue, dropping entries that
  // became known transitively; if queue exhausted, fall back to selectNextPair.
  function nextPairAfter(
    queue: Array<[ItemId, ItemId]>,
    nextComparisons: ComparisonResult[],
    dim: ComparisonType,
    recent: ItemId[],
  ): { next: [ItemId, ItemId] | null; remainingQueue: Array<[ItemId, ItemId]> } {
    const newGraph = buildComparisonGraph(nextComparisons)
    const winsGraph = dim === ComparisonType.Priority ? newGraph.priorityWins : newGraph.urgencyWins
    const equalsGraph = dim === ComparisonType.Priority ? newGraph.priorityEquals : newGraph.urgencyEquals
    // Filter the queue down to still-unknown pairs.
    const filtered = queue.filter(([a, b]) => hasTransitiveRelationship(winsGraph, equalsGraph, a, b) === 'unknown')
    if (filtered.length > 0) {
      const [head, ...rest] = filtered
      return { next: head!, remainingQueue: rest }
    }
    const algorithmPair = selectNextPair(items.map(i => i.id), winsGraph, equalsGraph, { recentItems: recent })
    return { next: algorithmPair, remainingQueue: [] }
  }

  const handleStartDimension = (dim: ComparisonType) => {
    setActiveDimension(dim)
    setSeedNotice(null)
    setRecentItems([])
    setHistoryIndex(0)

    const currentGraph = buildComparisonGraph(comparisons)
    let queue: Array<[ItemId, ItemId]> = []
    if (seedFromScores) {
      queue = generateSeedQueue(dim, currentGraph)
      if (queue.length > 0) {
        setSeedNotice(`Round 1: ${queue.length} matchup${queue.length === 1 ? '' : 's'} from current scores. Use the arrows to navigate, or click an item to answer.`)
      }
    }

    const { next, remainingQueue } = nextPairAfter(queue, comparisons, dim, [])
    setSeedQueue(remainingQueue)
    setHistory(next ? [next] : [])
  }

  // Record an answer and (if at end of history) advance to a new matchup.
  // If the user is in the middle of history (reviewing), just advance the
  // index — they're moving forward through their already-asked questions.
  const handlePick = (winner: ItemId | 'equal') => {
    if (!currentMatchup || !activeDimension) return
    const [aId, bId] = currentMatchup
    const isEqual = winner === 'equal'

    void getDatabase()
      .recordComparison({
        itemAId: aId,
        itemBId: bId,
        winnerId: isEqual ? null : winner,
        isEqual,
        dimension: activeDimension,
      })
      .catch(err => logger.ui.error('Failed to persist comparison', { error: String(err) }, 'ranking-record'))

    // Update local comparisons.
    const existing = comparisons.find(c =>
      (c.itemA === aId && c.itemB === bId) || (c.itemA === bId && c.itemB === aId),
    )
    const fieldKey = activeDimension === ComparisonType.Priority ? 'higherPriority' : 'higherUrgency'
    const nextComparisons: ComparisonResult[] = existing
      ? comparisons.map(c => c === existing ? { ...c, [fieldKey]: winner } : c)
      : [...comparisons, {
          itemA: aId,
          itemB: bId,
          higherPriority: activeDimension === ComparisonType.Priority ? winner : null,
          higherUrgency: activeDimension === ComparisonType.Urgency ? winner : null,
          timestamp: Date.now(),
        }]
    setComparisons(nextComparisons)
    const newRecent = [...recentItems, aId, bId].slice(-RECENT_ITEMS_WINDOW)
    setRecentItems(newRecent)

    // If at the end of history, fetch the next matchup. Otherwise just step.
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      return
    }
    const { next, remainingQueue } = nextPairAfter(seedQueue, nextComparisons, activeDimension, newRecent)
    setSeedQueue(remainingQueue)
    if (next === null) {
      Message.success(`${activeDimension === ComparisonType.Priority ? 'Importance' : 'Urgency'} ranking complete!`)
      return
    }
    // Avoid duplicate consecutive entries.
    setHistory(prev => {
      const last = prev[prev.length - 1]
      if (last && last[0] === next[0] && last[1] === next[1]) return prev
      return [...prev, next]
    })
    setHistoryIndex(idx => idx + 1)
  }

  const canGoBack = historyIndex > 0
  const handleBack = () => { if (canGoBack) setHistoryIndex(historyIndex - 1) }

  // Forward: step within history, or fetch a fresh pair if we're at the end.
  const handleForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      return
    }
    if (!activeDimension) return
    const { next, remainingQueue } = nextPairAfter(seedQueue, comparisons, activeDimension, recentItems)
    setSeedQueue(remainingQueue)
    if (next === null) {
      Message.info('No more matchups need answering. Apply rankings or change dimension.')
      return
    }
    setHistory(prev => {
      const last = prev[prev.length - 1]
      if (last && last[0] === next[0] && last[1] === next[1]) return prev
      return [...prev, next]
    })
    setHistoryIndex(history.length) // points to the just-appended entry
  }

  const handleReset = () => {
    setComparisons([])
    setHistory([])
    setHistoryIndex(0)
    setSeedQueue([])
    setRecentItems([])
    const db = getDatabase()
    void Promise.all([
      db.clearComparisonDimension(ComparisonType.Priority),
      db.clearComparisonDimension(ComparisonType.Urgency),
    ]).catch(err => logger.ui.error('Failed to clear persisted comparisons', { error: String(err) }, 'ranking-clear'))
    setActiveDimension(null)
    Message.info('All comparisons cleared. Pick a dimension to start fresh.')
  }

  const applyRankings = async () => {
    const itemIds = items.map(i => i.id)
    const prioritySorted = topologicalSort(itemIds, graph.priorityWins) || itemIds
    const urgencySorted = topologicalSort(itemIds, graph.urgencyWins) || itemIds
    const priorityScores = new Map(mapToRankings(prioritySorted).map(r => [r.id, r.score]))
    const urgencyScores = new Map(mapToRankings(urgencySorted).map(r => [r.id, r.score]))

    let updateCount = 0
    const { updateTask, updateSequencedTask } = useTaskStore.getState()
    for (const item of items) {
      const importance = priorityScores.get(item.id) ?? 5
      const urgency = urgencyScores.get(item.id) ?? 5
      try {
        if (item.type === EntityType.Task) {
          await updateTask(item.id, { importance, urgency })
        } else {
          await updateSequencedTask(item.id, { importance, urgency })
        }
        updateCount++
      } catch (error) {
        logger.ui.error('Failed to update task ranking', { id: item.id, error: String(error) }, 'ranking-apply')
      }
    }
    Message.success(`Updated ${updateCount} items with new importance and urgency rankings`)
    onClose()
  }

  // Keyboard shortcuts on the main view.
  useEffect(() => {
    if (!activeDimension || !resolvedPair) return
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs.
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.key === '1') handlePick(resolvedPair[0].id)
      else if (e.key === '2') handlePick(resolvedPair[1].id)
      else if (e.key === '=') handlePick('equal')
      else if (e.key === 'ArrowLeft') handleBack()
      else if (e.key === 'ArrowRight') handleForward()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeDimension, resolvedPair, historyIndex, history, seedQueue, comparisons, recentItems])

  // ─────────────────────────────────────────────────────────────────
  // Render: Start screen
  // ─────────────────────────────────────────────────────────────────
  if (activeDimension === null) {
    return (
      <div
        style={{
          height: '100%',
          width: '100%',
          background: 'linear-gradient(180deg, #F7F8FA 0%, #EFF3F8 100%)',
          overflow: 'auto',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            maxWidth: 880,
            width: '100%',
            padding: isCompact ? '24px 16px' : '48px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: isCompact ? 20 : 28,
          }}
        >
          <div>
            <Button
              size="small"
              icon={<IconLeft />}
              onClick={onClose}
              type="text"
              style={{ marginBottom: 12, marginLeft: -8 }}
            >
              Back
            </Button>
            <Title heading={isCompact ? 4 : 3} style={{ marginTop: 0, marginBottom: 8 }}>
              Rank your tasks
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: isCompact ? 13 : 14 }}>
              Compare items pairwise to build a ranking. Pick which dimension to rank below —
              you can switch later, but only one at a time. Your answers save automatically.
            </Paragraph>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Space size={6}>
              <Text style={{ fontSize: 13, color: '#86909C' }}>Scope:</Text>
              <Switch
                size="small"
                checked={sprintOnly}
                onChange={(checked) => {
                  setSprintOnly(checked)
                  setIsHydrated(false)
                  setComparisons([])
                }}
              />
              <Text style={{ fontSize: 13 }}>{sprintOnly ? 'Sprint only' : 'All active items'}</Text>
              <Tag color="gray" size="small">{items.length} items</Tag>
            </Space>
            <Space size={6} align="start">
              <Switch size="small" checked={seedFromScores} onChange={setSeedFromScores} />
              <div>
                <Text style={{ fontSize: 13 }}>Seed first-round matchups from current scores</Text>
                <div style={{ fontSize: 12, color: '#86909C', lineHeight: 1.4, maxWidth: 540 }}>
                  Sorts items by their current importance/urgency and pairs adjacent —
                  about <strong>n/2</strong> matchups for n items. The algorithm picks
                  follow-up pairs after that.
                </div>
              </div>
            </Space>
          </div>

          {items.length < 2 ? (
            <Card style={{ textAlign: 'center', padding: 24 }}>
              <Text type="secondary">
                {sprintOnly
                  ? 'Need at least 2 sprint items to rank. Add items to the sprint or toggle this off.'
                  : 'Need at least 2 tasks or workflows to rank.'}
              </Text>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isCompact ? '1fr' : 'repeat(2, 1fr)',
                gap: 16,
              }}
            >
              <DimensionCard
                title="Rank by Importance"
                description={'Intrinsic value, impact, or significance. "If I could only do one thing today, which has the bigger payoff?"'}
                icon="⭐"
                iconBg="#E8F3FF"
                hoverColor="#3491FA"
                onClick={() => handleStartDimension(ComparisonType.Priority)}
              />
              <DimensionCard
                title="Rank by Urgency"
                description={"Time pressure. \"Which one will become a problem if I don't do it soon?\""}
                icon="⏰"
                iconBg="#FFF1E8"
                hoverColor="#F77234"
                onClick={() => handleStartDimension(ComparisonType.Urgency)}
              />
            </div>
          )}

          {comparisons.length > 0 && (
            <div
              style={{
                padding: 16,
                background: '#FFFBE6',
                border: '1px solid #FFE58F',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <Text style={{ fontWeight: 600 }}>Resume your last session</Text>
                <div style={{ fontSize: 13, color: '#86909C', marginTop: 2 }}>
                  You have {comparisons.length} saved comparisons.
                </div>
              </div>
              <Space>
                <Button type="primary" icon={<IconCheck />} onClick={applyRankings}>
                  Apply Rankings
                </Button>
                <Button icon={<IconRefresh />} onClick={handleReset}>
                  Start Over
                </Button>
              </Space>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // Render: Main matchup + bracket view
  // ─────────────────────────────────────────────────────────────────
  const dimensionLabel = activeDimension === ComparisonType.Priority ? 'Importance' : 'Urgency'
  const progressPct = state && state.totalPairs > 0 ? Math.round(100 * state.knownPairs / state.totalPairs) : 0

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#F7F8FA',
      }}
    >
      {/* Top toolbar */}
      <div
        style={{
          flexShrink: 0,
          padding: isCompact ? '10px 12px' : '12px 20px',
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E6EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Space size={isCompact ? 6 : 12} wrap>
          <Button
            size={isCompact ? 'mini' : 'small'}
            icon={<IconLeft />}
            onClick={() => setActiveDimension(null)}
            type="text"
          >
            {isCompact ? '' : 'Change dimension'}
          </Button>
          <Title heading={isCompact ? 6 : 5} style={{ margin: 0 }}>
            Ranking by {dimensionLabel}
          </Title>
          <Tag color="blue" size={isCompact ? 'small' : 'default'}>
            {state ? `${state.knownPairs}/${state.totalPairs}` : '—'}
            {state && state.totalPairs > 0 && ` · ${progressPct}%`}
          </Tag>
          {state?.placed && state.placed.size > 0 && (
            <Tag color="green" size={isCompact ? 'small' : 'default'}>
              {state.placed.size} placed
            </Tag>
          )}
        </Space>
        <Space size={6} wrap>
          <Text style={{ fontSize: 12, color: '#86909C' }}>Sprint only</Text>
          <Switch
            size="small"
            checked={sprintOnly}
            onChange={(checked) => {
              setSprintOnly(checked)
              setIsHydrated(false)
              setComparisons([])
              setHistory([])
              setHistoryIndex(0)
              setSeedQueue([])
            }}
          />
          <Tag size={isCompact ? 'small' : 'default'} color="gray">{items.length} items</Tag>
        </Space>
      </div>

      {seedNotice && (
        <div
          style={{
            flexShrink: 0,
            padding: '6px 20px',
            background: '#FFFBE6',
            borderBottom: '1px solid #FFE58F',
            color: '#7C5400',
            fontSize: 12,
            lineHeight: 1.4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{seedNotice}</span>
          <Button size="mini" type="text" onClick={() => setSeedNotice(null)}>Dismiss</Button>
        </div>
      )}

      {/* Matchup panel (inline, no popup) */}
      <div
        style={{
          flexShrink: 0,
          padding: isCompact ? '12px' : '16px 20px',
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E6EB',
        }}
      >
        {resolvedPair ? (
          <MatchupPanel
            pair={resolvedPair}
            currentAnswer={currentAnswer}
            dimension={activeDimension}
            historyIndex={historyIndex}
            historyLength={history.length}
            canGoBack={canGoBack}
            onPick={handlePick}
            onBack={handleBack}
            onForward={handleForward}
            isCompact={isCompact}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 16 }}>
            <Text type="secondary">
              {state?.isComplete
                ? `${dimensionLabel} ranking is complete. Apply rankings or change dimension.`
                : 'No matchups available. Try toggling sprint scope or starting over.'}
            </Text>
          </div>
        )}
      </div>

      {/* Bracket fills the rest */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#FAFBFC' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <TournamentBracket
            items={items.map(i => ({ id: i.id, title: itemTitle(i) }))}
            winsGraph={dimensionGraphs.winsGraph}
            equalsGraph={dimensionGraphs.equalsGraph}
            currentPair={currentMatchup}
            width="100%"
            height="100%"
          />
        </div>
      </div>

      {/* Bottom action bar */}
      <div
        style={{
          flexShrink: 0,
          padding: isCompact ? '10px 12px' : '12px 20px',
          background: '#FFFFFF',
          borderTop: '1px solid #E5E6EB',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Button size={isCompact ? 'small' : 'default'} icon={<IconRefresh />} onClick={handleReset}>
          Start Over
        </Button>
        <Button
          size={isCompact ? 'small' : 'default'}
          type="primary"
          icon={<IconCheck />}
          onClick={applyRankings}
          disabled={comparisons.length === 0}
        >
          Apply Rankings
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────

interface DimensionCardProps {
  title: string
  description: string
  icon: string
  iconBg: string
  hoverColor: string
  onClick: () => void
}
function DimensionCard({ title, description, icon, iconBg, hoverColor, onClick }: DimensionCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 24,
        background: '#FFFFFF',
        border: '1px solid #E5E6EB',
        borderRadius: 8,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.18s ease',
        font: 'inherit',
        color: 'inherit',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = hoverColor
        e.currentTarget.style.boxShadow = `0 4px 12px ${hoverColor}1F`
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#E5E6EB'
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          {icon}
        </div>
        <Title heading={5} style={{ margin: 0 }}>{title}</Title>
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>{description}</Paragraph>
    </button>
  )
}

interface MatchupPanelProps {
  pair: [RankingItem, RankingItem]
  currentAnswer: ItemId | 'equal' | null
  dimension: ComparisonType
  historyIndex: number
  historyLength: number
  canGoBack: boolean
  onPick: (winner: ItemId | 'equal') => void
  onBack: () => void
  onForward: () => void
  isCompact: boolean
}
function MatchupPanel({
  pair, currentAnswer, dimension, historyIndex, historyLength,
  canGoBack, onPick, onBack, onForward, isCompact,
}: MatchupPanelProps) {
  const [itemA, itemB] = pair
  const isPriority = dimension === ComparisonType.Priority
  const dimLabel = isPriority ? 'IMPORTANCE' : 'URGENCY'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <Title heading={isCompact ? 6 : 5} style={{ margin: 0 }}>
            Which has higher {dimLabel}?
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isPriority
              ? 'Intrinsic value, impact, or significance.'
              : 'How time-sensitive is this item?'}
          </Text>
        </div>
        <Tag color={currentAnswer !== null ? 'green' : 'gray'} size="small">
          Matchup {historyIndex + 1} of {historyLength}
          {currentAnswer !== null && ' · answered'}
        </Tag>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : '1fr auto 1fr',
          gap: 12,
          alignItems: 'stretch',
        }}
      >
        <ItemCard
          item={itemA}
          hotkey="1"
          isWinner={currentAnswer === itemA.id}
          onClick={() => onPick(itemA.id)}
        />
        {!isCompact && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
            <Text style={{ fontSize: 12, color: '#86909C', fontWeight: 600 }}>vs</Text>
          </div>
        )}
        <ItemCard
          item={itemB}
          hotkey="2"
          isWinner={currentAnswer === itemB.id}
          onClick={() => onPick(itemB.id)}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Button
          size={isCompact ? 'small' : 'default'}
          icon={<IconLeft />}
          onClick={onBack}
          disabled={!canGoBack}
        >
          Back
        </Button>
        <Button
          size={isCompact ? 'small' : 'default'}
          type={currentAnswer === 'equal' ? 'primary' : 'default'}
          onClick={() => onPick('equal')}
        >
          = Equal
        </Button>
        <Button
          size={isCompact ? 'small' : 'default'}
          onClick={onForward}
        >
          {historyIndex < historyLength - 1 ? 'Forward' : 'Skip'}
          <IconRight style={{ marginLeft: 4 }} />
        </Button>
      </div>
    </div>
  )
}

interface ItemCardProps {
  item: RankingItem
  hotkey: string
  isWinner: boolean
  onClick: () => void
}
function ItemCard({ item, hotkey, isWinner, onClick }: ItemCardProps) {
  const isTask = item.type === EntityType.Task
  const duration = item.data.duration || 0
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: '12px 14px',
        background: isWinner ? '#E8F3FF' : '#FFFFFF',
        border: `2px solid ${isWinner ? '#3491FA' : '#E5E6EB'}`,
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        font: 'inherit',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onMouseEnter={(e) => {
        if (!isWinner) e.currentTarget.style.borderColor = '#94BFFF'
      }}
      onMouseLeave={(e) => {
        if (!isWinner) e.currentTarget.style.borderColor = '#E5E6EB'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>
          {item.data.name}
        </Text>
        <Tag size="small" color={isTask ? 'arcoblue' : 'purple'}>
          {isTask ? 'Task' : 'Workflow'}
        </Tag>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#86909C' }}>
        <Space size={4}>
          <IconClockCircle style={{ fontSize: 12 }} />
          <span>{duration} min</span>
        </Space>
        <span>·</span>
        <span>Importance {(item.data as Task).importance ?? '—'}/10</span>
        <span>·</span>
        <span>Urgency {(item.data as Task).urgency ?? '—'}/10</span>
      </div>
      {item.data.notes && (
        <div style={{ fontSize: 12, color: '#4E5969', lineHeight: 1.4 }}>
          {item.data.notes.substring(0, 120)}{item.data.notes.length > 120 && '…'}
        </div>
      )}
      <div style={{ marginTop: 4, fontSize: 11, color: isWinner ? '#1D4FAA' : '#86909C' }}>
        {isWinner ? '✓ Selected' : `Press "${hotkey}" or click`}
      </div>
    </button>
  )
}
