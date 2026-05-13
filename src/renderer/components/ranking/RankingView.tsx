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
import { useResponsive } from '../../providers/ResponsiveProvider'
import { Button, Space, Typography, Tag, Card, Switch } from '@arco-design/web-react'
import { Message } from '../common/Message'
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
  const { isCompact, isMobile } = useResponsive()

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
          {/* Header */}
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
              Compare items pairwise to build a ranking. Pick which dimension to rank below — you
              can switch later, but only one at a time. Your answers save automatically.
            </Paragraph>
          </div>

          {/* Scope chip */}
          <Space size={6} style={{ alignSelf: 'flex-start' }}>
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

          {/* Dimension picker or empty state */}
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
              <button
                type="button"
                onClick={() => setActiveDimension(ComparisonType.Priority)}
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
                  e.currentTarget.style.borderColor = '#3491FA'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(52,145,250,0.12)'
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
                      background: '#E8F3FF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                    }}
                  >
                    ⭐
                  </div>
                  <Title heading={5} style={{ margin: 0 }}>Rank by Importance</Title>
                </div>
                <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
                  Intrinsic value, impact, or significance. &quot;If I could only do one thing today,
                  which has the bigger payoff?&quot;
                </Paragraph>
              </button>

              <button
                type="button"
                onClick={() => setActiveDimension(ComparisonType.Urgency)}
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
                  e.currentTarget.style.borderColor = '#F77234'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(247,114,52,0.12)'
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
                      background: '#FFF1E8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                    }}
                  >
                    ⏰
                  </div>
                  <Title heading={5} style={{ margin: 0 }}>Rank by Urgency</Title>
                </div>
                <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 13 }}>
                  Time pressure. &quot;Which one will become a problem if I don&apos;t do it
                  soon?&quot;
                </Paragraph>
              </button>
            </div>
          )}

          {/* Resume prompt if prior comparisons exist */}
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

  // Status banner color reflects the current interaction state.
  const statusColor = selectedItem !== null
    ? { bg: '#E8F3FF', fg: '#1D4FAA', border: '#94BFFF' }
    : isDimensionComplete
      ? { bg: '#F6FFED', fg: '#137C31', border: '#7BD58F' }
      : { bg: '#FFFFFF', fg: '#4E5969', border: '#E5E6EB' }

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
      {/* Top toolbar — sticky, modern, compact on small screens */}
      <div
        style={{
          flexShrink: 0,
          padding: isCompact ? '10px 12px' : '12px 20px',
          background: '#FFFFFF',
          borderBottom: '1px solid #E5E6EB',
          boxShadow: '0 1px 0 rgba(0, 0, 0, 0.02)',
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
          {!isMobile && <Text style={{ fontSize: 12, color: '#86909C' }}>Sprint only</Text>}
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
          <Tag size={isCompact ? 'small' : 'default'} color="gray">{items.length} items</Tag>
        </Space>
      </div>

      {/* Status banner — thin, ambient, color-coded to interaction state */}
      <div
        style={{
          flexShrink: 0,
          padding: '8px 20px',
          background: statusColor.bg,
          borderBottom: `1px solid ${statusColor.border}`,
          color: statusColor.fg,
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        {statusMessage}
      </div>

      {/* Bracket canvas — the absolute-inset trick gives ReactFlow concrete dimensions */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#FAFBFC' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
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
      </div>

      {/* Bottom action bar — primary actions right-aligned */}
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
        <Space size={6} wrap>
          <Button size={isCompact ? 'small' : 'default'} icon={<IconRefresh />} onClick={handleReset}>
            {isCompact ? '' : 'Start Over'}
          </Button>
          {selectedItem !== null && (
            <Button size={isCompact ? 'small' : 'default'} onClick={() => setSelectedItem(null)}>
              Clear selection
            </Button>
          )}
        </Space>
        <Space size={6} wrap>
          <Button
            size={isCompact ? 'small' : 'default'}
            type="outline"
            icon={<IconThunderbolt />}
            onClick={handleAutoPickNext}
            disabled={isDimensionComplete}
          >
            {isCompact ? 'Auto' : 'Auto-pick next matchup'}
          </Button>
          <Button
            size={isCompact ? 'small' : 'default'}
            type="primary"
            icon={<IconCheck />}
            onClick={applyRankings}
            disabled={comparisons.length === 0}
          >
            {isCompact ? 'Apply' : 'Apply Rankings'}
          </Button>
        </Space>
      </div>

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
