import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Message } from '@arco-design/web-react'
import { TaskSlideshow } from '../TaskSlideshow'
import { Task } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'
import { TaskStatus } from '@shared/enums'

// Mutable store state shared with the vi.mock factory (hoisted)
const storeMocks = vi.hoisted(() => {
  const state = {
    tasks: [] as unknown[],
    sequencedTasks: [] as unknown[],
    updateTask: vi.fn(),
    updateSequencedTask: vi.fn(),
  }
  return { state }
})

vi.mock('../../../store/useTaskStore', () => ({
  useTaskStore: Object.assign(
    vi.fn(() => storeMocks.state),
    { getState: () => storeMocks.state },
  ),
}))

// Mutable responsive state so individual tests can flip compact/mobile modes
const responsiveState = vi.hoisted(() => ({ isCompact: false, isMobile: false }))
vi.mock('../../../providers/ResponsiveProvider', () => ({
  useResponsive: () => responsiveState,
}))

// The minimap is SVG-heavy and tested separately — replace with a marker div
vi.mock('../ComparisonGraphMinimap', async () => {
  const { createElement } = await import('react')
  return {
    ComparisonGraphMinimap: (props: { items: Array<{ id: string; title: string }>; width: number }) =>
      createElement(
        'div',
        { 'data-testid': 'graph-minimap', 'data-width': String(props.width) },
        String(props.items.length),
      ),
  }
})

let idCounter = 0

function makeTask(overrides: Partial<Task> = {}): Task {
  idCounter++
  return {
    id: `task-${idCounter}`,
    name: `Task ${idCounter}`,
    duration: 60,
    importance: 5,
    urgency: 5,
    type: 'focused',
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
    ...overrides,
  }
}

function makeWorkflow(overrides: Partial<Omit<SequencedTask, 'hasSteps' | 'steps'>> = {}): SequencedTask {
  return {
    ...makeTask(),
    ...overrides,
    hasSteps: true,
    steps: [],
  }
}

/**
 * window.addEventListener is globally mocked in src/test/setup.ts, so real
 * keyboard events never reach the component. Grab the most recently
 * registered keydown handler (the freshest effect closure) and invoke it.
 */
function pressKey(key: string): void {
  const addListener = window.addEventListener as unknown as Mock
  const keydownCalls = addListener.mock.calls.filter((call) => call[0] === 'keydown')
  expect(keydownCalls.length).toBeGreaterThan(0)
  const handler = keydownCalls[keydownCalls.length - 1]![1] as (e: KeyboardEvent) => void
  act(() => {
    handler(new KeyboardEvent('keydown', { key }))
  })
}

