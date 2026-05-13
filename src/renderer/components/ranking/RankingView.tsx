/**
 * RankingView — Full-page bracket-first ranking flow.
 *
 * Flow:
 *   1. Start screen: user picks Importance or Urgency. No auto-default.
 *   2. Bracket view: pan/zoom the bracket. Click two nodes to compare them,
 *      or use "Auto-pick next matchup" to let the algorithm choose.
 *   3. MatchupDialog popup: pick winner / equal / cancel.
 *   4. Answers persist to the DB (one row per answer in the chosen dimension).
 *   5. "Apply Rankings" writes derived importance/urgency back to tasks.
 *
 * The user can switch dimensions at any time (via the back button to start),
 * but never answers both dimensions in the same matchup.
 */

import { useState, useEffect, useMemo } from 'react'
import { Button, Space, Typography, Tag, Card, Switch, Message } from '@arco-design/web-react'
import { IconCheck, IconLeft, IconRefresh, IconThunderbolt } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { EntityType } from '@shared/enums'
import { ComparisonType } from '@/shared/constants'
import { getDatabase } from '../../services/database'
import type { PersistedComparison } from '../../services/database-trpc'
import { logger } from '@/logger'
import {
  buildComparisonGraph,
  selectNextPair,
  topologicalSort,
  mapToRankings,
  getTournamentState,
  type ComparisonResult,
  type ItemId,
} from '../../utils/comparison-graph'
import { TournamentBracket } from '../slideshow/TournamentBracket'
import { MatchupDialog, type MatchupItem } from './MatchupDialog'

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

/**
 * Fold persisted DB rows into the UI's ComparisonResult shape (one per pair,
 * with both dimensions). Both dimensions live in the same array because the
 * graph builder reads both — but in this view the user only answers one.
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
    if (row.dimension === ComparisonType.Priority) entry.higherPriority = value
    else if (row.dimension === ComparisonType.Urgency) entry.higherUrgency = value
  }
  return Array.from(byPair.values())
}

interface RankingViewProps {
  /** Called when the user finishes / cancels. The parent navigates away. */
  onClose: () => void
}

