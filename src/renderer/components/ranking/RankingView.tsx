/**
 * RankingView — Full-page ranking flow built around a custom tournament.
 *
 *   1. Start screen: pick Importance or Urgency.
 *   2. Setup screen: pick sample size (4/8/16/32), click "Run Tournament".
 *      The algorithm picks the N items with the most unknown relationships,
 *      seeds the first-round pairs by adjacent score, and renders a
 *      traditional bracket.
 *   3. Bracket view: click an item in the active match to advance. The bracket
 *      auto-progresses through rounds. After the final, the user can run
 *      another tournament or apply rankings.
 *   4. Apply Rankings: uses depth-based leveling so partial graphs work —
 *      same depth across disjoint subgraphs = same score. Guarded so the user
 *      can't generate scores with items that have never been in a tournament.
 *
 * The DAG "full graph" view is still available below the bracket as a
 * collapsible technical reference.
 */

import { useState, useEffect, useMemo } from 'react'
import { Button, Space, Typography, Tag, Card, Switch, Radio, Select } from '@arco-design/web-react'
import {
  IconCheck,
  IconLeft,
  IconRefresh,
  IconUp,
  IconDown,
  IconPlayArrow,
} from '@arco-design/web-react/icon'
import { useResponsive } from '../../providers/ResponsiveProvider'
import { useTaskStore } from '../../store/useTaskStore'
import { EntityType, StepStatus } from '@shared/enums'
import { SequencedTask } from '@shared/sequencing-types'
import { ComparisonType } from '@/shared/constants'
import { getDatabase } from '../../services/database'
import type { PersistedComparison } from '../../services/database-trpc'
import { Message } from '../common/Message'
import { logger } from '@/logger'
import {
  buildComparisonGraph,
  type ComparisonResult,
  type ItemId,
} from '../../utils/comparison-graph'
import { TournamentBracket } from '../slideshow/TournamentBracket'
import { BracketTournament } from './BracketTournament'
import {
  selectTournamentItems,
  seedRound1Pairs,
  computeRankingScores,
  getItemLabel,
  UnrankedItemsError,
  type TournamentItem,
} from './tournament-utils'

const { Title, Text, Paragraph } = Typography

type SampleSize = 4 | 8 | 16 | 32
const SAMPLE_SIZES: readonly SampleSize[] = [4, 8, 16, 32] as const

/**
 * What competes in the tournament:
 *   - Units:          standalone tasks + workflows (a workflow is one competitor).
 *   - Steps:          standalone tasks + every workflow's individual steps, so a
 *                     step can rank above/below standalone tasks.
 *   - SingleWorkflow: only the steps of one chosen workflow, ranked against each
 *                     other (set per-step priorities within a big workflow).
 */
enum RankGranularity {
  Units = 'units',
  Steps = 'steps',
  SingleWorkflow = 'single-workflow',
}

/** Steps that are done/skipped don't need ranking — they won't be scheduled. */
function isRankableStepStatus(status: StepStatus): boolean {
  return status !== StepStatus.Completed && status !== StepStatus.Skipped
}

interface TournamentSession {
  items: TournamentItem[]
  initialPairs: Array<[ItemId, ItemId]>
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

