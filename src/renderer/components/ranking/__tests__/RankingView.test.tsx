import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { RankingView } from '../RankingView'
import { useTaskStore } from '../../../store/useTaskStore'
import { ComparisonType } from '@/shared/constants'
import { TaskStatus, StepStatus } from '@shared/enums'
import type { TaskStep } from '@shared/types'
import { Message } from '../../common/Message'
import { logger } from '@/logger'
import type { Task } from '@shared/types'
import type { SequencedTask } from '@shared/sequencing-types'
import type { PersistedComparison } from '../../../services/database-trpc'

// ── Mocks ────────────────────────────────────────────────────────────────

vi.mock('../../../store/useTaskStore', () => {
  const useTaskStore = vi.fn() as ReturnType<typeof vi.fn> & { getState: ReturnType<typeof vi.fn> }
  useTaskStore.getState = vi.fn()
  return { useTaskStore }
})

const responsiveState = vi.hoisted(() => ({ isCompact: false }))
vi.mock('../../../providers/ResponsiveProvider', () => ({
  useResponsive: () => responsiveState,
}))

const dbMocks = vi.hoisted(() => ({
  listComparisons: vi.fn(),
  recordComparison: vi.fn(),
  clearComparisonDimension: vi.fn(),
}))
vi.mock('../../../services/database', () => ({
  getDatabase: () => dbMocks,
}))

vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/logger', () => ({
  logger: {
    ui: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

// Capture props passed to the bracket so tests can drive onPick/onComplete.
const bracketProps = vi.hoisted(() => ({ current: null as any }))
vi.mock('../BracketTournament', () => ({
  BracketTournament: (props: any) => {
    bracketProps.current = props
    return (
      <div data-testid="bracket-tournament">
        bracket items: {props.items.length}
      </div>
    )
  },
}))

// Capture props passed to the full-graph DAG view.
const fullGraphProps = vi.hoisted(() => ({ current: null as any }))
vi.mock('../../slideshow/TournamentBracket', () => ({
  TournamentBracket: (props: any) => {
    fullGraphProps.current = props
    return <div data-testid="full-graph">graph items: {props.items.length}</div>
  },
}))

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeTask(id: string, name: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name,
    duration: 60,
    importance: 5,
    urgency: 5,
    asyncWaitTime: 0,
    dependencies: [],
    completed: false,
    sessionId: 'session-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    hasSteps: false,
    overallStatus: TaskStatus.NotStarted,
    criticalPathDuration: 60,
    worstCaseDuration: 60,
    archived: false,
    inActiveSprint: false,
    type: 'focused',
    ...overrides,
  }
}

function makeStep(id: string, taskId: string, name: string, overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id,
    name,
    duration: 30,
    type: 'focused',
    taskId,
    dependsOn: [],
    asyncWaitTime: 0,
    status: StepStatus.Pending,
    stepIndex: 0,
    percentComplete: 0,
    ...overrides,
  }
}

function makeWorkflow(id: string, name: string, overrides: Partial<Task> = {}, steps: TaskStep[] = []): SequencedTask {
  return {
    ...makeTask(id, name, overrides),
    hasSteps: true as const,
    steps,
  }
}

let rowSeq = 0
function makeRow(
  itemAId: string,
  itemBId: string,
  dimension: ComparisonType,
  winnerId: string | null,
  isEqual = false,
): PersistedComparison {
  rowSeq += 1
  return {
    id: `row-${rowSeq}`,
    itemAId,
    itemBId,
    winnerId,
    dimension,
    isEqual,
    createdAt: new Date('2026-01-02T00:00:00Z'),
  }
}

// Default scope: 4 standalone tasks + 1 workflow = 5 rankable items.
// t-arch / t-done are filtered out; w-delta appears in BOTH tasks and
// sequencedTasks (as in the real store) and must be counted once.
const defaultTasks: Task[] = [
  makeTask('t-alpha', 'Alpha Task', { importance: 9, inActiveSprint: true }),
  makeTask('t-beta', 'Beta Task', { importance: 7, inActiveSprint: true }),
  makeTask('t-gamma', 'Gamma Task', { importance: 5 }),
  makeTask('t-epsilon', 'Epsilon Task', { importance: 3 }),
  makeTask('w-delta', 'Delta Workflow', { hasSteps: true }),
  makeTask('t-arch', 'Archived Task', { archived: true }),
  makeTask('t-done', 'Done Task', { completed: true }),
]
const defaultWorkflows: SequencedTask[] = [
  makeWorkflow('w-delta', 'Delta Workflow'),
]