export function RankingView({ onClose }: RankingViewProps) {
  const { tasks, sequencedTasks } = useTaskStore()

  // null = start screen (no dimension chosen yet)
  const [activeDimension, setActiveDimension] = useState<ComparisonType | null>(null)
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [sprintOnly, setSprintOnly] = useState(false)
  // Click-to-challenge: first click sets this. Second click opens the matchup.
  const [selectedItem, setSelectedItem] = useState<ItemId | null>(null)
  const [activeMatchup, setActiveMatchup] = useState<[ItemId, ItemId] | null>(null)
  // Anti-anchor window for selectNextPair.
  const [recentItems, setRecentItems] = useState<ItemId[]>([])

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

  // Hydrate persisted comparisons from DB on mount AND when scope changes.
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

  // Active-dimension-specific graphs (used by bracket + algorithm).
  const dimensionGraphs = useMemo(() => {
    if (activeDimension === ComparisonType.Urgency) {
      return { winsGraph: graph.urgencyWins, equalsGraph: graph.urgencyEquals }
    }
    return { winsGraph: graph.priorityWins, equalsGraph: graph.priorityEquals }
  }, [graph, activeDimension])

  // Tournament progress for the active dimension.
  const state = useMemo(() => {
    if (!activeDimension) return null
    return getTournamentState(items.map(i => i.id), dimensionGraphs.winsGraph, dimensionGraphs.equalsGraph)
  }, [activeDimension, items, dimensionGraphs])

  // Persist + record one comparison answer.
  const recordAnswer = (aId: ItemId, bId: ItemId, winner: ItemId | 'equal') => {
    if (!activeDimension) return
    const isEqual = winner === 'equal'
    // Fire-and-forget DB write.
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
    let next: ComparisonResult[]
    if (existing) {
      next = comparisons.map(c => c === existing ? { ...c, [fieldKey]: winner } : c)
    } else {
      next = [...comparisons, {
        itemA: aId,
        itemB: bId,
        higherPriority: activeDimension === ComparisonType.Priority ? winner : null,
        higherUrgency: activeDimension === ComparisonType.Urgency ? winner : null,
        timestamp: Date.now(),
      }]
    }
    setComparisons(next)
    setRecentItems(prev => [...prev, aId, bId].slice(-RECENT_ITEMS_WINDOW))
  }

  // Pick next matchup automatically via the algorithm.
  const handleAutoPickNext = () => {
    if (!activeDimension || items.length < 2) return
    const next = selectNextPair(
      items.map(i => i.id),
      dimensionGraphs.winsGraph,
      dimensionGraphs.equalsGraph,
      { recentItems },
    )
    if (next === null) {
      Message.success(`${activeDimension === ComparisonType.Priority ? 'Importance' : 'Urgency'} ranking is complete!`)
      return
    }
    setActiveMatchup(next)
    setSelectedItem(null)
  }

  // Bracket node click — implements click-to-challenge selection.
  const handleNodeClick = (id: ItemId) => {
    if (selectedItem === null) {
      setSelectedItem(id)
    } else if (selectedItem === id) {
      setSelectedItem(null) // toggle off
    } else {
      setActiveMatchup([selectedItem, id])
      setSelectedItem(null)
    }
  }

  // Matchup dialog handlers.
  const handleMatchupPick = (winner: ItemId | 'equal') => {
    if (!activeMatchup) return
    recordAnswer(activeMatchup[0], activeMatchup[1], winner)
    setActiveMatchup(null)
  }
  const handleMatchupCancel = () => {
    setActiveMatchup(null)
  }

  // Reset both dimensions in DB and clear local state. Used by "Start Over".
  const handleReset = () => {
    setComparisons([])
    setSelectedItem(null)
    setActiveMatchup(null)
    setRecentItems([])
    const db = getDatabase()
    void Promise.all([
      db.clearComparisonDimension(ComparisonType.Priority),
      db.clearComparisonDimension(ComparisonType.Urgency),
    ]).catch(err => logger.ui.error('Failed to clear persisted comparisons', { error: String(err) }, 'ranking-clear'))
    setActiveDimension(null) // back to start screen
    Message.info('All comparisons cleared. Pick a dimension to start fresh.')
  }

  // Apply derived 1-10 rankings back to tasks/workflows.
  const applyRankings = async () => {
    const itemIds = items.map(i => i.id)
    const prioritySorted = topologicalSort(itemIds, graph.priorityWins) || itemIds
    const urgencySorted = topologicalSort(itemIds, graph.urgencyWins) || itemIds
    const priorityRankings = mapToRankings(prioritySorted)
    const urgencyRankings = mapToRankings(urgencySorted)
    const priorityScores = new Map(priorityRankings.map(r => [r.id, r.score]))
    const urgencyScores = new Map(urgencyRankings.map(r => [r.id, r.score]))

    let updateCount = 0
    const { updateTask, updateSequencedTask } = useTaskStore.getState()
    for (const item of items) {
      const importance = priorityScores.get(item.id) ?? 5
      const urgency = urgencyScores.get(item.id) ?? 5
      try {
        if (item.type === EntityType.Task) {
          await updateTask(item.id, { importance, urgency })
          updateCount++
        } else {
          await updateSequencedTask(item.id, { importance, urgency })
          updateCount++
        }
      } catch (error) {
        logger.ui.error('Failed to update task ranking', { id: item.id, error: String(error) }, 'ranking-apply')
      }
    }
    Message.success(`Updated ${updateCount} items with new importance and urgency rankings`)
    onClose()
  }

  // Resolve the active matchup IDs to full item objects for the dialog.
  const matchupItems = useMemo<{ a: MatchupItem | null; b: MatchupItem | null }>(() => {
    if (!activeMatchup) return { a: null, b: null }
    const a = itemById.get(activeMatchup[0]) ?? null
    const b = itemById.get(activeMatchup[1]) ?? null
    return { a, b }
  }, [activeMatchup, itemById])

  const matchupCurrentAnswer = useMemo<ItemId | 'equal' | null>(() => {
    if (!activeMatchup || !activeDimension) return null
    const [aId, bId] = activeMatchup
    const existing = comparisons.find(c =>
      (c.itemA === aId && c.itemB === bId) || (c.itemA === bId && c.itemB === aId),
    )
    if (!existing) return null
    const v = activeDimension === ComparisonType.Priority ? existing.higherPriority : existing.higherUrgency
    return v
  }, [activeMatchup, activeDimension, comparisons])

  // ─────────────────────────────────────────────────────────────────
  // Render: Start screen (no dimension picked yet)
  // ─────────────────────────────────────────────────────────────────
  if (activeDimension === null) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <div style={{ maxWidth: 720, width: '100%' }}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Button size="small" icon={<IconLeft />} onClick={onClose} type="text">Back</Button>
              <Title heading={3} style={{ marginTop: 16, marginBottom: 8 }}>Rank your tasks</Title>
              <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                Compare items pairwise to build a ranking. Pick which dimension to rank below —
                you can switch later, but only one at a time. Your answers are saved automatically.
              </Paragraph>
            </div>

            <Space size={4} style={{ alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 13 }}>Sprint only</Text>
              <Switch size="small" checked={sprintOnly} onChange={(checked) => {
                setSprintOnly(checked)
                setIsHydrated(false)
                setComparisons([])
              }} />
              <Tag color="gray" style={{ marginLeft: 8 }}>{items.length} items</Tag>
            </Space>

            {items.length < 2 ? (
              <Card style={{ textAlign: 'center' }}>
                <Text type="secondary">
                  {sprintOnly
                    ? 'Need at least 2 sprint items to rank. Add items to the sprint or toggle this off.'
                    : 'Need at least 2 tasks or workflows to rank.'}
                </Text>
              </Card>
            ) : (
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Card
                  hoverable
                  style={{ flex: 1, minWidth: 280, cursor: 'pointer' }}
                  onClick={() => setActiveDimension(ComparisonType.Priority)}
                >
                  <Title heading={4} style={{ marginTop: 0 }}>Rank by Importance</Title>
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    Intrinsic value, impact, or significance. &quot;If I could only do one thing today,
                    which has the bigger payoff?&quot;
                  </Paragraph>
                  <Button type="primary" long>Start ranking importance</Button>
                </Card>

                <Card
                  hoverable
                  style={{ flex: 1, minWidth: 280, cursor: 'pointer' }}
                  onClick={() => setActiveDimension(ComparisonType.Urgency)}
                >
                  <Title heading={4} style={{ marginTop: 0 }}>Rank by Urgency</Title>
                  <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                    Time pressure. &quot;Which one will become a problem if I don&apos;t do it soon?&quot;
                  </Paragraph>
                  <Button type="primary" long>Start ranking urgency</Button>
                </Card>
              </div>
            )}

            {comparisons.length > 0 && (
              <Card style={{ background: '#FFFBE6' }}>
                <Text style={{ fontWeight: 600 }}>You have unsaved rankings from a previous session.</Text>
                <Paragraph style={{ marginTop: 8, marginBottom: 12 }}>
                  Pick a dimension above to resume, apply them now, or start over.
                </Paragraph>
                <Space>
                  <Button type="primary" icon={<IconCheck />} onClick={applyRankings}>Apply Rankings</Button>
                  <Button icon={<IconRefresh />} onClick={handleReset}>Start Over</Button>
                </Space>
              </Card>
            )}
          </Space>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // Render: Main bracket view
  // ─────────────────────────────────────────────────────────────────
  const dimensionLabel = activeDimension === ComparisonType.Priority ? 'Importance' : 'Urgency'
  const progressPct = state && state.totalPairs > 0 ? Math.round(100 * state.knownPairs / state.totalPairs) : 0
  const isDimensionComplete = state?.isComplete ?? false

  const statusMessage = (() => {
    if (isDimensionComplete) return `${dimensionLabel} ranking is complete! Apply rankings or rank by the other dimension.`
    if (selectedItem !== null) {
      const selectedTitle = itemById.get(selectedItem) ? itemTitle(itemById.get(selectedItem)!) : selectedItem
      return `Selected: ${selectedTitle}. Click another item to challenge it, or click again to deselect.`
    }
    return 'Click two items in the bracket to compare them, or use the auto-pick button.'
  })()

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 16, gap: 12 }}>
      {/* Top bar */}
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Button size="small" icon={<IconLeft />} onClick={() => setActiveDimension(null)} type="text">
            Change dimension
          </Button>
          <Title heading={5} style={{ margin: 0 }}>Ranking by {dimensionLabel}</Title>
          <Tag color="blue">{state ? `${state.knownPairs}/${state.totalPairs} pairs · ${progressPct}%` : '—'}</Tag>
          {state?.placed && state.placed.size > 0 && (
            <Tag color="green">{state.placed.size} placed</Tag>
          )}
        </Space>
        <Space>
          <Text style={{ fontSize: 13 }}>Sprint only</Text>
          <Switch
            size="small"
            checked={sprintOnly}
            onChange={(checked) => {
              setSprintOnly(checked)
              setIsHydrated(false)
              setComparisons([])
              setSelectedItem(null)
            }}
          />
          <Tag color="gray">{items.length} items</Tag>
        </Space>
      </Space>

      {/* Status message */}
      <Card
        style={{
          background: selectedItem !== null ? '#E8F3FF' : isDimensionComplete ? '#F6FFED' : '#F7F8FA',
          padding: '8px 16px',
        }}
        bodyStyle={{ padding: '8px 0' }}
      >
        <Text>{statusMessage}</Text>
      </Card>

      {/* Bracket fills remaining vertical space */}
      <div style={{ flex: 1, minHeight: 360 }}>
        <TournamentBracket
          items={items.map(i => ({ id: i.id, title: itemTitle(i) }))}
          winsGraph={dimensionGraphs.winsGraph}
          equalsGraph={dimensionGraphs.equalsGraph}
          selectedItem={selectedItem}
          onItemClick={handleNodeClick}
          width="100%"
          height="100%"
        />
      </div>

      {/* Bottom toolbar */}
      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space>
          <Button icon={<IconRefresh />} onClick={handleReset}>Start Over</Button>
          {selectedItem !== null && (
            <Button onClick={() => setSelectedItem(null)}>Clear selection</Button>
          )}
        </Space>
        <Space>
          <Button
            type="outline"
            icon={<IconThunderbolt />}
            onClick={handleAutoPickNext}
            disabled={isDimensionComplete}
          >
            Auto-pick next matchup
          </Button>
          <Button type="primary" icon={<IconCheck />} onClick={applyRankings} disabled={comparisons.length === 0}>
            Apply Rankings
          </Button>
        </Space>
      </Space>

      {/* Matchup popup */}
      <MatchupDialog
        itemA={matchupItems.a}
        itemB={matchupItems.b}
        dimension={activeDimension}
        currentAnswer={matchupCurrentAnswer}
        onPick={handleMatchupPick}
        onCancel={handleMatchupCancel}
      />
    </div>
  )
}
