import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { EndeavorDetail } from '../EndeavorDetail'
import { useEndeavorStore } from '../../../store/useEndeavorStore'
import { useTaskStore } from '../../../store/useTaskStore'
import { Message } from '../../common/Message'
import { EndeavorStatus, TaskStatus, StepStatus } from '@shared/enums'
import type {
  EndeavorWithTasks,
  EndeavorItem,
  EndeavorDependencyWithNames,
  Task,
  TaskStep,
} from '@shared/types'

// Hoisted db mock so the factory below can reference it
const mockDb = vi.hoisted(() => ({
  getEndeavorById: vi.fn(),
  getCrossEndeavorDependencies: vi.fn(),
}))

vi.mock('../../../services/database', () => ({
  getDatabase: () => mockDb,
}))

vi.mock('../../../store/useEndeavorStore')
vi.mock('../../../store/useTaskStore')

vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Lightweight stand-in for the dependency modal so we can verify the
// props the component drives it with, and exercise the onClose reload path.
vi.mock('../AddDependencyModal', () => ({
  AddDependencyModal: ({
    visible,
    onClose,
    preselectedBlockedTaskId,
  }: {
    visible: boolean
    onClose: () => void
    endeavorId: string
    preselectedBlockedTaskId?: string
  }) =>
    visible ? (
      <div data-testid="add-dep-modal">
        <span data-testid="preselected-task">{preselectedBlockedTaskId ?? 'none'}</span>
        <button onClick={onClose}>close-dep-modal</button>
      </div>
    ) : null,
}))

const ENDEAVOR_ID = 'end-1'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'Write spec',
    duration: 60,
    type: 'focused',
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
    ...overrides,
  }
}

function makeStep(overrides: Partial<TaskStep> = {}): TaskStep {
  return {
    id: 'step-1',
    name: 'A step',
    duration: 30,
    type: 'focused',
    taskId: 'task-wf',
    dependsOn: [],
    asyncWaitTime: 0,
    status: StepStatus.Pending,
    stepIndex: 0,
    percentComplete: 0,
    ...overrides,
  }
}

function makeItem(task: Task, sortOrder = 0): EndeavorItem & { task: Task } {
  return {
    id: `item-${task.id}`,
    endeavorId: ENDEAVOR_ID,
    taskId: task.id,
    sortOrder,
    addedAt: new Date('2026-01-02T00:00:00Z'),
    task,
  }
}

function makeEndeavor(overrides: Partial<EndeavorWithTasks> = {}): EndeavorWithTasks {
  return {
    id: ENDEAVOR_ID,
    name: 'Ship the port',
    description: 'Get everything across the line',
    status: EndeavorStatus.Active,
    importance: 7,
    urgency: 6,
    color: '#ff5722',
    sessionId: 'session-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    items: [],
    ...overrides,
  }
}

function makeDep(overrides: Partial<EndeavorDependencyWithNames> = {}): EndeavorDependencyWithNames {
  return {
    id: 'dep-1',
    endeavorId: ENDEAVOR_ID,
    blockedTaskId: 'task-wf',
    blockingStepId: 'step-blocking',
    blockingTaskId: 'task-backend',
    isHardBlock: true,
    createdAt: new Date('2026-01-03T00:00:00Z'),
    blockedTaskName: 'Blocked workflow',
    blockingStepName: 'Finish API',
    blockingTaskName: 'Backend work',
    blockingStepStatus: StepStatus.Pending,
    ...overrides,
  }
}

const mockAddTaskToEndeavor = vi.fn()
const mockRemoveTaskFromEndeavor = vi.fn()
const mockLoadDependencies = vi.fn()
const mockRemoveDependency = vi.fn()

const mockUseEndeavorStore = useEndeavorStore as unknown as Mock
const mockUseTaskStore = useTaskStore as unknown as Mock

const emptyCrossDeps = { dependencies: [], blockingEndeavors: [] }

function setTasks(tasks: Task[]): void {
  mockUseTaskStore.mockReturnValue({ tasks })
}

interface RenderOptions {
  onBack?: () => void
  onOpenInWhiteboard?: (endeavorId: string) => void
}