const mockedStore = useTaskStore as unknown as ReturnType<typeof vi.fn> & {
  getState: ReturnType<typeof vi.fn>
}
const mockUpdateTask = vi.fn()
const mockUpdateSequencedTask = vi.fn()
const mockUpdateTaskStep = vi.fn()

function setStore(tasks: Task[], sequencedTasks: SequencedTask[]): void {
  mockedStore.mockReturnValue({ tasks, sequencedTasks })
}

async function renderView(onClose = vi.fn()) {
  const result = render(<RankingView onClose={onClose} />)
  // Flush the async hydration effect so no state update lands outside act.
  await act(async () => {})
  return { ...result, onClose }
}

/** Match an element whose merged textContent equals `text` (Arco tags split text nodes). */
function byFullText(text: string) {
  return screen.getByText((_, node) => {
    if (node?.textContent !== text) return false
    return !Array.from(node.children).some(child => child.textContent === text)
  })
}

function enterDimension(label: 'Rank by Importance' | 'Rank by Urgency'): void {
  fireEvent.click(screen.getByText(label))
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('RankingView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responsiveState.isCompact = false
    bracketProps.current = null
    fullGraphProps.current = null
    setStore(defaultTasks, defaultWorkflows)
    mockedStore.getState.mockReturnValue({
      updateTask: mockUpdateTask,
      updateSequencedTask: mockUpdateSequencedTask,
      updateTaskStep: mockUpdateTaskStep,
    })
    mockUpdateTask.mockResolvedValue(undefined)
    mockUpdateSequencedTask.mockResolvedValue(undefined)
    mockUpdateTaskStep.mockResolvedValue(undefined)
    dbMocks.listComparisons.mockResolvedValue([])
    dbMocks.recordComparison.mockResolvedValue(undefined)
    dbMocks.clearComparisonDimension.mockResolvedValue(0)
  })

  describe('start screen', () => {
    it('renders both dimension cards and counts only active, deduped items', async () => {
      await renderView()

      expect(screen.getByText('Rank your tasks')).toBeInTheDocument()
      expect(screen.getByText('Rank by Importance')).toBeInTheDocument()
      expect(screen.getByText('Rank by Urgency')).toBeInTheDocument()
      // 4 tasks + 1 workflow; archived/completed excluded; w-delta counted once.
      expect(byFullText('5 items')).toBeInTheDocument()
      expect(screen.getByText('All active items')).toBeInTheDocument()
    })

    it('calls onClose from the Back button', async () => {
      const { onClose } = await renderView()
      fireEvent.click(screen.getByText('Back'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('shows the empty state and skips hydration when fewer than 2 items exist', async () => {
      setStore([makeTask('t-solo', 'Solo Task')], [])
      await renderView()

      expect(screen.getByText('Need at least 2 tasks or workflows to rank.')).toBeInTheDocument()
      expect(screen.queryByText('Rank by Importance')).not.toBeInTheDocument()
      // items.length > 0 → hydration still runs for the single item…
      expect(dbMocks.listComparisons).toHaveBeenCalledWith(['t-solo'])
    })

    it('does not hydrate at all with zero items', async () => {
      setStore([], [])
      await renderView()

      expect(screen.getByText('Need at least 2 tasks or workflows to rank.')).toBeInTheDocument()
      expect(dbMocks.listComparisons).not.toHaveBeenCalled()
    })

    it('sprint-only toggle narrows scope, re-hydrates, and shows sprint empty message when too few', async () => {
      await renderView()
      expect(dbMocks.listComparisons).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByRole('switch'))
      await act(async () => {})

      expect(screen.getByText('Sprint only')).toBeInTheDocument()
      expect(byFullText('2 items')).toBeInTheDocument()
      // Hydration re-ran scoped to the sprint items only.
      expect(dbMocks.listComparisons).toHaveBeenCalledTimes(2)
      expect(dbMocks.listComparisons).toHaveBeenLastCalledWith(['t-alpha', 't-beta'])

      // With < 2 sprint items the sprint-specific empty message renders.
      setStore(
        [makeTask('t-alpha', 'Alpha Task', { inActiveSprint: true }), makeTask('t-beta', 'Beta Task')],
        [],
      )
      const { unmount } = await renderView()
      fireEvent.click(screen.getAllByRole('switch')[1])
      await act(async () => {})
      expect(
        screen.getByText('Need at least 2 sprint items to rank. Add items to the sprint or toggle this off.'),
      ).toBeInTheDocument()
      unmount()
    })

    it('hydrates persisted comparisons, merging dimension rows per pair into one comparison', async () => {
      dbMocks.listComparisons.mockResolvedValue([
        makeRow('t-alpha', 't-beta', ComparisonType.Priority, 't-alpha'),
        makeRow('t-alpha', 't-beta', ComparisonType.Urgency, null, true),
        makeRow('t-gamma', 't-epsilon', ComparisonType.Priority, 't-gamma'),
      ])
      await renderView()

      // 3 rows but only 2 distinct pairs → 2 comparisons.
      expect(screen.getByText('Resume your last session')).toBeInTheDocument()
      expect(byFullText('You have 2 saved comparisons.')).toBeInTheDocument()
    })

    it('logs and renders without a resume banner when hydration fails', async () => {
      dbMocks.listComparisons.mockRejectedValue(new Error('db down'))
      await renderView()

      expect(logger.ui.error).toHaveBeenCalledWith(
        'Failed to hydrate persisted comparisons',
        expect.objectContaining({ error: expect.stringContaining('db down') }),
        'ranking-view-hydrate',
      )
      expect(screen.queryByText('Resume your last session')).not.toBeInTheDocument()
      expect(screen.getByText('Rank by Importance')).toBeInTheDocument()
    })

    it('Start Over clears both persisted dimensions and removes the banner', async () => {
      dbMocks.listComparisons.mockResolvedValue([
        makeRow('t-alpha', 't-beta', ComparisonType.Priority, 't-alpha'),
      ])
      await renderView()
      expect(screen.getByText('Resume your last session')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Start Over'))
      await act(async () => {})

      expect(dbMocks.clearComparisonDimension).toHaveBeenCalledWith(ComparisonType.Priority)
      expect(dbMocks.clearComparisonDimension).toHaveBeenCalledWith(ComparisonType.Urgency)
      expect(Message.info).toHaveBeenCalledWith('All comparisons cleared. Pick a dimension to start fresh.')
      expect(screen.queryByText('Resume your last session')).not.toBeInTheDocument()
    })
  })

  describe('apply rankings', () => {
    const threeItemTasks = [
      makeTask('t-alpha', 'Alpha Task'),
      makeTask('t-beta', 'Beta Task'),
      makeTask('w-delta', 'Delta Workflow', { hasSteps: true }),
    ]
    const threeItemWorkflows = [makeWorkflow('w-delta', 'Delta Workflow')]

    it('applies depth-based scores per item type and closes on success', async () => {
      setStore(threeItemTasks, threeItemWorkflows)
      // Chain: alpha beats beta beats delta, in both dimensions.
      dbMocks.listComparisons.mockResolvedValue([
        makeRow('t-alpha', 't-beta', ComparisonType.Priority, 't-alpha'),
        makeRow('t-alpha', 't-beta', ComparisonType.Urgency, 't-alpha'),
        makeRow('t-beta', 'w-delta', ComparisonType.Priority, 't-beta'),
        makeRow('t-beta', 'w-delta', ComparisonType.Urgency, 't-beta'),
      ])
      const { onClose } = await renderView()

      fireEvent.click(screen.getByText('Apply Rankings'))
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

      // Depths 0/1/2 over maxDepth 2 → scores 10 / 6 / 1.
      expect(mockUpdateTask).toHaveBeenCalledWith('t-alpha', { importance: 10, urgency: 10 })
      expect(mockUpdateTask).toHaveBeenCalledWith('t-beta', { importance: 6, urgency: 6 })
      // The workflow goes through updateSequencedTask, not updateTask.
      expect(mockUpdateSequencedTask).toHaveBeenCalledWith('w-delta', { importance: 1, urgency: 1 })
      expect(mockUpdateTask).not.toHaveBeenCalledWith('w-delta', expect.anything())
      expect(Message.success).toHaveBeenCalledWith(
        'Updated 3 items with new importance and urgency rankings',
      )
    })

    it('warns and stays open when items lack Importance comparisons', async () => {
      setStore(threeItemTasks, threeItemWorkflows)
      dbMocks.listComparisons.mockResolvedValue([
        makeRow('t-alpha', 't-beta', ComparisonType.Urgency, 't-alpha'),
      ])
      const { onClose } = await renderView()

      fireEvent.click(screen.getByText('Apply Rankings'))
      await waitFor(() => expect(Message.warning).toHaveBeenCalled())

      expect(Message.warning).toHaveBeenCalledWith(
        '3 item(s) have no Importance comparisons yet. Run another tournament that includes them.',
      )
      expect(onClose).not.toHaveBeenCalled()
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it('warns about Urgency separately when only urgency coverage is missing', async () => {
      setStore(threeItemTasks, threeItemWorkflows)
      dbMocks.listComparisons.mockResolvedValue([
        makeRow('t-alpha', 't-beta', ComparisonType.Priority, 't-alpha'),
        makeRow('t-beta', 'w-delta', ComparisonType.Priority, 't-beta'),
        makeRow('t-alpha', 't-beta', ComparisonType.Urgency, 't-alpha'),
      ])
      const { onClose } = await renderView()

      fireEvent.click(screen.getByText('Apply Rankings'))
      await waitFor(() => expect(Message.warning).toHaveBeenCalled())

      expect(Message.warning).toHaveBeenCalledWith(
        '1 item(s) have no Urgency comparisons yet. Run a Urgency tournament that includes them.',
      )
      expect(onClose).not.toHaveBeenCalled()
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it('continues past individual update failures and reports the real count', async () => {
      setStore(threeItemTasks, threeItemWorkflows)
      dbMocks.listComparisons.mockResolvedValue([
        makeRow('t-alpha', 't-beta', ComparisonType.Priority, 't-alpha'),
        makeRow('t-alpha', 't-beta', ComparisonType.Urgency, 't-alpha'),
        makeRow('t-beta', 'w-delta', ComparisonType.Priority, 't-beta'),
        makeRow('t-beta', 'w-delta', ComparisonType.Urgency, 't-beta'),
      ])
      mockUpdateTask.mockImplementation((id: string) =>
        id === 't-beta' ? Promise.reject(new Error('boom')) : Promise.resolve(),
      )
      const { onClose } = await renderView()

      fireEvent.click(screen.getByText('Apply Rankings'))
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))

      expect(logger.ui.error).toHaveBeenCalledWith(
        'Failed to update task ranking',
        expect.objectContaining({ id: 't-beta' }),
        'ranking-apply',
      )
      expect(Message.success).toHaveBeenCalledWith(
        'Updated 2 items with new importance and urgency rankings',
      )
    })
  })

  describe('tournament screen', () => {
    it('shows toolbar, coverage tag, setup row, and placeholder after picking Importance', async () => {
      await renderView()
      enterDimension('Rank by Importance')

      expect(byFullText('Ranking by Importance')).toBeInTheDocument()
      expect(byFullText('0/5 ranked · 0%')).toBeInTheDocument()
      expect(screen.getByText('Tournament size:')).toBeInTheDocument()
      // Default sample size 8 exceeds the 5 available items.
      expect(screen.getByText('(only 5 available)')).toBeInTheDocument()
      expect(screen.getByText('Pick a sample size and run a tournament')).toBeInTheDocument()
      // No comparisons yet → Apply Rankings is disabled.
      expect(screen.getByText('Apply Rankings').closest('button')).toBeDisabled()
    })

    it('disables sample sizes above the available item count', async () => {
      await renderView()
      enterDimension('Rank by Importance')

      const radio = (label: string): HTMLInputElement => {
        const input = screen.getByDisplayValue(label)
        return input as HTMLInputElement
      }
      expect(radio('4').disabled).toBe(false)
      expect(radio('8').disabled).toBe(true)
      expect(radio('16').disabled).toBe(true)
      expect(radio('32').disabled).toBe(true)
    })

    it('shows the expected match count when the sample size fits', async () => {
      await renderView()
      enterDimension('Rank by Importance')

      fireEvent.click(screen.getByDisplayValue('4'))
      expect(screen.getByText('~3 matches')).toBeInTheDocument()
      expect(screen.queryByText('(only 5 available)')).not.toBeInTheDocument()
    })

    it('runs a tournament rounded down to a power of 2 and seeds pairs by score', async () => {
      await renderView()
      enterDimension('Rank by Importance')

      // 5 items with sample size 8 → size 5 → pow2 rounds down to 4.
      fireEvent.click(screen.getByText('Run Tournament'))

      expect(byFullText('Tournament in progress')).toBeInTheDocument()
      expect(byFullText('4-item bracket · click a card to pick the winner')).toBeInTheDocument()
      expect(screen.getByTestId('bracket-tournament')).toBeInTheDocument()
      expect(bracketProps.current.items).toHaveLength(4)
      // No comparisons → lexicographic id tiebreak picks the 4 tasks; pairs
      // are adjacent after sorting by importance desc (9,7,5,3).
      expect(bracketProps.current.initialPairs).toEqual([
        ['t-alpha', 't-beta'],
        ['t-gamma', 't-epsilon'],
      ])
      expect(bracketProps.current.dimension).toBe(ComparisonType.Priority)
      // Setup row is replaced by the active-bracket header.
      expect(screen.queryByText('Tournament size:')).not.toBeInTheDocument()
    })

    it('End Tournament aborts back to the setup row', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))

      fireEvent.click(screen.getByText('End Tournament'))

      expect(screen.queryByTestId('bracket-tournament')).not.toBeInTheDocument()
      expect(screen.getByText('Tournament size:')).toBeInTheDocument()
    })

    it('a pick persists the comparison and updates ranked coverage', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))

      act(() => {
        bracketProps.current.onPick('t-alpha', 't-alpha', 't-beta')
      })

      expect(dbMocks.recordComparison).toHaveBeenCalledWith({
        itemAId: 't-alpha',
        itemBId: 't-beta',
        winnerId: 't-alpha',
        isEqual: false,
        dimension: ComparisonType.Priority,
      })
      expect(byFullText('2/5 ranked · 40%')).toBeInTheDocument()
      expect(screen.getByText('Apply Rankings').closest('button')).not.toBeDisabled()
    })

    it('an equal pick persists isEqual with no winner and still counts both items as ranked', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))

      act(() => {
        bracketProps.current.onPick('equal', 't-gamma', 't-epsilon')
      })

      expect(dbMocks.recordComparison).toHaveBeenCalledWith({
        itemAId: 't-gamma',
        itemBId: 't-epsilon',
        winnerId: null,
        isEqual: true,
        dimension: ComparisonType.Priority,
      })
      expect(byFullText('2/5 ranked · 40%')).toBeInTheDocument()
    })

    it('re-picking the same pair updates the existing comparison instead of adding one', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))

      act(() => {
        bracketProps.current.onPick('t-alpha', 't-alpha', 't-beta')
      })
      act(() => {
        // Reversed argument order must still match the stored pair.
        bracketProps.current.onPick('t-beta', 't-beta', 't-alpha')
      })

      expect(dbMocks.recordComparison).toHaveBeenCalledTimes(2)
      // Still one comparison entry, not two.
      expect(bracketProps.current.comparisons).toHaveLength(1)
      expect(bracketProps.current.comparisons[0].higherPriority).toBe('t-beta')
      expect(byFullText('2/5 ranked · 40%')).toBeInTheDocument()
    })

    it('keeps the local comparison and logs when persistence fails', async () => {
      dbMocks.recordComparison.mockRejectedValue(new Error('offline'))
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))

      act(() => {
        bracketProps.current.onPick('t-alpha', 't-alpha', 't-beta')
      })
      await waitFor(() => expect(logger.ui.error).toHaveBeenCalledWith(
        'Failed to persist comparison',
        expect.objectContaining({ error: expect.stringContaining('offline') }),
        'ranking-record',
      ))

      // The optimistic local state survives the persistence failure.
      expect(byFullText('2/5 ranked · 40%')).toBeInTheDocument()
    })

    it('tournament completion announces success', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))

      act(() => {
        bracketProps.current.onComplete()
      })

      expect(Message.success).toHaveBeenCalledWith('Tournament complete! Run another or apply rankings.')
    })

    it('applying with partial coverage warns about unranked items', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))
      act(() => {
        bracketProps.current.onPick('t-alpha', 't-alpha', 't-beta')
      })

      fireEvent.click(screen.getByText('Apply Rankings'))
      await waitFor(() => expect(Message.warning).toHaveBeenCalled())

      // gamma, epsilon and the workflow have no Importance comparisons yet.
      expect(Message.warning).toHaveBeenCalledWith(
        '3 item(s) have no Importance comparisons yet. Run another tournament that includes them.',
      )
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it('urgency dimension records urgency comparisons and feeds the urgency wins graph', async () => {
      await renderView()
      enterDimension('Rank by Urgency')

      expect(byFullText('Ranking by Urgency')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Run Tournament'))
      act(() => {
        bracketProps.current.onPick('t-alpha', 't-alpha', 't-beta')
      })

      expect(dbMocks.recordComparison).toHaveBeenCalledWith(
        expect.objectContaining({ dimension: ComparisonType.Urgency, winnerId: 't-alpha' }),
      )

      // The full-graph view receives the urgency-dimension wins graph.
      fireEvent.click(byFullText('Full graph view (technical reference — all comparisons)'))
      expect(screen.getByTestId('full-graph')).toBeInTheDocument()
      expect(fullGraphProps.current.winsGraph.get('t-alpha')?.has('t-beta')).toBe(true)
    })

    it('toggles the collapsible full-graph view with all item titles', async () => {
      await renderView()
      enterDimension('Rank by Importance')

      expect(screen.queryByTestId('full-graph')).not.toBeInTheDocument()

      fireEvent.click(byFullText('Full graph view (technical reference — all comparisons)'))
      expect(screen.getByTestId('full-graph')).toBeInTheDocument()
      expect(fullGraphProps.current.items).toHaveLength(5)
      expect(fullGraphProps.current.items.map((i: { title: string }) => i.title)).toContain('Delta Workflow')

      fireEvent.click(byFullText('Full graph view (technical reference — all comparisons)'))
      expect(screen.queryByTestId('full-graph')).not.toBeInTheDocument()
    })

    it('Change dimension returns to the start screen and discards the tournament', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))

      fireEvent.click(screen.getByText('Change dimension'))

      expect(screen.getByText('Rank your tasks')).toBeInTheDocument()
      // Re-entering shows the setup row, not a lingering bracket.
      enterDimension('Rank by Urgency')
      expect(screen.queryByTestId('bracket-tournament')).not.toBeInTheDocument()
      expect(screen.getByText('Tournament size:')).toBeInTheDocument()
    })

    it('bottom-bar Start Over clears everything and returns to the start screen', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))
      act(() => {
        bracketProps.current.onPick('t-alpha', 't-alpha', 't-beta')
      })

      fireEvent.click(screen.getByText('Start Over'))
      await act(async () => {})

      expect(screen.getByText('Rank your tasks')).toBeInTheDocument()
      expect(dbMocks.clearComparisonDimension).toHaveBeenCalledWith(ComparisonType.Priority)
      expect(dbMocks.clearComparisonDimension).toHaveBeenCalledWith(ComparisonType.Urgency)
      expect(Message.info).toHaveBeenCalled()
      // Comparisons were wiped → no resume banner on the start screen.
      expect(screen.queryByText('Resume your last session')).not.toBeInTheDocument()
    })

    it('sprint toggle on the tournament screen aborts the tournament and rescopes items', async () => {
      await renderView()
      enterDimension('Rank by Importance')
      fireEvent.click(screen.getByText('Run Tournament'))
      expect(screen.getByTestId('bracket-tournament')).toBeInTheDocument()
      expect(dbMocks.listComparisons).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByRole('switch'))
      await act(async () => {})

      expect(screen.queryByTestId('bracket-tournament')).not.toBeInTheDocument()
      expect(screen.getByText('Tournament size:')).toBeInTheDocument()
      expect(byFullText('2 items')).toBeInTheDocument()
      expect(byFullText('0/2 ranked · 0%')).toBeInTheDocument()
      expect(dbMocks.listComparisons).toHaveBeenCalledTimes(2)
      expect(dbMocks.listComparisons).toHaveBeenLastCalledWith(['t-alpha', 't-beta'])
    })

    it('compact mode collapses the Change dimension label to an icon-only button', async () => {
      responsiveState.isCompact = true
      await renderView()
      enterDimension('Rank by Importance')

      expect(byFullText('Ranking by Importance')).toBeInTheDocument()
      expect(screen.queryByText('Change dimension')).not.toBeInTheDocument()
    })
  })

  describe('step granularity', () => {
    // Delta workflow with two rankable steps + one completed (filtered out).
    const stepTasks: Task[] = [
      makeTask('t-alpha', 'Alpha Task', { importance: 9 }),
      makeTask('t-beta', 'Beta Task', { importance: 7 }),
      makeTask('w-delta', 'Delta Workflow', { hasSteps: true }),
    ]
    const stepWorkflows: SequencedTask[] = [
      makeWorkflow('w-delta', 'Delta Workflow', {}, [
        makeStep('s1', 'w-delta', 'Design', { importance: 4 }),
        makeStep('s2', 'w-delta', 'Build', { importance: 6 }),
        makeStep('s3', 'w-delta', 'Old', { status: StepStatus.Completed }),
      ]),
    ]

    it('"Split workflows into steps" replaces the workflow with its rankable steps', async () => {
      setStore(stepTasks, stepWorkflows)
      await renderView()
      // Units default: 2 tasks + 1 workflow = 3.
      expect(byFullText('3 items')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Split workflows into steps'))
      await act(async () => {})

      // 2 tasks + 2 rankable steps (completed step excluded) = 4.
      expect(byFullText('4 items')).toBeInTheDocument()
      expect(dbMocks.listComparisons).toHaveBeenLastCalledWith(['t-alpha', 't-beta', 's1', 's2'])
    })

    it('"One workflow\'s steps" prompts for a workflow and disables the sprint scope', async () => {
      setStore(stepTasks, stepWorkflows)
      await renderView()

      fireEvent.click(screen.getByText("One workflow's steps"))
      await act(async () => {})

      // No workflow chosen yet → guidance, no dimension cards, picker shown.
      expect(screen.getByText('Pick a workflow above to rank its steps.')).toBeInTheDocument()
      expect(screen.queryByText('Rank by Importance')).not.toBeInTheDocument()
      expect(screen.getAllByText('Pick a workflow…').length).toBeGreaterThan(0)
      // Scope is irrelevant when ranking a single workflow's steps.
      expect(screen.getByRole('switch')).toBeDisabled()
    })

    it('applies depth-based scores to steps via updateTaskStep and tasks via updateTask', async () => {
      setStore(stepTasks, stepWorkflows)
      // Chain across tasks AND steps in both dimensions:
      // alpha > beta > s2 > s1  → depths 0/1/2/3 over maxDepth 3 → 10/7/4/1.
      dbMocks.listComparisons.mockResolvedValue([
        makeRow('t-alpha', 't-beta', ComparisonType.Priority, 't-alpha'),
        makeRow('t-alpha', 't-beta', ComparisonType.Urgency, 't-alpha'),
        makeRow('t-beta', 's2', ComparisonType.Priority, 't-beta'),
        makeRow('t-beta', 's2', ComparisonType.Urgency, 't-beta'),
        makeRow('s1', 's2', ComparisonType.Priority, 's2'),
        makeRow('s1', 's2', ComparisonType.Urgency, 's2'),
      ])
      await renderView()

      // Split workflows into steps so a step ranks against standalone tasks.
      fireEvent.click(screen.getByText('Split workflows into steps'))
      await act(async () => {})

      fireEvent.click(screen.getByText('Apply Rankings'))
      await waitFor(() => expect(mockUpdateTaskStep).toHaveBeenCalled())

      // Tasks route through updateTask; steps through updateTaskStep(parentId, stepId).
      expect(mockUpdateTask).toHaveBeenCalledWith('t-alpha', { importance: 10, urgency: 10 })
      expect(mockUpdateTask).toHaveBeenCalledWith('t-beta', { importance: 7, urgency: 7 })
      expect(mockUpdateTaskStep).toHaveBeenCalledWith('w-delta', 's2', { importance: 4, urgency: 4 })
      expect(mockUpdateTaskStep).toHaveBeenCalledWith('w-delta', 's1', { importance: 1, urgency: 1 })
      // A split-out step is never persisted as a standalone task/workflow.
      expect(mockUpdateSequencedTask).not.toHaveBeenCalled()
      expect(Message.success).toHaveBeenCalledWith(
        'Updated 4 items with new importance and urgency rankings',
      )
    })
  })
})