  const [activeDimension, setActiveDimension] = useState<ComparisonType | null>(null)
  const [comparisons, setComparisons] = useState<ComparisonResult[]>([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [sprintOnly, setSprintOnly] = useState(false)
  const [granularity, setGranularity] = useState<RankGranularity>(RankGranularity.Units)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [sampleSize, setSampleSize] = useState<SampleSize>(8)
  const [tournament, setTournament] = useState<TournamentSession | null>(null)
  const [showFullGraph, setShowFullGraph] = useState(false)

  // Active workflows (with at least one rankable step) — the pool the
  // SingleWorkflow picker draws from; ignores the sprint scope on purpose.
  const rankableWorkflows = useMemo<SequencedTask[]>(() =>
    sequencedTasks.filter(w =>
      !w.archived && !w.completed && w.steps.some(s => isRankableStepStatus(s.status)),
    ),
  [sequencedTasks])

  const items = useMemo<TournamentItem[]>(() => {
    const stepItemsFor = (workflows: SequencedTask[]): TournamentItem[] =>
      workflows.flatMap(w =>
        w.steps
          .filter(s => isRankableStepStatus(s.status))
          .map(step => ({
            id: step.id,
            type: EntityType.Step as const,
            data: step,
            label: `${w.name} › ${step.name}`,
          })),
      )

    // SingleWorkflow: just the chosen workflow's steps, no sprint filtering.
    if (granularity === RankGranularity.SingleWorkflow) {
      const wf = rankableWorkflows.find(w => w.id === selectedWorkflowId)
      return wf ? stepItemsFor([wf]) : []
    }

    const workflowIds = new Set(sequencedTasks.map(w => w.id))
    const taskItems: TournamentItem[] = tasks
      .filter(t => !t.archived && !t.completed && !workflowIds.has(t.id))
      .filter(t => !sprintOnly || t.inActiveSprint)
      .map(task => ({ id: task.id, type: EntityType.Task, data: task }))

    const activeWorkflows = sequencedTasks
      .filter(w => !w.archived && !w.completed)
      .filter(w => !sprintOnly || w.inActiveSprint)

    // Steps: standalone tasks + every workflow's individual steps.
    if (granularity === RankGranularity.Steps) {
      return [...taskItems, ...stepItemsFor(activeWorkflows)]
    }

    // Units (default): standalone tasks + workflows as single competitors.
    const workflowItems: TournamentItem[] = activeWorkflows
      .map(workflow => ({ id: workflow.id, type: EntityType.Workflow, data: workflow }))
    return [...taskItems, ...workflowItems]
  }, [tasks, sequencedTasks, sprintOnly, granularity, selectedWorkflowId, rankableWorkflows])

  // Re-hydrate from a clean slate when the competitor set changes (scope,
  // granularity, or chosen workflow) — comparisons are keyed by item id, so a
  // different id set means a different session.
  const resetSession = () => {
    setIsHydrated(false)
    setComparisons([])
    setTournament(null)
  }

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

  // Items that have at least one comparison in the active dimension —
  // used by the Apply guard.
  const rankedCount = useMemo(() => {
    if (!activeDimension) return 0
    const seen = new Set<ItemId>()
    for (const c of comparisons) {
      const v = activeDimension === ComparisonType.Priority ? c.higherPriority : c.higherUrgency
      if (v !== null) {
        seen.add(c.itemA)
        seen.add(c.itemB)
      }
    }
    let n = 0
    for (const item of items) if (seen.has(item.id)) n += 1
    return n
  }, [activeDimension, comparisons, items])

  const handlePersistAnswer = (winner: ItemId | 'equal', aId: ItemId, bId: ItemId) => {
    if (!activeDimension) return
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

    const existing = comparisons.find(c =>
      (c.itemA === aId && c.itemB === bId) || (c.itemA === bId && c.itemB === aId),
    )
    const fieldKey = activeDimension === ComparisonType.Priority ? 'higherPriority' : 'higherUrgency'
    const next: ComparisonResult[] = existing
      ? comparisons.map(c => c === existing ? { ...c, [fieldKey]: winner } : c)
      : [...comparisons, {
          itemA: aId,
          itemB: bId,
          higherPriority: activeDimension === ComparisonType.Priority ? winner : null,
          higherUrgency: activeDimension === ComparisonType.Urgency ? winner : null,
          timestamp: Date.now(),
        }]
    setComparisons(next)
  }

  const handleStartTournament = () => {
    if (!activeDimension) return
    const size = Math.min(sampleSize, items.length)
    if (size < 2) {
      Message.warning('Need at least 2 items to start a tournament.')
      return
    }
    // Round to nearest lower power of 2 if size < sampleSize (e.g., 6 items → 4)
    const pow2 = 2 ** Math.floor(Math.log2(size))
    const chosen = selectTournamentItems(items, comparisons, activeDimension, pow2)
    const pairs = seedRound1Pairs(chosen, activeDimension)
    setTournament({ items: chosen, initialPairs: pairs })
  }

  const handleApplyRankings = async () => {
    const itemIds = items.map(i => i.id)
    let priorityScores: Map<ItemId, number>
    let urgencyScores: Map<ItemId, number>
    try {
      priorityScores = computeRankingScores(itemIds, comparisons, ComparisonType.Priority)
    } catch (e) {
      if (e instanceof UnrankedItemsError) {
        Message.warning(`${e.unrankedIds.length} item(s) have no Importance comparisons yet. Run another tournament that includes them.`)
        return
      }
      throw e
    }
    try {
      urgencyScores = computeRankingScores(itemIds, comparisons, ComparisonType.Urgency)
    } catch (e) {
      if (e instanceof UnrankedItemsError) {
        Message.warning(`${e.unrankedIds.length} item(s) have no Urgency comparisons yet. Run a Urgency tournament that includes them.`)
        return
      }
      throw e
    }

    let updateCount = 0
    const { updateTask, updateSequencedTask, updateTaskStep } = useTaskStore.getState()
    for (const item of items) {
      const importance = priorityScores.get(item.id) ?? 5
      const urgency = urgencyScores.get(item.id) ?? 5
      try {
        if (item.type === EntityType.Task) {
          await updateTask(item.id, { importance, urgency })
        } else if (item.type === EntityType.Workflow) {
          await updateSequencedTask(item.id, { importance, urgency })
        } else if (item.type === EntityType.Step) {
          // Step: persist a per-step override on the parent workflow. The
          // scheduler reads step.importance/urgency ?? parent ?? 5.
          await updateTaskStep(item.data.taskId, item.id, { importance, urgency })
        } else {
          // Exhaustiveness guard: a new TournamentItem kind must be handled
          // here explicitly — `item` is `never` if all kinds are covered, so
          // this both fails the build and throws clearly at runtime.
          const unhandled: never = item
          throw new Error(`Unsupported ranking item type: ${JSON.stringify(unhandled)}`)
        }
        updateCount++
      } catch (error) {
        logger.ui.error('Failed to update task ranking', { id: item.id, error: String(error) }, 'ranking-apply')
      }
    }
    Message.success(`Updated ${updateCount} items with new importance and urgency rankings`)
    onClose()
  }

  const handleReset = () => {
    setComparisons([])
    setTournament(null)
    const db = getDatabase()
    void Promise.all([
      db.clearComparisonDimension(ComparisonType.Priority),
      db.clearComparisonDimension(ComparisonType.Urgency),
    ]).catch(err => logger.ui.error('Failed to clear persisted comparisons', { error: String(err) }, 'ranking-clear'))
    setActiveDimension(null)
    Message.info('All comparisons cleared. Pick a dimension to start fresh.')
  }

  // ─────────────────────────────────────────────────────────────────
  // Render: Start screen (no dimension picked)
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
              Pick a dimension to rank. Tournaments run on a subset of items at a time —
              run as many as you like; each adds information to the ranking. Apply when
              you&apos;re ready.
            </Paragraph>
          </div>

          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Space size={6}>
              <Text style={{ fontSize: 13, color: '#86909C' }}>Scope:</Text>
              <Switch
                size="small"
                disabled={granularity === RankGranularity.SingleWorkflow}
                checked={sprintOnly}
                onChange={(checked) => {
                  setSprintOnly(checked)
                  resetSession()
                }}
              />
              <Text style={{ fontSize: 13 }}>{sprintOnly ? 'Sprint only' : 'All active items'}</Text>
              <Tag color="gray" size="small">{items.length} items</Tag>
            </Space>

            <Space size={6} wrap>
              <Text style={{ fontSize: 13, color: '#86909C' }}>Rank:</Text>
              <Radio.Group
                type="button"
                size="small"
                value={granularity}
                onChange={(value) => {
                  setGranularity(value as RankGranularity)
                  resetSession()
                }}
              >
                <Radio value={RankGranularity.Units}>Tasks &amp; workflows</Radio>
                <Radio value={RankGranularity.Steps}>Split workflows into steps</Radio>
                <Radio value={RankGranularity.SingleWorkflow}>One workflow&apos;s steps</Radio>
              </Radio.Group>
              {granularity === RankGranularity.SingleWorkflow && (
                <Select
                  size="small"
                  placeholder="Pick a workflow…"
                  style={{ minWidth: 220 }}
                  value={selectedWorkflowId ?? undefined}
                  onChange={(value) => {
                    setSelectedWorkflowId(value as string)
                    resetSession()
                  }}
                  options={rankableWorkflows.map(w => ({ label: w.name, value: w.id }))}
                  notFoundContent="No workflows with rankable steps"
                />
              )}
            </Space>
          </Space>

          {items.length < 2 ? (
            <Card style={{ textAlign: 'center', padding: 24 }}>
              <Text type="secondary">
                {granularity === RankGranularity.SingleWorkflow
                  ? (selectedWorkflowId
                      ? 'This workflow has fewer than 2 rankable steps.'
                      : 'Pick a workflow above to rank its steps.')
                  : granularity === RankGranularity.Steps
                    ? 'Need at least 2 tasks or workflow steps to rank.'
                    : sprintOnly
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
                onClick={() => setActiveDimension(ComparisonType.Priority)}
              />
              <DimensionCard
                title="Rank by Urgency"
                description={"Time pressure. \"Which one will become a problem if I don't do it soon?\""}
                icon="⏰"
                iconBg="#FFF1E8"
                hoverColor="#F77234"
                onClick={() => setActiveDimension(ComparisonType.Urgency)}
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
                <Button type="primary" icon={<IconCheck />} onClick={handleApplyRankings}>
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
  // Render: Tournament / setup view
  // ─────────────────────────────────────────────────────────────────
  const dimensionLabel = activeDimension === ComparisonType.Priority ? 'Importance' : 'Urgency'
  const coveragePct = items.length === 0 ? 0 : Math.round(100 * rankedCount / items.length)

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
            onClick={() => {
              setActiveDimension(null)
              setTournament(null)
            }}
            type="text"
          >
            {isCompact ? '' : 'Change dimension'}
          </Button>
          <Title heading={isCompact ? 6 : 5} style={{ margin: 0 }}>
            Ranking by {dimensionLabel}
          </Title>
          {granularity !== RankGranularity.Units && (
            <Tag color="purple" size={isCompact ? 'small' : 'default'}>
              {granularity === RankGranularity.SingleWorkflow ? 'workflow steps' : 'steps + tasks'}
            </Tag>
          )}
          <Tag color="blue" size={isCompact ? 'small' : 'default'}>
            {rankedCount}/{items.length} ranked · {coveragePct}%
          </Tag>
        </Space>
        <Space size={6} wrap>
          <Text style={{ fontSize: 12, color: '#86909C' }}>Sprint only</Text>
          <Switch
            size="small"
            disabled={granularity === RankGranularity.SingleWorkflow}
            checked={sprintOnly}
            onChange={(checked) => {
              setSprintOnly(checked)
              resetSession()
            }}
          />
          <Tag size={isCompact ? 'small' : 'default'} color="gray">{items.length} items</Tag>
        </Space>
      </div>

      {/* Tournament setup OR active bracket */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', borderBottom: '1px solid #E5E6EB' }}>
        {tournament ? (
          <ActiveBracketHeader
            tournamentSize={tournament.items.length}
            onAbort={() => setTournament(null)}
            isCompact={isCompact}
          />
        ) : (
          <TournamentSetup
            sampleSize={sampleSize}
            onSampleSizeChange={setSampleSize}
            availableCount={items.length}
            onStart={handleStartTournament}
            isCompact={isCompact}
          />
        )}
      </div>

      {/* Main canvas: bracket OR placeholder */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#FAFBFC' }}>
        {tournament ? (
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
            <BracketTournament
              items={tournament.items}
              initialPairs={tournament.initialPairs}
              dimension={activeDimension}
              comparisons={comparisons}
              onPick={handlePersistAnswer}
              onComplete={() => {
                Message.success('Tournament complete! Run another or apply rankings.')
              }}
              isCompact={isCompact}
            />
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              textAlign: 'center',
              color: '#86909C',
            }}
          >
            <div>
              <Title heading={6} style={{ color: '#86909C', marginBottom: 4 }}>
                Pick a sample size and run a tournament
              </Title>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Each tournament pairs items that need refinement. Run multiple
                tournaments to cover more ground.
              </Text>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible full-graph view */}
      <div style={{ flexShrink: 0, background: '#FFFFFF', borderTop: '1px solid #E5E6EB' }}>
        <button
          type="button"
          onClick={() => setShowFullGraph(v => !v)}
          style={{
            width: '100%',
            padding: '8px 20px',
            background: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          <Text style={{ fontSize: 13, color: '#4E5969' }}>
            Full graph view <Text type="secondary" style={{ fontSize: 12 }}>(technical reference — all comparisons)</Text>
          </Text>
          {showFullGraph ? <IconDown /> : <IconUp />}
        </button>
        {showFullGraph && (
          <div style={{ height: 280, position: 'relative', borderTop: '1px solid #F2F3F5' }}>
            <div style={{ position: 'absolute', inset: 0 }}>
              <TournamentBracket
                items={items.map(i => ({ id: i.id, title: getItemLabel(i) }))}
                winsGraph={dimensionGraphs.winsGraph}
                equalsGraph={dimensionGraphs.equalsGraph}
                width="100%"
                height="100%"
              />
            </div>
          </div>
        )}
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
          onClick={handleApplyRankings}
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

interface TournamentSetupProps {
  sampleSize: SampleSize
  onSampleSizeChange: (n: SampleSize) => void
  availableCount: number
  onStart: () => void
  isCompact: boolean
}
function TournamentSetup({ sampleSize, onSampleSizeChange, availableCount, onStart, isCompact }: TournamentSetupProps) {
  return (
    <div
      style={{
        padding: isCompact ? '12px' : '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <Space size={8} wrap>
        <Text style={{ fontSize: 13, color: '#4E5969', fontWeight: 600 }}>Tournament size:</Text>
        <Radio.Group
          type="button"
          size="small"
          value={sampleSize}
          onChange={(v) => onSampleSizeChange(v as SampleSize)}
        >
          {SAMPLE_SIZES.map(n => (
            <Radio
              key={n}
              value={n}
              disabled={n > availableCount}
            >
              {n}
            </Radio>
          ))}
        </Radio.Group>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {sampleSize > availableCount ? `(only ${availableCount} available)` : `~${sampleSize - 1} matches`}
        </Text>
      </Space>
      <Button
        size={isCompact ? 'small' : 'default'}
        type="primary"
        icon={<IconPlayArrow />}
        onClick={onStart}
        disabled={availableCount < 2}
      >
        Run Tournament
      </Button>
    </div>
  )
}

interface ActiveBracketHeaderProps {
  tournamentSize: number
  onAbort: () => void
  isCompact: boolean
}
function ActiveBracketHeader({ tournamentSize, onAbort, isCompact }: ActiveBracketHeaderProps) {
  return (
    <div
      style={{
        padding: isCompact ? '8px 12px' : '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      <Space size={6}>
        <Tag color="orange" size={isCompact ? 'small' : 'default'}>Tournament in progress</Tag>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {tournamentSize}-item bracket · click a card to pick the winner
        </Text>
      </Space>
      <Button
        size={isCompact ? 'mini' : 'small'}
        onClick={onAbort}
      >
        End Tournament
      </Button>
    </div>
  )
}