function renderDetail({ onBack = vi.fn(), onOpenInWhiteboard }: RenderOptions = {}) {
  return render(
    <EndeavorDetail
      endeavorId={ENDEAVOR_ID}
      onBack={onBack}
      onOpenInWhiteboard={onOpenInWhiteboard}
    />,
  )
}

async function renderLoaded(options: RenderOptions = {}) {
  const result = renderDetail(options)
  await waitFor(() => {
    expect(document.querySelector('.arco-spin')).not.toBeInTheDocument()
  })
  return result
}

// Arco's Select VirtualList reads padding/margin values off getComputedStyle and
// calls .replace on them — the global setup mock omits those fields, so any string
// property must resolve to a CSS-like string here.
beforeAll(() => {
  const namedValues: Record<string, string> = { fontSize: '14px', lineHeight: '1.5' }
  Object.defineProperty(window, 'getComputedStyle', {
    writable: true,
    value: () =>
      new Proxy(
        {},
        {
          get: (_target, prop: string | symbol) => {
            if (prop === 'getPropertyValue') return () => '0'
            if (typeof prop === 'string' && prop in namedValues) return namedValues[prop]
            return '0'
          },
        },
      ),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.getEndeavorById.mockResolvedValue(makeEndeavor())
  mockDb.getCrossEndeavorDependencies.mockResolvedValue(emptyCrossDeps)
  mockLoadDependencies.mockResolvedValue([])
  mockUseEndeavorStore.mockReturnValue({
    addTaskToEndeavor: mockAddTaskToEndeavor,
    removeTaskFromEndeavor: mockRemoveTaskFromEndeavor,
    loadDependencies: mockLoadDependencies,
    removeDependency: mockRemoveDependency,
  })
  setTasks([])
})

describe('EndeavorDetail — loading and error states', () => {
  it('shows a spinner while loading, then the content', async () => {
    let resolveEndeavor!: (value: EndeavorWithTasks | null) => void
    mockDb.getEndeavorById.mockReturnValue(
      new Promise<EndeavorWithTasks | null>((resolve) => {
        resolveEndeavor = resolve
      }),
    )

    renderDetail()
    expect(document.querySelector('.arco-spin')).toBeInTheDocument()
    expect(screen.queryByText('Ship the port')).not.toBeInTheDocument()

    resolveEndeavor(makeEndeavor())
    expect(await screen.findByText('Ship the port')).toBeInTheDocument()
    expect(document.querySelector('.arco-spin')).not.toBeInTheDocument()
  })

  it('shows "Endeavor not found" with a working Go Back button when the endeavor is missing', async () => {
    mockDb.getEndeavorById.mockResolvedValue(null)
    const onBack = vi.fn()

    await renderLoaded({ onBack })

    expect(screen.getByText('Endeavor not found')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Go Back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('surfaces a load failure via Message.error with the error message', async () => {
    mockDb.getEndeavorById.mockRejectedValue(new Error('db exploded'))

    await renderLoaded()

    expect(Message.error).toHaveBeenCalledWith('Failed to load endeavor: db exploded')
    // Falls back to the not-found view since nothing loaded
    expect(screen.getByText('Endeavor not found')).toBeInTheDocument()
  })

  it('uses "Unknown error" when the load failure is not an Error instance', async () => {
    mockDb.getCrossEndeavorDependencies.mockRejectedValue('nope')

    await renderLoaded()

    expect(Message.error).toHaveBeenCalledWith('Failed to load endeavor: Unknown error')
  })
})

describe('EndeavorDetail — header', () => {
  it('renders name, description, color bar, status tag, and wires the back button', async () => {
    const onBack = vi.fn()
    const { container } = await renderLoaded({ onBack })

    expect(screen.getByText('Ship the port')).toBeInTheDocument()
    expect(screen.getByText('Get everything across the line')).toBeInTheDocument()

    const statusTag = screen.getByText(EndeavorStatus.Active).closest('.arco-tag')
    expect(statusTag?.className).toContain('arco-tag-arcoblue')

    const colorBar = container.querySelector('div[style*="rgb(255, 87, 34)"]')
    expect(colorBar).toBeTruthy()

    // First text button in the header is the back arrow
    const backButton = container.querySelector('button.arco-btn-text')
    expect(backButton).toBeTruthy()
    fireEvent.click(backButton as HTMLButtonElement)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('maps paused status to an orange tag', async () => {
    mockDb.getEndeavorById.mockResolvedValue(makeEndeavor({ status: EndeavorStatus.Paused }))

    await renderLoaded()

    const statusTag = screen.getByText(EndeavorStatus.Paused).closest('.arco-tag')
    expect(statusTag?.className).toContain('arco-tag-orange')
  })

  it('shows the Whiteboard button only when onOpenInWhiteboard is provided, and calls it with the endeavor id', async () => {
    const onOpenInWhiteboard = vi.fn()
    const { unmount } = await renderLoaded({ onOpenInWhiteboard })

    fireEvent.click(screen.getByText('Whiteboard'))
    expect(onOpenInWhiteboard).toHaveBeenCalledWith(ENDEAVOR_ID)

    unmount()
    await renderLoaded()
    expect(screen.queryByText('Whiteboard')).not.toBeInTheDocument()
  })
})

describe('EndeavorDetail — progress', () => {
  it('derives progress from the endeavor items (counts, minutes, percent, in-progress tag)', async () => {
    const completed = makeTask({
      id: 'task-done',
      name: 'Done task',
      duration: 60,
      actualDuration: 50,
      completed: true,
      overallStatus: TaskStatus.Completed,
    })
    const workflow = makeTask({
      id: 'task-wf',
      name: 'Active workflow',
      duration: 90,
      hasSteps: true,
      overallStatus: TaskStatus.InProgress,
      steps: [
        makeStep({ id: 'step-done', status: StepStatus.Completed, actualDuration: 30 }),
        makeStep({ id: 'step-pending', status: StepStatus.Pending }),
      ],
    })
    const untouched = makeTask({ id: 'task-fresh', name: 'Fresh task', duration: 50 })
    mockDb.getEndeavorById.mockResolvedValue(
      makeEndeavor({ items: [makeItem(completed, 0), makeItem(workflow, 1), makeItem(untouched, 2)] }),
    )

    await renderLoaded()

    expect(screen.getByText('1/3 tasks completed')).toBeInTheDocument()
    // completedDuration = 50 (actual) + 30 (completed step) = 80 of 200 total
    expect(screen.getByText('80 / 200 minutes')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('1 in progress')).toBeInTheDocument()
  })

  it('omits the in-progress tag when nothing is in progress', async () => {
    mockDb.getEndeavorById.mockResolvedValue(
      makeEndeavor({ items: [makeItem(makeTask({ id: 't1', name: 'Only task' }))] }),
    )

    await renderLoaded()

    expect(screen.getByText('0/1 tasks completed')).toBeInTheDocument()
    expect(screen.queryByText(/in progress/)).not.toBeInTheDocument()
  })
})

describe('EndeavorDetail — cross-endeavor blocking alert', () => {
  it('lists blocking endeavors with pluralized task counts', async () => {
    mockDb.getCrossEndeavorDependencies.mockResolvedValue({
      dependencies: [],
      blockingEndeavors: [
        { endeavorId: 'end-2', endeavorName: 'Backend rewrite', blockingTaskCount: 2 },
        { endeavorId: 'end-3', endeavorName: 'Design pass', blockingTaskCount: 1 },
      ],
    })

    const { container } = await renderLoaded()

    expect(screen.getByText('Blocked by other endeavors')).toBeInTheDocument()
    expect(screen.getByText('Backend rewrite')).toBeInTheDocument()
    expect(screen.getByText('Design pass')).toBeInTheDocument()

    const listItems = Array.from(container.querySelectorAll('.arco-alert li'))
    expect(listItems.map((li) => li.textContent)).toEqual([
      'Backend rewrite (2 blocking tasks)',
      'Design pass (1 blocking task)',
    ])
  })

  it('renders no alert when there are no blocking endeavors', async () => {
    await renderLoaded()
    expect(screen.queryByText('Blocked by other endeavors')).not.toBeInTheDocument()
  })
})

describe('EndeavorDetail — step dependencies section', () => {
  it('renders hard and soft blocks with the right labels, statuses, and notes', async () => {
    mockLoadDependencies.mockResolvedValue([
      makeDep({
        id: 'dep-hard',
        blockedTaskId: 'task-wf',
        blockedTaskName: 'Blocked workflow',
        isHardBlock: true,
        blockingStepStatus: StepStatus.Pending,
        blockingEndeavorName: 'Other endeavor',
        notes: 'API must land first',
      }),
      makeDep({
        id: 'dep-soft',
        blockedTaskId: undefined,
        blockedTaskName: undefined,
        blockedStepId: 'step-z',
        blockedStepName: 'Polish step',
        isHardBlock: false,
        blockingStepName: 'Review done',
        blockingStepStatus: StepStatus.Completed,
      }),
    ])

    await renderLoaded()

    // Section header tag is red because a hard block is still pending
    const countTag = screen.getByText('2 defined').closest('.arco-tag')
    expect(countTag?.className).toContain('arco-tag-red')

    // Hard block row: blocked workflow name + (Workflow) label + pending blocking step
    expect(screen.getByText('Blocked workflow')).toBeInTheDocument()
    expect(screen.getByText('(Workflow)')).toBeInTheDocument()
    const blockingTag = screen.getByText('Finish API').closest('.arco-tag')
    expect(blockingTag?.className).toContain('arco-tag-orange')
    expect(screen.getByText('Note: API must land first')).toBeInTheDocument()
    expect(screen.getByText(/Other endeavor/)).toBeInTheDocument()

    // Soft block row: blocked step name + (Step) label + satisfied (green) blocking step
    expect(screen.getByText('Polish step')).toBeInTheDocument()
    expect(screen.getByText('(Step)')).toBeInTheDocument()
    const satisfiedTag = screen.getByText('Review done').closest('.arco-tag')
    expect(satisfiedTag?.className).toContain('arco-tag-green')

    expect(screen.getAllByText(/from “Backend work”/)).toHaveLength(2)
  })

  it('shows a green count tag when every hard block is satisfied, and "Unknown" for unnamed blocked items', async () => {
    mockLoadDependencies.mockResolvedValue([
      makeDep({
        id: 'dep-ok',
        blockedTaskId: undefined,
        blockedTaskName: undefined,
        blockedStepName: undefined,
        blockingStepStatus: StepStatus.Completed,
      }),
    ])

    await renderLoaded()

    const countTag = screen.getByText('1 defined').closest('.arco-tag')
    expect(countTag?.className).toContain('arco-tag-green')
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByText('(Step)')).toBeInTheDocument()
  })

  it('hides the section entirely when there are no dependencies', async () => {
    await renderLoaded()
    expect(screen.queryByText('Step Dependencies')).not.toBeInTheDocument()
  })

  it('removes a dependency after Popconfirm, reloads, and shows success', async () => {
    mockLoadDependencies
      .mockResolvedValueOnce([makeDep({ id: 'dep-1' })]) // initial load
      .mockResolvedValueOnce([]) // reload after removal
    mockRemoveDependency.mockResolvedValue(undefined)

    await renderLoaded()
    expect(screen.getByText('Step Dependencies')).toBeInTheDocument()

    // The only list-item action in the deps section is the delete button
    const depsList = document.querySelector('.arco-list')
    expect(depsList).toBeTruthy()
    const deleteButton = within(depsList as HTMLElement).getByRole('button')
    fireEvent.click(deleteButton)

    expect(await screen.findByText('Remove this dependency?')).toBeInTheDocument()
    const popconfirm = document.querySelector('.arco-popconfirm')
    const okButton = (popconfirm as HTMLElement).querySelector('button.arco-btn-primary')
    fireEvent.click(okButton as HTMLButtonElement)

    await waitFor(() => {
      expect(mockRemoveDependency).toHaveBeenCalledWith('dep-1', ENDEAVOR_ID)
    })
    expect(Message.success).toHaveBeenCalledWith('Dependency removed')
    await waitFor(() => {
      expect(screen.queryByText('Step Dependencies')).not.toBeInTheDocument()
    })
  })

  it('reports a failure to remove a dependency', async () => {
    mockLoadDependencies.mockResolvedValue([makeDep({ id: 'dep-1' })])
    mockRemoveDependency.mockRejectedValue(new Error('locked'))

    await renderLoaded()

    const depsList = document.querySelector('.arco-list')
    fireEvent.click(within(depsList as HTMLElement).getByRole('button'))
    const popconfirm = await waitFor(() => {
      const el = document.querySelector('.arco-popconfirm')
      expect(el).toBeTruthy()
      return el as HTMLElement
    })
    fireEvent.click(popconfirm.querySelector('button.arco-btn-primary') as HTMLButtonElement)

    await waitFor(() => {
      expect(Message.error).toHaveBeenCalledWith('Failed to remove dependency: locked')
    })
    // List is unchanged
    expect(screen.getByText('Step Dependencies')).toBeInTheDocument()
  })
})

describe('EndeavorDetail — task list', () => {
  it('shows the empty state when the endeavor has no items', async () => {
    await renderLoaded()
    expect(
      screen.getByText('No tasks added yet. Add tasks to track progress.'),
    ).toBeInTheDocument()
  })

  it('renders task rows with status, workflow, cross-dep, blocked, and satisfied tags', async () => {
    const deadline = new Date('2026-07-01T12:00:00')
    const plainTask = makeTask({
      id: 'task-plain',
      name: 'Plain task',
      duration: 45,
      deadline,
      overallStatus: TaskStatus.InProgress,
    })
    const blockedWorkflow = makeTask({
      id: 'task-wf',
      name: 'Hard workflow',
      hasSteps: true,
      overallStatus: TaskStatus.NotStarted,
      steps: [makeStep({ id: 's1' }), makeStep({ id: 's2', stepIndex: 1 })],
    })
    const satisfiedWorkflow = makeTask({
      id: 'task-sat',
      name: 'Satisfied workflow',
      hasSteps: true,
      overallStatus: TaskStatus.Waiting,
      steps: [makeStep({ id: 'step-sat', taskId: 'task-sat' })],
    })
    setTasks([plainTask, blockedWorkflow, satisfiedWorkflow])
    mockDb.getEndeavorById.mockResolvedValue(
      makeEndeavor({
        items: [makeItem(plainTask, 0), makeItem(blockedWorkflow, 1), makeItem(satisfiedWorkflow, 2)],
      }),
    )
    mockDb.getCrossEndeavorDependencies.mockResolvedValue({
      dependencies: [
        {
          taskId: 'task-plain',
          taskName: 'Plain task',
          dependencies: [
            {
              dependencyId: 'd1',
              dependencyName: 'Upstream',
              endeavorId: 'end-2',
              endeavorName: 'Other',
              isCompleted: false,
            },
          ],
        },
      ],
      blockingEndeavors: [],
    })
    mockLoadDependencies.mockResolvedValue([
      // Hard, unsatisfied → "Blocked" on task-wf (matched via blockedTaskId)
      makeDep({ id: 'dep-hard', blockedTaskId: 'task-wf', blockingStepStatus: StepStatus.Pending }),
      // Satisfied, matched via blockedStepId belonging to task-sat's steps
      makeDep({
        id: 'dep-sat',
        blockedTaskId: undefined,
        blockedTaskName: undefined,
        blockedStepId: 'step-sat',
        blockedStepName: 'Sat step',
        isHardBlock: false,
        blockingStepStatus: StepStatus.Completed,
      }),
    ])

    await renderLoaded()

    // Status text has underscores replaced
    expect(screen.getByText('in progress')).toBeInTheDocument()
    expect(screen.getAllByText('not started').length).toBeGreaterThanOrEqual(1)

    // Workflow tag with step count
    expect(screen.getByText('Workflow (2 steps)')).toBeInTheDocument()
    expect(screen.getByText('Workflow (1 steps)')).toBeInTheDocument()

    // Cross-endeavor tag only on the plain task's row
    const plainRow = screen.getByText('Plain task').closest('.arco-list-item') as HTMLElement
    expect(within(plainRow).getByText('Cross-endeavor deps')).toBeInTheDocument()

    // Blocked tag on the hard-blocked workflow
    const blockedRow = screen.getByText('Hard workflow').closest('.arco-list-item') as HTMLElement
    expect(within(blockedRow).getByText('Blocked')).toBeInTheDocument()

    // Satisfied tag (singular) on the workflow whose step dep is completed
    const satRow = screen.getByText('Satisfied workflow').closest('.arco-list-item') as HTMLElement
    expect(within(satRow).getByText('1 dep satisfied')).toBeInTheDocument()

    // Description: duration + locale-formatted deadline
    expect(
      screen.getByText(`45 min | Due: ${deadline.toLocaleDateString()}`),
    ).toBeInTheDocument()
    expect(within(blockedRow).getByText('60 min')).toBeInTheDocument()
  })

  it('removes a task, reloads the endeavor, and shows success', async () => {
    const task = makeTask({ id: 'task-plain', name: 'Plain task' })
    mockDb.getEndeavorById
      .mockResolvedValueOnce(makeEndeavor({ items: [makeItem(task)] }))
      .mockResolvedValueOnce(makeEndeavor({ items: [] }))
    mockRemoveTaskFromEndeavor.mockResolvedValue(undefined)

    await renderLoaded()

    const row = screen.getByText('Plain task').closest('.arco-list-item') as HTMLElement
    // A non-workflow task has exactly one action: the remove button
    fireEvent.click(within(row).getByRole('button'))

    await waitFor(() => {
      expect(mockRemoveTaskFromEndeavor).toHaveBeenCalledWith(ENDEAVOR_ID, 'task-plain')
    })
    expect(Message.success).toHaveBeenCalledWith('Task removed from endeavor')
    await waitFor(() => {
      expect(screen.queryByText('Plain task')).not.toBeInTheDocument()
    })
    expect(
      screen.getByText('No tasks added yet. Add tasks to track progress.'),
    ).toBeInTheDocument()
  })

  it('reports a failure to remove a task and keeps the row', async () => {
    const task = makeTask({ id: 'task-plain', name: 'Plain task' })
    mockDb.getEndeavorById.mockResolvedValue(makeEndeavor({ items: [makeItem(task)] }))
    mockRemoveTaskFromEndeavor.mockRejectedValue(new Error('nope'))

    await renderLoaded()

    const row = screen.getByText('Plain task').closest('.arco-list-item') as HTMLElement
    fireEvent.click(within(row).getByRole('button'))

    await waitFor(() => {
      expect(Message.error).toHaveBeenCalledWith('Failed to remove task: nope')
    })
    expect(screen.getByText('Plain task')).toBeInTheDocument()
  })
})

describe('EndeavorDetail — dependency modal wiring', () => {
  it('opens the dependency modal without preselection from the header button', async () => {
    await renderLoaded()

    expect(screen.queryByTestId('add-dep-modal')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Add Dependency'))

    expect(screen.getByTestId('add-dep-modal')).toBeInTheDocument()
    expect(screen.getByTestId('preselected-task')).toHaveTextContent('none')
  })

  it('opens the dependency modal preselected for a workflow row, and only workflows get the action', async () => {
    const workflow = makeTask({
      id: 'task-wf',
      name: 'A workflow',
      hasSteps: true,
      steps: [makeStep({ id: 's1' })],
    })
    const plain = makeTask({ id: 'task-plain', name: 'Plain task' })
    mockDb.getEndeavorById.mockResolvedValue(
      makeEndeavor({ items: [makeItem(workflow, 0), makeItem(plain, 1)] }),
    )

    await renderLoaded()

    const wfRow = screen.getByText('A workflow').closest('.arco-list-item') as HTMLElement
    const plainRow = screen.getByText('Plain task').closest('.arco-list-item') as HTMLElement
    expect(within(wfRow).getAllByRole('button')).toHaveLength(2)
    expect(within(plainRow).getAllByRole('button')).toHaveLength(1)

    // First action on a workflow row is the add-dependency link button
    fireEvent.click(within(wfRow).getAllByRole('button')[0])
    expect(screen.getByTestId('preselected-task')).toHaveTextContent('task-wf')
  })

  it('reloads dependencies when the modal closes', async () => {
    mockLoadDependencies
      .mockResolvedValueOnce([]) // initial load: no deps section
      .mockResolvedValueOnce([makeDep({ id: 'dep-new' })]) // reload after close

    await renderLoaded()
    expect(screen.queryByText('Step Dependencies')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Add Dependency'))
    fireEvent.click(screen.getByText('close-dep-modal'))

    expect(await screen.findByText('Step Dependencies')).toBeInTheDocument()
    expect(screen.getByText('1 defined')).toBeInTheDocument()
    expect(screen.queryByTestId('add-dep-modal')).not.toBeInTheDocument()
  })
})

describe('EndeavorDetail — add task modal', () => {
  it('only offers tasks that are not in the endeavor and not archived', async () => {
    const inEndeavor = makeTask({ id: 'task-in', name: 'Already in' })
    const fresh = makeTask({ id: 'task-fresh', name: 'Fresh task' })
    const freshWorkflow = makeTask({ id: 'task-wf-fresh', name: 'Fresh workflow', hasSteps: true })
    const archived = makeTask({ id: 'task-arch', name: 'Archived task', archived: true })
    setTasks([inEndeavor, fresh, freshWorkflow, archived])
    mockDb.getEndeavorById.mockResolvedValue(makeEndeavor({ items: [makeItem(inEndeavor)] }))

    await renderLoaded()
    fireEvent.click(screen.getByText('Add Task'))

    // Open the select dropdown
    const select = document.querySelector('.arco-modal .arco-select')
    fireEvent.click(select as HTMLElement)

    await waitFor(() => {
      expect(document.querySelectorAll('.arco-select-option').length).toBe(2)
    })
    const optionTexts = Array.from(document.querySelectorAll('.arco-select-option')).map(
      (o) => o.textContent,
    )
    expect(optionTexts).toContain('Fresh task')
    expect(optionTexts).toContain('Fresh workflow (Workflow)')
    expect(optionTexts).not.toContain('Already in')
    expect(optionTexts).not.toContain('Archived task')
  })

  it('disables Add until a task is selected, then adds it and reloads the endeavor', async () => {
    const fresh = makeTask({ id: 'task-fresh', name: 'Fresh task' })
    setTasks([fresh])
    mockDb.getEndeavorById
      .mockResolvedValueOnce(makeEndeavor({ items: [] }))
      .mockResolvedValueOnce(makeEndeavor({ items: [makeItem(fresh)] }))
    mockAddTaskToEndeavor.mockResolvedValue(undefined)

    await renderLoaded()
    fireEvent.click(screen.getByText('Add Task'))

    const addButton = screen.getByRole('button', { name: 'Add' })
    expect(addButton).toBeDisabled()

    fireEvent.click(document.querySelector('.arco-modal .arco-select') as HTMLElement)
    const option = await waitFor(() => {
      const el = Array.from(document.querySelectorAll('.arco-select-option')).find(
        (o) => o.textContent === 'Fresh task',
      )
      expect(el).toBeTruthy()
      return el as HTMLElement
    })
    fireEvent.click(option)

    await waitFor(() => {
      expect(addButton).not.toBeDisabled()
    })
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(mockAddTaskToEndeavor).toHaveBeenCalledWith(ENDEAVOR_ID, 'task-fresh')
    })
    expect(Message.success).toHaveBeenCalledWith('Task added to endeavor')
    // Reloaded endeavor now shows the task in the list
    expect(await screen.findByText('Fresh task')).toBeInTheDocument()
    expect(
      screen.queryByText('No tasks added yet. Add tasks to track progress.'),
    ).not.toBeInTheDocument()
  })

  it('shows the exhausted message when every task is already in the endeavor or archived', async () => {
    const inEndeavor = makeTask({ id: 'task-in', name: 'Already in' })
    setTasks([inEndeavor, makeTask({ id: 'task-arch', name: 'Old', archived: true })])
    mockDb.getEndeavorById.mockResolvedValue(makeEndeavor({ items: [makeItem(inEndeavor)] }))

    await renderLoaded()
    fireEvent.click(screen.getByText('Add Task'))

    expect(
      screen.getByText('All tasks are already in this endeavor or archived.'),
    ).toBeInTheDocument()
  })

  it('reports a failure to add a task and keeps the modal open', async () => {
    setTasks([makeTask({ id: 'task-fresh', name: 'Fresh task' })])
    mockAddTaskToEndeavor.mockRejectedValue(new Error('quota'))

    await renderLoaded()
    fireEvent.click(screen.getByText('Add Task'))
    fireEvent.click(document.querySelector('.arco-modal .arco-select') as HTMLElement)
    const option = await waitFor(() => {
      const el = Array.from(document.querySelectorAll('.arco-select-option')).find(
        (o) => o.textContent === 'Fresh task',
      )
      expect(el).toBeTruthy()
      return el as HTMLElement
    })
    fireEvent.click(option)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(Message.error).toHaveBeenCalledWith('Failed to add task: quota')
    })
    expect(screen.getByText('Add Task to Endeavor')).toBeInTheDocument()
  })
})