/** Flush the component's setTimeout(0) recompute inside act(). */
async function flushRecompute(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

function clickButton(text: string | RegExp): void {
  fireEvent.click(screen.getByText(text))
}

describe('TaskSlideshow', () => {
  let onClose: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    idCounter = 0
    responsiveState.isCompact = false
    responsiveState.isMobile = false
    // Make the Fisher-Yates shuffle an identity permutation:
    // j = floor(0.9999 * (i + 1)) === i for every i, so no swaps happen.
    vi.spyOn(Math, 'random').mockReturnValue(0.9999)
    storeMocks.state.tasks = []
    storeMocks.state.sequencedTasks = []
    storeMocks.state.updateTask.mockResolvedValue(undefined)
    storeMocks.state.updateSequencedTask.mockResolvedValue(undefined)
    onClose = vi.fn()
  })

  afterEach(() => {
    vi.mocked(Math.random).mockRestore()
  })

  function renderSlideshow(visible = true) {
    return render(<TaskSlideshow visible={visible} onClose={onClose} />)
  }

  describe('empty and single-item states', () => {
    it('shows the empty state and excludes archived and completed items', () => {
      storeMocks.state.tasks = [
        makeTask({ completed: true, name: 'Done task' }),
        makeTask({ archived: true, name: 'Archived task' }),
      ]
      storeMocks.state.sequencedTasks = [
        makeWorkflow({ archived: true, name: 'Archived workflow' }),
        makeWorkflow({ completed: true, name: 'Done workflow' }),
      ]
      renderSlideshow()

      expect(screen.getByText('No tasks or workflows to display')).toBeInTheDocument()
      expect(screen.getByText('0 items')).toBeInTheDocument()
      expect(screen.queryByText('Done task')).not.toBeInTheDocument()
    })

    it('shows the sprint-specific empty message when sprint-only filters everything out', () => {
      storeMocks.state.tasks = [
        makeTask({ name: 'Alpha' }),
        makeTask({ name: 'Bravo' }),
      ]
      renderSlideshow()

      // Two non-sprint items exist, so we start in the comparison view
      expect(screen.getByText('Pair 1 of 1')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('switch'))

      expect(screen.getByText('No sprint tasks to compare')).toBeInTheDocument()
      expect(screen.getByText('0 items')).toBeInTheDocument()
    })

    it('requires at least two items to compare', () => {
      storeMocks.state.tasks = [makeTask({ name: 'Lonely' })]
      renderSlideshow()

      expect(screen.getByText('Need at least 2 items to compare')).toBeInTheDocument()
      expect(screen.getByText('1 items')).toBeInTheDocument()
    })

    it('shows the sprint variant of the two-item requirement', () => {
      storeMocks.state.tasks = [
        makeTask({ name: 'Sprint item', inActiveSprint: true }),
        makeTask({ name: 'Backlog item' }),
      ]
      renderSlideshow()

      fireEvent.click(screen.getByRole('switch'))

      expect(screen.getByText('Need at least 2 sprint items to compare')).toBeInTheDocument()
    })

    it('shows "No items to compare" when no valid pairs can be formed', () => {
      // Two items with the same id cannot form a pair (id guard in pair creation)
      storeMocks.state.tasks = [
        makeTask({ id: 'dup', name: 'First dup' }),
        makeTask({ id: 'dup', name: 'Second dup' }),
      ]
      renderSlideshow()

      expect(screen.getByText('No items to compare')).toBeInTheDocument()
    })
  })

  describe('comparison pair view', () => {
    it('renders both items with metadata, the importance question, and progress', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha', importance: 7, urgency: 8, duration: 60, notes: 'x'.repeat(120) }),
        makeTask({ id: 'b', name: 'Bravo', importance: 3, urgency: 2, duration: 45 }),
      ]
      renderSlideshow()

      expect(screen.getByText('Pair 1 of 1')).toBeInTheDocument()
      expect(screen.getByText('2 items')).toBeInTheDocument()
      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()
      expect(screen.getByText('Importance = The intrinsic value, impact, or significance of this item')).toBeInTheDocument()

      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Bravo')).toBeInTheDocument()
      expect(screen.getByText('Current Importance: 7/10')).toBeInTheDocument()
      expect(screen.getByText('Current Urgency: 8/10')).toBeInTheDocument()
      expect(screen.getByText('Current Importance: 3/10')).toBeInTheDocument()
      expect(screen.getByText('60 minutes')).toBeInTheDocument()
      expect(screen.getByText('45 minutes')).toBeInTheDocument()

      // Notes truncated to 100 chars with ellipsis
      expect(screen.getByText('x'.repeat(100) + '...')).toBeInTheDocument()

      // Keyboard hint and comparison summary
      expect(screen.getByText('Press 1, 2, or = for equal')).toBeInTheDocument()
      expect(screen.getByText('0 pairs evaluated')).toBeInTheDocument()

      // No minimaps before any comparison is made
      expect(screen.queryAllByTestId('graph-minimap')).toHaveLength(0)

      // With a single pair the navigation buttons are disabled
      expect(screen.getByText('Previous Pair').closest('button')).toBeDisabled()
      expect(screen.getByText('Next Pair').closest('button')).toBeDisabled()

      // Pair tag is blue until transitive recompute kicks in
      expect(screen.getByText('Pair 1 of 1').closest('.arco-tag')!.className).toContain('blue')
    })

    it('deduplicates tasks that mirror a workflow id and labels workflows', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'wf-1', name: 'Mirror of workflow' }),
        makeTask({ id: 't-1', name: 'Plain task' }),
      ]
      storeMocks.state.sequencedTasks = [
        makeWorkflow({ id: 'wf-1', name: 'Build pipeline' }),
      ]
      renderSlideshow()

      // The mirror task is excluded, leaving 2 items: the task and the workflow
      expect(screen.getByText('2 items')).toBeInTheDocument()
      expect(screen.getByText('Plain task')).toBeInTheDocument()
      expect(screen.getByText('Build pipeline')).toBeInTheDocument()
      expect(screen.queryByText('Mirror of workflow')).not.toBeInTheDocument()
      expect(screen.getByText('Workflow')).toBeInTheDocument()
      expect(screen.getByText('Task')).toBeInTheDocument()
    })

    it('moves to the urgency question after answering importance and shows minimaps', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()

      clickButton(/Press "1" for this/)

      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()
      expect(screen.getByText('Urgency = How time-sensitive is this item?')).toBeInTheDocument()
      expect(screen.getByText('1 pairs evaluated')).toBeInTheDocument()
      // Importance + urgency graphs render once at least one comparison exists
      expect(screen.getAllByTestId('graph-minimap')).toHaveLength(2)
    })
  })

  describe('completion view', () => {
    async function completeTwoItemTournament() {
      // Item 1 wins both importance and urgency
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()
    }

    it('shows the completion view with computed rankings after all comparisons', async () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()
      await completeTwoItemTournament()

      expect(Message.success).toHaveBeenCalledWith('Complete! Made 1 comparisons out of 1 possible (saved 0)')
      expect(screen.getByText('Task & Workflow Comparison - Complete!')).toBeInTheDocument()
      expect(screen.getByText('✓ All Comparisons Complete')).toBeInTheDocument()
      expect(screen.getByText('Graph Complete! 🎉')).toBeInTheDocument()
      expect(screen.getByText('1 total comparisons made')).toBeInTheDocument()

      // Winner gets importance 10 / urgency 10 → priority 10.0; loser 1/1 → 0.1
      expect(screen.getByText('10.0')).toBeInTheDocument()
      expect(screen.getByText('0.1')).toBeInTheDocument()
      // Completion view renders both final graphs
      expect(screen.getAllByTestId('graph-minimap')).toHaveLength(2)
    })

    it('applies computed rankings to tasks and workflows then closes', async () => {
      storeMocks.state.tasks = [makeTask({ id: 'a', name: 'Alpha' })]
      storeMocks.state.sequencedTasks = [makeWorkflow({ id: 'b', name: 'Beta workflow' })]
      renderSlideshow()
      await completeTwoItemTournament()

      clickButton('Apply Rankings to Database')
      await act(async () => {
        await Promise.resolve()
      })

      expect(storeMocks.state.updateTask).toHaveBeenCalledWith('a', { importance: 10, urgency: 10 })
      expect(storeMocks.state.updateSequencedTask).toHaveBeenCalledWith('b', { importance: 1, urgency: 1 })
      expect(Message.success).toHaveBeenCalledWith('Updated 2 items with new importance and urgency rankings!')
      expect(onClose).toHaveBeenCalled()
    })

    it('keeps applying when one update fails and reports the reduced count', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()
      await completeTwoItemTournament()

      storeMocks.state.updateTask.mockRejectedValueOnce(new Error('db down'))
      clickButton('Apply Rankings to Database')
      await act(async () => {
        await Promise.resolve()
      })

      expect(consoleSpy).toHaveBeenCalled()
      expect(Message.success).toHaveBeenCalledWith('Updated 1 items with new importance and urgency rankings!')
      expect(onClose).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('starts a fresh session when resetting comparisons', async () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()
      await completeTwoItemTournament()

      clickButton('Start New Comparison Session')

      expect(Message.info).toHaveBeenCalledWith('All comparisons cleared. Starting fresh!')
      expect(screen.getByText('Pair 1 of 1')).toBeInTheDocument()
      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()
      expect(screen.getByText('0 pairs evaluated')).toBeInTheDocument()
    })

    it('closes without applying when requested', async () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()
      await completeTwoItemTournament()

      clickButton('Close Without Applying')

      expect(onClose).toHaveBeenCalled()
      expect(storeMocks.state.updateTask).not.toHaveBeenCalled()
    })

    it('completes when both questions are answered as equal', async () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()

      clickButton(/Press "=" if they are equal/)
      clickButton(/Press "=" if they are equal/)
      await flushRecompute()

      expect(Message.success).toHaveBeenCalledWith('Complete! Made 1 comparisons out of 1 possible (saved 0)')
      expect(screen.getByText('Task & Workflow Comparison - Complete!')).toBeInTheDocument()
    })

    it('finishes early via transitivity and reports the savings', async () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
        makeTask({ id: 'c', name: 'Charlie' }),
      ]
      renderSlideshow()

      // 3 items → 1 initial pair (Alpha vs Bravo); Alpha wins both
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()

      // Two pairs remain (Alpha-Charlie, Bravo-Charlie)
      expect(screen.getByText('Pair 1 of 2')).toBeInTheDocument()
      // Now Charlie beats Alpha → Charlie > Alpha > Bravo, so Bravo-Charlie is inferred
      clickButton(/Press "2" for this/)
      clickButton(/Press "2" for this/)
      await flushRecompute()

      expect(Message.success).toHaveBeenCalledWith('Complete! Made 2 comparisons out of 3 possible (saved 1)')
      expect(screen.getByText('Task & Workflow Comparison - Complete!')).toBeInTheDocument()
    })
  })

  describe('navigation between pairs', () => {
    const fourTasks = () => [
      makeTask({ id: 'a', name: 'Alpha' }),
      makeTask({ id: 'b', name: 'Bravo' }),
      makeTask({ id: 'c', name: 'Charlie' }),
      makeTask({ id: 'd', name: 'Delta' }),
    ]

    it('navigates forward and backward with boundary messages', () => {
      storeMocks.state.tasks = fourTasks()
      renderSlideshow()

      expect(screen.getByText('Pair 1 of 2')).toBeInTheDocument()
      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Bravo')).toBeInTheDocument()

      clickButton('Next Pair')
      expect(screen.getByText('Pair 2 of 2')).toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()
      expect(screen.getByText('Delta')).toBeInTheDocument()

      clickButton('Next Pair')
      expect(Message.info).toHaveBeenCalledWith('This is the last comparison pair. Complete it to see if more are needed.')

      clickButton('Previous Pair')
      expect(screen.getByText('Pair 1 of 2')).toBeInTheDocument()

      clickButton('Previous Pair')
      expect(Message.info).toHaveBeenCalledWith('Already at the first comparison')
    })

    it('returns to the urgency question for a partially answered pair', () => {
      storeMocks.state.tasks = fourTasks()
      renderSlideshow()

      // Answer importance only on pair 1
      clickButton(/Press "1" for this/)
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()

      clickButton('Next Pair')
      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()

      clickButton('Previous Pair')
      // Importance was already answered for pair 1, so it resumes at urgency
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()
    })

    it('recomputes the remaining pairs after a full answer and marks them', async () => {
      storeMocks.state.tasks = fourTasks()
      renderSlideshow()

      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()

      expect(Message.info).toHaveBeenCalledWith('5 comparisons remaining (0 saved by transitivity)')
      expect(screen.getByText('Pair 1 of 5')).toBeInTheDocument()
      // The recomputed queue starts with Alpha vs Charlie
      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()
      expect(screen.queryByText('Bravo')).not.toBeInTheDocument()
      // Missing-pairs mode shows an orange progress tag
      expect(screen.getByText('Pair 1 of 5').closest('.arco-tag')!.className).toContain('orange')
    })
  })

  describe('keyboard shortcuts', () => {
    it('closes on Escape', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()

      pressKey('Escape')
      expect(onClose).toHaveBeenCalled()
    })

    it('shows boundary messages for arrow keys on a single pair', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()

      pressKey('ArrowLeft')
      expect(Message.info).toHaveBeenCalledWith('Already at the first comparison')

      pressKey('ArrowRight')
      expect(Message.info).toHaveBeenCalledWith('This is the last comparison pair. Complete it to see if more are needed.')
    })

    it('answers comparisons with the number keys', async () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      renderSlideshow()

      // Answer importance with a click so the keydown effect re-registers
      // with a fresh closure over the comparison pairs
      clickButton(/Press "1" for this/)
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()

      pressKey('2')
      await flushRecompute()

      expect(Message.success).toHaveBeenCalledWith('Complete! Made 1 comparisons out of 1 possible (saved 0)')
      expect(screen.getByText('Task & Workflow Comparison - Complete!')).toBeInTheDocument()
    })
  })

  describe('reopen and scope changes', () => {
    it('resets to the importance question on reopen and highlights the prior answer', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
      const { rerender } = renderSlideshow()

      clickButton(/Press "1" for this/)
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()

      rerender(<TaskSlideshow visible={false} onClose={onClose} />)
      rerender(<TaskSlideshow visible onClose={onClose} />)

      // Question resets to importance; the saved answer is surfaced
      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()
      expect(screen.getByText('Importance answered')).toBeInTheDocument()
      expect(screen.getByText(/Press "1" for this/).closest('button')!.className).toContain('arco-btn-primary')
      expect(screen.getByText(/Press "2" for this/).closest('button')!.className).not.toContain('arco-btn-primary')

      // Re-answering updates the existing comparison instead of duplicating it
      clickButton(/Press "1" for this/)
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()
      expect(screen.getByText('1 pairs evaluated')).toBeInTheDocument()
    })

    it('resets the tournament when the sprint-only scope changes', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha', inActiveSprint: true }),
        makeTask({ id: 'b', name: 'Bravo', inActiveSprint: true }),
        makeTask({ id: 'c', name: 'Charlie' }),
      ]
      renderSlideshow()

      expect(screen.getByText('3 items')).toBeInTheDocument()
      clickButton(/Press "1" for this/)
      expect(screen.getByText('1 pairs evaluated')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('switch'))

      // Scope change wipes comparisons and rebuilds pairs from sprint items only
      expect(screen.getByText('2 items')).toBeInTheDocument()
      expect(screen.getByText('0 pairs evaluated')).toBeInTheDocument()
      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()
      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Bravo')).toBeInTheDocument()
      expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
    })

    it('applies the sprint filter to workflows too', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 't1', name: 'Sprint task', inActiveSprint: true }),
      ]
      storeMocks.state.sequencedTasks = [
        makeWorkflow({ id: 'w1', name: 'Sprint workflow', inActiveSprint: true }),
        makeWorkflow({ id: 'w2', name: 'Backlog workflow' }),
      ]
      renderSlideshow()

      expect(screen.getByText('3 items')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('switch'))

      expect(screen.getByText('2 items')).toBeInTheDocument()
      expect(screen.getByText('Sprint task')).toBeInTheDocument()
      expect(screen.getByText('Sprint workflow')).toBeInTheDocument()
      expect(screen.queryByText('Backlog workflow')).not.toBeInTheDocument()
    })
  })

  describe('re-answering with multiple stored comparisons', () => {
    it('finds the partial pair among others and updates only the matching comparison', async () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
        makeTask({ id: 'c', name: 'Charlie' }),
        makeTask({ id: 'd', name: 'Delta' }),
      ]
      const { rerender } = renderSlideshow()

      // Complete pair (Alpha, Bravo), then answer importance only on (Alpha, Charlie)
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()
      clickButton(/Press "1" for this/)
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()

      // Forward to (Alpha, Delta), then back: the lookup scans the
      // non-matching (Alpha, Bravo) comparison before resuming at urgency
      clickButton('Next Pair')
      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()
      clickButton('Previous Pair')
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()

      // Reopen resets to the importance question on (Alpha, Charlie)
      rerender(<TaskSlideshow visible={false} onClose={onClose} />)
      rerender(<TaskSlideshow visible onClose={onClose} />)
      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()
      expect(screen.getByText('Importance answered')).toBeInTheDocument()

      // Re-answer importance the other way: the existing (Alpha, Charlie)
      // comparison is updated in place; (Alpha, Bravo) is left untouched
      clickButton(/Press "2" for this/)
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()
      expect(screen.getByText('2 pairs evaluated')).toBeInTheDocument()

      // Reopen once more: the importance question now surfaces the UPDATED
      // answer (item 2), proving the in-place update replaced the old one
      rerender(<TaskSlideshow visible={false} onClose={onClose} />)
      rerender(<TaskSlideshow visible onClose={onClose} />)
      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()
      expect(screen.getByText(/Press "2" for this/).closest('button')!.className).toContain('arco-btn-primary')
      expect(screen.getByText(/Press "1" for this/).closest('button')!.className).not.toContain('arco-btn-primary')
    })
  })

  describe('workflow data without task ranking fields', () => {
    it('still renders names and skips the current-rankings block', async () => {
      // A projection lacking importance/urgency exercises the SequencedTask
      // branch of the isRegularTask type guard everywhere names are derived
      const { importance: _importance, urgency: _urgency, ...leanWorkflow } =
        makeWorkflow({ id: 'w-lean', name: 'Lean workflow' })
      storeMocks.state.tasks = [makeTask({ id: 'a', name: 'Alpha', importance: 7, urgency: 8 })]
      storeMocks.state.sequencedTasks = [leanWorkflow]
      renderSlideshow()

      expect(screen.getByText('Lean workflow')).toBeInTheDocument()
      // Only the regular task shows its current rankings
      expect(screen.getByText('Current Importance: 7/10')).toBeInTheDocument()
      expect(screen.queryByText('Current Importance: 5/10')).not.toBeInTheDocument()

      // Complete the tournament: minimaps and the rankings table both derive
      // the workflow title through the non-task branch
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()

      expect(screen.getByText('Task & Workflow Comparison - Complete!')).toBeInTheDocument()
      const rows = screen.getAllByRole('row')
      expect(rows.some(row => row.textContent?.includes('Lean workflow'))).toBe(true)
      expect(screen.getAllByTestId('graph-minimap')).toHaveLength(2)
    })
  })

  describe('cycle detection warnings', () => {
    const fourTasks = () => [
      makeTask({ id: 'a', name: 'Alpha' }),
      makeTask({ id: 'b', name: 'Bravo' }),
      makeTask({ id: 'c', name: 'Charlie' }),
      makeTask({ id: 'd', name: 'Delta' }),
    ]

    it('warns when an answer creates a circular importance relationship', async () => {
      storeMocks.state.tasks = fourTasks()
      renderSlideshow()

      // Pair (Alpha, Bravo): Alpha wins importance and urgency
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()

      // Pair (Alpha, Charlie): Charlie wins importance, Alpha wins urgency.
      // Importance now infers Charlie > Alpha > Bravo, but (Bravo, Charlie)
      // is still asked because their URGENCY relationship is unknown.
      clickButton(/Press "2" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()

      expect(screen.getByText('Pair 1 of 4')).toBeInTheDocument()
      clickButton('Next Pair')
      expect(screen.getByText('Bravo')).toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()

      // Answering Bravo > Charlie contradicts the transitive importance chain
      clickButton(/Press "1" for this/)

      expect(Message.warning).toHaveBeenCalledTimes(1)
      expect(Message.warning).toHaveBeenCalledWith(
        expect.stringContaining('circular importance relationship'),
      )
      // The answer is still recorded and the flow moves on to urgency
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()
    })

    it('warns when an answer creates a circular urgency relationship', async () => {
      storeMocks.state.tasks = fourTasks()
      renderSlideshow()

      // Pair (Alpha, Bravo): Alpha wins both
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()

      // Pair (Alpha, Charlie): Alpha wins importance, Charlie wins urgency.
      // Urgency now infers Charlie > Alpha > Bravo, but (Bravo, Charlie) is
      // still asked because their IMPORTANCE relationship is unknown.
      clickButton(/Press "1" for this/)
      clickButton(/Press "2" for this/)
      await flushRecompute()

      clickButton('Next Pair')
      expect(screen.getByText('Bravo')).toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()

      // Importance answer is consistent (no warning)
      clickButton(/Press "2" for this/)
      expect(Message.warning).not.toHaveBeenCalled()

      // Urgency answer Bravo > Charlie contradicts Charlie > Alpha > Bravo
      clickButton(/Press "1" for this/)
      await flushRecompute()

      expect(Message.warning).toHaveBeenCalledTimes(1)
      expect(Message.warning).toHaveBeenCalledWith(
        expect.stringContaining('circular urgency relationship'),
      )
    })
  })

  describe('item card details', () => {
    it('falls back to zero duration and renders short notes without truncation', () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha', duration: 0 }),
        makeTask({ id: 'b', name: 'Bravo', duration: 45, notes: 'Short note' }),
      ]
      renderSlideshow()

      expect(screen.getByText('0 minutes')).toBeInTheDocument()
      expect(screen.getByText('45 minutes')).toBeInTheDocument()
      // Item B notes under 100 chars render verbatim, no ellipsis
      expect(screen.getByText('Short note')).toBeInTheDocument()
      expect(screen.queryByText('Short note...')).not.toBeInTheDocument()
    })
  })

  describe('completion ranking tiers', () => {
    it('colors the ranking tags by score thresholds', async () => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
        makeTask({ id: 'c', name: 'Charlie' }),
      ]
      renderSlideshow()

      // Alpha > Bravo, then Alpha > Charlie, then Bravo > Charlie (both dims)
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()
      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()

      expect(screen.getByText('Task & Workflow Comparison - Complete!')).toBeInTheDocument()

      // Alpha 10/10 → red tags; Bravo 6/6 → orange; Charlie 1/1 → green
      const tens = screen.getAllByText('10')
      expect(tens).toHaveLength(2)
      tens.forEach(tag => expect(tag.closest('.arco-tag')!.className).toContain('red'))

      const sixes = screen.getAllByText('6')
      expect(sixes).toHaveLength(2)
      sixes.forEach(tag => expect(tag.closest('.arco-tag')!.className).toContain('orange'))

      const ones = screen.getAllByText('1')
      expect(ones).toHaveLength(2)
      ones.forEach(tag => expect(tag.closest('.arco-tag')!.className).toContain('green'))

      // Priority column: 10.0 → red, 3.6 (6×6÷10) → green, 0.1 → green
      expect(screen.getByText('10.0').closest('.arco-tag')!.className).toContain('red')
      expect(screen.getByText('3.6').closest('.arco-tag')!.className).toContain('green')
      expect(screen.getByText('0.1').closest('.arco-tag')!.className).toContain('green')
    })
  })

  describe('keyboard answer keys', () => {
    beforeEach(() => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
    })

    it('ignores answer keys before any interaction refreshes the listener', () => {
      renderSlideshow()

      // The mount-time listener closed over an empty pair list (pairs are
      // created by an effect that does not re-register the keydown handler),
      // so the very first "1" press is a no-op.
      pressKey('1')

      expect(screen.getByText('Which item has higher IMPORTANCE?')).toBeInTheDocument()
      expect(screen.getByText('0 pairs evaluated')).toBeInTheDocument()
    })

    it('answers the urgency question with the "1" key', async () => {
      renderSlideshow()

      clickButton(/Press "1" for this/)
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()

      pressKey('1')
      await flushRecompute()

      expect(Message.success).toHaveBeenCalledWith('Complete! Made 1 comparisons out of 1 possible (saved 0)')
      expect(screen.getByText('Task & Workflow Comparison - Complete!')).toBeInTheDocument()
    })

    it('marks items equal with the "=" key', async () => {
      renderSlideshow()

      clickButton(/Press "=" if they are equal/)
      expect(screen.getByText('Which item has higher URGENCY?')).toBeInTheDocument()

      pressKey('=')
      await flushRecompute()

      expect(Message.success).toHaveBeenCalledWith('Complete! Made 1 comparisons out of 1 possible (saved 0)')
      expect(screen.getByText('Task & Workflow Comparison - Complete!')).toBeInTheDocument()
    })

    it('does not register a keydown listener while hidden', () => {
      renderSlideshow(false)

      const addListener = window.addEventListener as unknown as Mock
      const keydownCalls = addListener.mock.calls.filter((call) => call[0] === 'keydown')
      expect(keydownCalls).toHaveLength(0)
    })
  })

  describe('responsive layout', () => {
    beforeEach(() => {
      storeMocks.state.tasks = [
        makeTask({ id: 'a', name: 'Alpha' }),
        makeTask({ id: 'b', name: 'Bravo' }),
      ]
    })

    function modalElement(): HTMLElement {
      const modal = document.querySelector('.arco-modal')
      expect(modal).not.toBeNull()
      return modal as HTMLElement
    }

    it('uses fixed desktop sizing by default', () => {
      renderSlideshow()

      expect(modalElement().style.width).toBe('1200px')
      expect(modalElement().style.maxWidth).toBe('90vw')
    })

    it('uses near-full viewport width and smaller minimaps in compact mode', () => {
      responsiveState.isCompact = true
      renderSlideshow()

      expect(modalElement().style.width).toBe('98vw')

      clickButton(/Press "1" for this/)
      const maps = screen.getAllByTestId('graph-minimap')
      expect(maps).toHaveLength(2)
      maps.forEach(map => expect(map).toHaveAttribute('data-width', '280'))
    })

    it('uses 95vw width on mobile (non-compact)', () => {
      responsiveState.isMobile = true
      renderSlideshow()

      expect(modalElement().style.width).toBe('95vw')
    })

    it('sizes the completion graphs for compact screens', async () => {
      responsiveState.isCompact = true
      renderSlideshow()

      clickButton(/Press "1" for this/)
      clickButton(/Press "1" for this/)
      await flushRecompute()

      const maps = screen.getAllByTestId('graph-minimap')
      expect(maps).toHaveLength(2)
      maps.forEach(map => expect(map).toHaveAttribute('data-width', '350'))
    })
  })
})
