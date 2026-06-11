import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UnifiedTaskEdit } from '../UnifiedTaskEdit'
import { useTaskStore } from '../../../store/useTaskStore'
import { Message } from '../../common/Message'
import { StepStatus, TaskStatus } from '@shared/enums'
import { Task, TaskStep } from '@shared/types'
import { SequencedTask } from '@shared/sequencing-types'

const { mockGetTasks, taskTypesHolder } = vi.hoisted(() => ({
  mockGetTasks: vi.fn(),
  taskTypesHolder: {
    types: [] as Array<{ id: string; name: string; color: string; emoji?: string }>,
  },
}))

// Mock the task store (component reads updateTask/updateSequencedTask from it)
vi.mock('../../../store/useTaskStore')

// Mock user task types so type lookups are deterministic (mutable per test)
vi.mock('../../../store/useUserTaskTypeStore', () => ({
  useSortedUserTaskTypes: () => taskTypesHolder.types,
}))

// Mock the Message component so success/error toasts can be asserted
vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock the logger (component uses logger.ui and logger.db)
vi.mock('@/logger', () => ({
  logger: {
    ui: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
    db: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
  },
}))

// Mock the database service used by loadSteps()
vi.mock('../../../services/database', () => ({
  getDatabase: () => ({ getTasks: mockGetTasks }),
}))

// Stub the heavy child modals with controllable test doubles
vi.mock('../TaskSplitModal', () => ({
  TaskSplitModal: ({ visible, task, onClose, onSplit }: any) =>
    visible ? (
      <div data-testid="task-split-modal">
        <span data-testid="task-split-name">{task.name}</span>
        <button onClick={() => onSplit(task, task)}>confirm-task-split</button>
        <button onClick={onClose}>close-task-split</button>
      </div>
    ) : null,
}))

vi.mock('../StepSplitModal', () => ({
  StepSplitModal: ({ visible, step, onClose, onSplit }: any) =>
    visible ? (
      <div data-testid="step-split-modal">
        <span data-testid="step-split-name">{step.name}</span>
        <button
          onClick={() =>
            onSplit(
              { ...step, name: `${step.name} (Part 1)`, duration: step.duration / 2 },
              { ...step, id: `${step.id}-b`, name: `${step.name} (Part 2)`, duration: step.duration / 2 },
            )
          }
        >
          confirm-step-split
        </button>
        <button onClick={onClose}>close-step-split</button>
      </div>
    ) : null,
}))

vi.mock('../StepWorkSessionsModal', () => ({
  StepWorkSessionsModal: ({ visible, stepName, onClose }: any) =>
    visible ? (
      <div data-testid="step-sessions-modal">
        <span>{`Sessions for ${stepName}`}</span>
        <button onClick={onClose}>close-sessions</button>
      </div>
    ) : null,
}))

vi.mock('../../shared/DependencyEditor', () => ({
  DependencyEditor: ({ forwardDependencies, onForwardDependenciesChange }: any) => (
    <div data-testid="dependency-editor">
      <span data-testid="dep-count">{forwardDependencies.length}</span>
      <button onClick={() => onForwardDependenciesChange(['step-1', 'extra-dep'])}>set-deps</button>
    </div>
  ),
}))

const makeTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  name: 'Write report',
  duration: 60,
  importance: 7,
  urgency: 4,
  type: 'focused',
  asyncWaitTime: 0,
  dependencies: [],
  completed: false,
  sessionId: 'session-1',
  createdAt: new Date('2026-06-01T10:00:00'),
  updatedAt: new Date('2026-06-01T10:00:00'),
  hasSteps: false,
  overallStatus: TaskStatus.NotStarted,
  criticalPathDuration: 60,
  worstCaseDuration: 90,
  archived: false,
  inActiveSprint: false,
  ...overrides,
})

const makeStep = (overrides: Partial<TaskStep> = {}): TaskStep => ({
  id: 'step-1',
  taskId: 'wf-1',
  name: 'Draft outline',
  duration: 30,
  type: 'focused',
  dependsOn: [],
  asyncWaitTime: 0,
  status: StepStatus.Pending,
  stepIndex: 0,
  percentComplete: 0,
  actualDuration: 0,
  ...overrides,
})

const makeWorkflow = (steps: TaskStep[], overrides: Partial<Task> = {}): SequencedTask => ({
  ...makeTask({
    id: 'wf-1',
    name: 'Ship feature',
    hasSteps: true,
    duration: 75,
  }),
  ...overrides,
  steps,
})

const stepA = (): TaskStep => makeStep()
const stepB = (): TaskStep =>
  makeStep({
    id: 'step-2',
    name: 'Review draft',
    duration: 45,
    type: 'admin',
    stepIndex: 1,
    status: StepStatus.InProgress,
    dependsOn: ['step-1'],
    asyncWaitTime: 15,
    percentComplete: 50,
  })
const stepC = (): TaskStep =>
  makeStep({
    id: 'step-3',
    name: 'Publish post',
    duration: 60,
    type: 'mystery',
    stepIndex: 2,
    status: StepStatus.Completed,
    dependsOn: ['step-1', 'ghost-step'],
    percentComplete: 100,
    notes: 'Needs final check',
  })

/** Click the primary (OK) button in the currently open Arco step modal footer. */
const clickStepModalOk = async (): Promise<void> => {
  await waitFor(() => {
    expect(document.querySelector('.arco-modal-footer .arco-btn-primary')).toBeTruthy()
  })
  fireEvent.click(document.querySelector('.arco-modal-footer .arco-btn-primary') as HTMLElement)
}

/** Click the primary (OK) button in the currently open Arco Popconfirm popup. */
const confirmPopconfirm = async (): Promise<void> => {
  await waitFor(() => {
    expect(document.querySelector('.arco-popconfirm .arco-btn-primary')).toBeTruthy()
  })
  fireEvent.click(document.querySelector('.arco-popconfirm .arco-btn-primary') as HTMLElement)
}

/** Open the first Arco Select in the container and click the option matching the text. */
const chooseSelectOption = async (container: HTMLElement, optionText: string): Promise<void> => {
  const select = container.querySelector('.arco-select')
  expect(select).toBeTruthy()
  fireEvent.click(select as HTMLElement)
  const option = await waitFor(() => {
    const options = Array.from(document.querySelectorAll('li.arco-select-option'))
    const found = options.find(li => li.textContent?.trim() === optionText)
    if (!found) throw new Error(`Option not found: ${optionText}`)
    return found
  })
  fireEvent.click(option)
}

/** Find an action button inside a step list item by its icon class. */
const stepActionButton = (item: Element, iconClass: string): HTMLButtonElement => {
  const button = item.querySelector(`.${iconClass}`)?.closest('button')
  expect(button).toBeTruthy()
  return button as HTMLButtonElement
}

const listItems = (container: HTMLElement): Element[] =>
  Array.from(container.querySelectorAll('.arco-list-item'))

describe('UnifiedTaskEdit', () => {
  const mockUpdateTask = vi.fn()
  const mockUpdateSequencedTask = vi.fn()

  // Arco's Select VirtualList reads padding/margin values off getComputedStyle and
  // calls .replace on them — the global setup mock omits those fields, so any string
  // property must resolve to a CSS-like string here (same idiom as EndeavorDetail tests).
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
    mockUpdateTask.mockResolvedValue(undefined)
    mockUpdateSequencedTask.mockResolvedValue(undefined)
    mockGetTasks.mockResolvedValue([])
    taskTypesHolder.types = [
      { id: 'focused', name: 'Focused', color: 'blue', emoji: '🎯' },
      { id: 'admin', name: 'Admin', color: 'green', emoji: '📋' },
      { id: 'plain', name: 'Plain', color: 'gray' },
    ]
    ;(useTaskStore as any).mockReturnValue({
      updateTask: mockUpdateTask,
      updateSequencedTask: mockUpdateSequencedTask,
    })
  })

  describe('regular task — view mode', () => {
    it('renders all fields read-only with fallbacks for missing deadline/notes/complexity', () => {
      render(<UnifiedTaskEdit task={makeTask()} />)

      expect(screen.getByText('Edit Task')).toBeInTheDocument()
      expect(screen.getByText('Write report')).toBeInTheDocument()
      expect(screen.getByText('focused')).toBeInTheDocument() // raw type tag
      expect(screen.getByText('60 min')).toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument() // importance
      expect(screen.getByText('4')).toBeInTheDocument() // urgency
      expect(screen.getByText('3')).toBeInTheDocument() // cognitive complexity default
      expect(screen.getByText('No deadline')).toBeInTheDocument()
      expect(screen.getByText('No notes')).toBeInTheDocument()

      // No workflow chrome, no edit inputs
      expect(screen.queryByText('Workflow Steps')).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Enter task name')).not.toBeInTheDocument()
      expect(screen.getByText('Edit')).toBeInTheDocument()
      expect(screen.getByText('Close')).toBeInTheDocument()
    })

    it('renders deadline and notes when present', () => {
      const deadline = new Date('2026-06-15T12:00:00')
      render(<UnifiedTaskEdit task={makeTask({ deadline, notes: 'Bring the charts', cognitiveComplexity: 5 })} />)

      expect(screen.getByText(deadline.toLocaleDateString())).toBeInTheDocument()
      expect(screen.getByText('Bring the charts')).toBeInTheDocument()
      expect(screen.getByText('5')).toBeInTheDocument()
    })

    it('calls onClose when Close is clicked', () => {
      const onClose = vi.fn()
      render(<UnifiedTaskEdit task={makeTask()} onClose={onClose} />)

      fireEvent.click(screen.getByText('Close'))
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('switches into edit mode when Edit is clicked', () => {
      render(<UnifiedTaskEdit task={makeTask()} />)

      fireEvent.click(screen.getByText('Edit'))

      expect(screen.getByPlaceholderText('Enter task name')).toHaveValue('Write report')
      expect(screen.getByText('Save')).toBeInTheDocument()
      expect(screen.getByText('Split Task')).toBeInTheDocument()
      expect(screen.getByText('Cancel')).toBeInTheDocument()
      expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    })

    it('starts in edit mode when startInEditMode is set', () => {
      render(<UnifiedTaskEdit task={makeTask()} startInEditMode />)

      expect(screen.getByPlaceholderText('Enter task name')).toBeInTheDocument()
      expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    })
  })

  describe('regular task — editing', () => {
    it('saves edited name and duration, shows success, exits edit mode and calls onClose', async () => {
      const onClose = vi.fn()
      render(
        <UnifiedTaskEdit
          task={makeTask({ deadline: new Date('2026-06-20T09:00:00') })}
          onClose={onClose}
          startInEditMode
        />,
      )

      fireEvent.change(screen.getByPlaceholderText('Enter task name'), {
        target: { value: 'Updated report' },
      })
      fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '90' } })
      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith(
          'task-1',
          expect.objectContaining({ name: 'Updated report', duration: 90 }),
        )
      })
      expect(mockUpdateSequencedTask).not.toHaveBeenCalled()
      expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Task updated successfully')
      expect(onClose).toHaveBeenCalledTimes(1)

      // Back to view mode
      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Enter task name')).not.toBeInTheDocument()
      })
      expect(screen.getByText('Updated report')).toBeInTheDocument()
    })

    it('shows an error and stays in edit mode when saving fails', async () => {
      mockUpdateTask.mockRejectedValueOnce(new Error('boom'))
      const onClose = vi.fn()
      render(<UnifiedTaskEdit task={makeTask()} onClose={onClose} startInEditMode />)

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to save changes')
      })
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByText('Save')).toBeInTheDocument() // still editing
    })

    it('cancel discards unsaved edits and returns to view mode', () => {
      render(<UnifiedTaskEdit task={makeTask()} startInEditMode />)

      fireEvent.change(screen.getByPlaceholderText('Enter task name'), {
        target: { value: 'Garbage edit' },
      })
      fireEvent.click(screen.getByText('Cancel'))

      expect(screen.getByText('Write report')).toBeInTheDocument()
      expect(screen.queryByText('Garbage edit')).not.toBeInTheDocument()
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })

    it('opens the split modal and closes it after a split', () => {
      render(<UnifiedTaskEdit task={makeTask()} startInEditMode />)

      expect(screen.queryByTestId('task-split-modal')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Split Task'))
      expect(screen.getByTestId('task-split-modal')).toBeInTheDocument()
      expect(screen.getByTestId('task-split-name')).toHaveTextContent('Write report')

      fireEvent.click(screen.getByText('confirm-task-split'))
      expect(screen.queryByTestId('task-split-modal')).not.toBeInTheDocument()
    })
  })

  describe('workflow — view mode', () => {
    it('renders workflow header, sorted steps, type lookups and progress', async () => {
      // Steps deliberately out of order to verify stepIndex sorting
      render(<UnifiedTaskEdit task={makeWorkflow([stepB(), stepA(), stepC()])} />)

      expect(screen.getByText('Edit Workflow')).toBeInTheDocument()
      expect(screen.getByText(/calculated from steps/)).toBeInTheDocument()
      expect(screen.getByText('Workflow Steps')).toBeInTheDocument()

      expect(await screen.findByText('1. Draft outline')).toBeInTheDocument()
      expect(screen.getByText('2. Review draft')).toBeInTheDocument()
      expect(screen.getByText('3. Publish post')).toBeInTheDocument()

      // Type lookup: known types render emoji + name; unknown falls back to raw id
      expect(screen.getByText(/Type: 🎯 Focused/)).toBeInTheDocument()
      expect(screen.getByText(/Type: 📋 Admin/)).toBeInTheDocument()
      expect(screen.getByText(/Type: mystery/)).toBeInTheDocument()
      expect(screen.getByText(/Duration: 45 min/)).toBeInTheDocument()
      expect(screen.getByText(/Progress: 50%/)).toBeInTheDocument()

      // View mode shows session buttons, not edit actions
      expect(screen.getAllByText('View Sessions')).toHaveLength(3)
      expect(screen.queryByText('Add Step')).not.toBeInTheDocument()
      expect(screen.queryByText('Split Task')).not.toBeInTheDocument()
    })

    it('shows status icons, dependency names, broken refs and step notes', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB(), stepC()])} />)
      await screen.findByText('1. Draft outline')

      expect(container.querySelector('.arco-icon-check-circle')).toBeTruthy() // completed step
      expect(container.querySelector('.arco-icon-clock-circle')).toBeTruthy() // in-progress step

      // stepB depends on stepA by name
      expect(
        screen.getByText(
          (_, element) =>
            element?.classList.contains('arco-typography') === true &&
            element.textContent === 'Depends on: Draft outline',
        ),
      ).toBeInTheDocument()
      // stepC has one valid and one broken dependency reference
      expect(
        screen.getByText(
          (_, element) =>
            element?.classList.contains('arco-typography') === true &&
            element.textContent === 'Depends on: Draft outline, (broken ref)',
        ),
      ).toBeInTheDocument()

      expect(screen.getByText('Needs final check')).toBeInTheDocument()
    })

    it('opens the work sessions modal for a step from View Sessions', async () => {
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('View Sessions'))
      expect(screen.getByTestId('step-sessions-modal')).toBeInTheDocument()
      expect(screen.getByText('Sessions for Draft outline')).toBeInTheDocument()

      fireEvent.click(screen.getByText('close-sessions'))
      expect(screen.queryByTestId('step-sessions-modal')).not.toBeInTheDocument()
    })

    it('falls back to loading steps from the database when the task carries none', async () => {
      mockGetTasks.mockResolvedValue([{ ...makeWorkflow([]), steps: [stepA()] }])

      render(<UnifiedTaskEdit task={makeWorkflow([])} />)

      expect(await screen.findByText('1. Draft outline')).toBeInTheDocument()
      expect(mockGetTasks).toHaveBeenCalled()
    })

    it('shows an error toast when loading steps from the database fails', async () => {
      mockGetTasks.mockRejectedValue(new Error('db down'))

      render(<UnifiedTaskEdit task={makeWorkflow([])} />)

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to load workflow steps')
      })
    })
  })

  describe('workflow — edit mode', () => {
    it('keeps duration read-only, hides Split Task and offers Apply to all steps', async () => {
      render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      expect(screen.queryByText('Split Task')).not.toBeInTheDocument()
      expect(screen.getByText(/calculated from steps/)).toBeInTheDocument()
      expect(screen.getByText('Apply to all steps')).toBeInTheDocument()
      expect(screen.getByText('Add Step')).toBeInTheDocument()
    })

    it('saves the workflow with durations recalculated from the steps', async () => {
      render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [id, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(id).toBe('wf-1')
      // 30 + 45 = 75; + 15 async wait = 90 critical path; * 1.5 = 135 worst case
      expect(payload).toMatchObject({
        name: 'Ship feature',
        duration: 75,
        criticalPathDuration: 90,
        worstCaseDuration: 135,
      })
      expect(payload.steps).toHaveLength(2)
      expect(payload.steps[0]).toMatchObject({ id: 'step-1', stepIndex: 0, taskId: 'wf-1' })
      expect(payload.steps[1]).toMatchObject({ id: 'step-2', stepIndex: 1, asyncWaitTime: 15 })
      expect(mockUpdateTask).not.toHaveBeenCalled()
      expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Workflow updated successfully')
    })

    it('shows an error when the workflow save fails', async () => {
      mockUpdateSequencedTask.mockRejectedValueOnce(new Error('nope'))
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to save changes')
      })
    })

    it('reorders steps with the move buttons and disables them at the boundaries', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      const items = listItems(container)
      expect(stepActionButton(items[0], 'arco-icon-up')).toBeDisabled()
      expect(stepActionButton(items[1], 'arco-icon-down')).toBeDisabled()
      expect(stepActionButton(items[0], 'arco-icon-down')).not.toBeDisabled()

      fireEvent.click(stepActionButton(items[0], 'arco-icon-down'))

      expect(await screen.findByText('1. Review draft')).toBeInTheDocument()
      expect(screen.getByText('2. Draft outline')).toBeInTheDocument()
    })

    it('deletes a step after Popconfirm confirmation', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(stepActionButton(listItems(container)[0], 'arco-icon-delete'))
      await confirmPopconfirm()

      await waitFor(() => {
        expect(screen.queryByText('1. Draft outline')).not.toBeInTheDocument()
      })
      // Remaining step is reindexed to position 1
      expect(screen.getByText('1. Review draft')).toBeInTheDocument()
    })

    it('cancel restores the original steps after local-only changes', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(stepActionButton(listItems(container)[0], 'arco-icon-delete'))
      await confirmPopconfirm()
      await waitFor(() => {
        expect(screen.queryByText('1. Draft outline')).not.toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Cancel'))

      expect(await screen.findByText('1. Draft outline')).toBeInTheDocument()
      expect(mockUpdateSequencedTask).not.toHaveBeenCalled()
    })

    it('clears every step priority so steps inherit from the workflow', async () => {
      const steps = [
        makeStep({ importance: 8, urgency: 9 }),
        makeStep({ id: 'step-2', name: 'Review draft', stepIndex: 1, importance: 2, urgency: 3 }),
      ]
      render(<UnifiedTaskEdit task={makeWorkflow(steps)} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Apply to all steps'))
      await confirmPopconfirm()

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.steps).toHaveLength(2)
      for (const step of payload.steps) {
        expect(step.importance).toBeUndefined()
        expect(step.urgency).toBeUndefined()
      }
      expect(vi.mocked(Message.success)).toHaveBeenCalledWith(
        'All steps now inherit the workflow’s importance and urgency',
      )
    })

    it('shows an error when clearing step priorities fails', async () => {
      mockUpdateSequencedTask.mockRejectedValueOnce(new Error('nope'))
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Apply to all steps'))
      await confirmPopconfirm()

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to update steps')
      })
    })
  })

  describe('workflow — step modal', () => {
    it('edits an existing step and persists the change immediately', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(stepActionButton(listItems(container)[0], 'arco-icon-edit'))

      expect(await screen.findByText('Edit Step')).toBeInTheDocument()
      const nameInput = screen.getByPlaceholderText('Enter step name')
      expect(nameInput).toHaveValue('Draft outline')

      fireEvent.change(nameInput, { target: { value: 'Draft v2' } })
      await clickStepModalOk()

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.steps[0]).toMatchObject({ id: 'step-1', name: 'Draft v2' })
      expect(payload.steps[1]).toMatchObject({ id: 'step-2', name: 'Review draft' })
      expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Step saved successfully')
      expect(await screen.findByText('1. Draft v2')).toBeInTheDocument()
    })

    it('adds a new step with generated id and recalculated totals', async () => {
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Add Step'))
      const nameInput = await screen.findByPlaceholderText('Enter step name')
      fireEvent.change(nameInput, { target: { value: 'Brand new step' } })
      await clickStepModalOk()

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.steps).toHaveLength(2)
      expect(payload.steps[1]).toMatchObject({
        name: 'Brand new step',
        stepIndex: 1,
        status: StepStatus.Pending,
        taskId: 'wf-1',
      })
      expect(payload.steps[1].id).toMatch(/^step-\d+$/)
      // New step defaults to 30 min: 30 (existing) + 30 (new) = 60
      expect(payload.duration).toBe(60)
      expect(await screen.findByText('2. Brand new step')).toBeInTheDocument()
    })

    it('rejects a step save when the required name is missing', async () => {
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Add Step'))
      await screen.findByPlaceholderText('Enter step name')
      await clickStepModalOk() // name is empty -> validation fails

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to save step')
      })
      expect(mockUpdateSequencedTask).not.toHaveBeenCalled()
    })

    it('shows an error when persisting a step edit fails', async () => {
      mockUpdateSequencedTask.mockRejectedValueOnce(new Error('nope'))
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(stepActionButton(listItems(container)[0], 'arco-icon-edit'))
      await screen.findByPlaceholderText('Enter step name')
      await clickStepModalOk()

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to save step')
      })
    })

    it('updates step dependencies through the dependency editor', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      // Edit the second step (already depends on step-1)
      fireEvent.click(stepActionButton(listItems(container)[1], 'arco-icon-edit'))
      expect(await screen.findByTestId('dep-count')).toHaveTextContent('1')

      fireEvent.click(screen.getByText('set-deps'))
      await waitFor(() => expect(screen.getByTestId('dep-count')).toHaveTextContent('2'))

      await clickStepModalOk()
      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.steps[1].dependsOn).toEqual(['step-1', 'extra-dep'])
    })

    it('splits a step in place and reindexes the surrounding steps', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(stepActionButton(listItems(container)[0], 'arco-icon-scissor'))
      expect(screen.getByTestId('step-split-modal')).toBeInTheDocument()
      expect(screen.getByTestId('step-split-name')).toHaveTextContent('Draft outline')

      fireEvent.click(screen.getByText('confirm-step-split'))

      await waitFor(() => {
        expect(screen.queryByTestId('step-split-modal')).not.toBeInTheDocument()
      })
      expect(screen.getByText('1. Draft outline (Part 1)')).toBeInTheDocument()
      expect(screen.getByText('2. Draft outline (Part 2)')).toBeInTheDocument()
      expect(screen.getByText('3. Review draft')).toBeInTheDocument()
    })

    it('cancelling the step modal discards the pending step without saving', async () => {
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Add Step'))
      const nameInput = await screen.findByPlaceholderText('Enter step name')
      fireEvent.change(nameInput, { target: { value: 'Never saved' } })

      const cancelButton = Array.from(
        document.querySelectorAll('.arco-modal-footer .arco-btn'),
      ).find(button => !button.classList.contains('arco-btn-primary'))
      expect(cancelButton).toBeTruthy()
      fireEvent.click(cancelButton as HTMLElement)

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Enter step name')).not.toBeInTheDocument()
      })
      expect(mockUpdateSequencedTask).not.toHaveBeenCalled()
      expect(screen.queryByText(/Never saved/)).not.toBeInTheDocument()
    })
  })

  describe('regular task — field editing', () => {
    it('changes the type through the select and persists it', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeTask()} startInEditMode />)

      await chooseSelectOption(container, '📋 Admin')
      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith(
          'task-1',
          expect.objectContaining({ type: 'admin' }),
        )
      })
      // Back in view mode the raw type tag reflects the new type
      expect(await screen.findByText('admin')).toBeInTheDocument()
    })

    it('edits importance, urgency, cognitive complexity and notes', async () => {
      render(<UnifiedTaskEdit task={makeTask()} startInEditMode />)

      fireEvent.change(screen.getByDisplayValue('7'), { target: { value: '9' } }) // importance
      fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '2' } }) // urgency
      fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '5' } }) // complexity
      fireEvent.change(screen.getByPlaceholderText('Add any notes or details...'), {
        target: { value: 'Remember the appendix' },
      })
      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith(
          'task-1',
          expect.objectContaining({
            importance: 9,
            urgency: 2,
            cognitiveComplexity: 5,
            notes: 'Remember the appendix',
          }),
        )
      })
    })

    it('falls back to defaults when numeric fields are cleared', async () => {
      render(<UnifiedTaskEdit task={makeTask()} startInEditMode />)

      fireEvent.change(screen.getByDisplayValue('60'), { target: { value: '' } }) // duration -> 0
      fireEvent.change(screen.getByDisplayValue('7'), { target: { value: '' } }) // importance -> 5
      fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '' } }) // urgency -> 5
      fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '' } }) // complexity -> 3
      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(mockUpdateTask).toHaveBeenCalledWith(
          'task-1',
          expect.objectContaining({
            duration: 0,
            importance: 5,
            urgency: 5,
            cognitiveComplexity: 3,
          }),
        )
      })
    })

    it('clears the deadline via the picker clear icon', async () => {
      const { container } = render(
        <UnifiedTaskEdit task={makeTask({ deadline: new Date('2026-06-20T09:00:00') })} startInEditMode />,
      )

      const clearIcon = container.querySelector('.arco-picker-clear-icon')
      expect(clearIcon).toBeTruthy()
      fireEvent.click(clearIcon as HTMLElement)
      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(1))
      expect(mockUpdateTask.mock.calls[0][1].deadline).toBeUndefined()
      // Back in view mode, the cleared deadline renders the fallback
      expect(await screen.findByText('No deadline')).toBeInTheDocument()
    })

    it('sets a deadline by picking a date from the picker panel', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeTask()} startInEditMode />)

      const pickerInput = container.querySelector('.arco-picker input')
      expect(pickerInput).toBeTruthy()
      fireEvent.click(pickerInput as HTMLElement)

      // Pick the first in-view date cell, then confirm (showTime requires OK)
      const cell = await waitFor(() => {
        const found = document.querySelector('.arco-picker-cell-in-view')
        if (!found) throw new Error('No date cell rendered')
        return found
      })
      fireEvent.click(cell)
      const okButton = await waitFor(() => {
        const found = document.querySelector('.arco-picker-footer-btn-wrapper .arco-btn-primary')
        if (!found) throw new Error('No picker OK button rendered')
        return found
      })
      fireEvent.click(okButton)

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => expect(mockUpdateTask).toHaveBeenCalledTimes(1))
      // Arco delivers the picked value as a formatted string; it is saved as-is
      expect(mockUpdateTask.mock.calls[0][1].deadline).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    })

    it('closes the task split modal without splitting', () => {
      render(<UnifiedTaskEdit task={makeTask()} startInEditMode />)

      fireEvent.click(screen.getByText('Split Task'))
      expect(screen.getByTestId('task-split-modal')).toBeInTheDocument()

      fireEvent.click(screen.getByText('close-task-split'))
      expect(screen.queryByTestId('task-split-modal')).not.toBeInTheDocument()
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })
  })

  describe('workflow — deadline normalization on save', () => {
    it('passes a Date deadline through unchanged', async () => {
      const deadline = new Date('2026-07-01T10:00:00')
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()], { deadline })} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.deadline).toBeInstanceOf(Date)
      expect((payload.deadline as Date).getTime()).toBe(deadline.getTime())
    })

    it('coerces a string deadline into a Date for persistence', async () => {
      const iso = '2026-07-01T10:00:00.000Z'
      render(
        <UnifiedTaskEdit
          task={makeWorkflow([stepA()], { deadline: iso as unknown as Date })}
          startInEditMode
        />,
      )
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.deadline).toBeInstanceOf(Date)
      expect((payload.deadline as Date).toISOString()).toBe(iso)
    })
  })

  describe('workflow — step data normalization', () => {
    const minimalStep = (): TaskStep =>
      ({
        id: 'step-min',
        taskId: 'wf-1',
        name: 'Loose step',
        duration: 20,
        type: 'focused',
        stepIndex: 0,
      }) as TaskStep

    it('fills defaults for steps missing optional fields when saving', async () => {
      render(<UnifiedTaskEdit task={makeWorkflow([minimalStep()])} startInEditMode />)
      await screen.findByText('1. Loose step')

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.steps[0]).toMatchObject({
        id: 'step-min',
        dependsOn: [],
        asyncWaitTime: 0,
        isAsyncTrigger: false,
        status: StepStatus.Pending,
        percentComplete: 0,
        actualDuration: 0,
        cognitiveComplexity: 3,
        notes: '',
      })
    })

    it('defaults missing dependencies when resetting priorities persists the steps', async () => {
      render(<UnifiedTaskEdit task={makeWorkflow([minimalStep()])} startInEditMode />)
      await screen.findByText('1. Loose step')

      fireEvent.click(screen.getByText('Apply to all steps'))
      await confirmPopconfirm()

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.steps[0]).toMatchObject({ id: 'step-min', dependsOn: [], stepIndex: 0 })
      expect(payload.steps[0].importance).toBeUndefined()
      expect(payload.steps[0].urgency).toBeUndefined()
    })

    it('treats a step with no recorded dependencies as having none in the editor', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([minimalStep()])} startInEditMode />)
      await screen.findByText('1. Loose step')

      fireEvent.click(stepActionButton(listItems(container)[0], 'arco-icon-edit'))
      expect(await screen.findByTestId('dep-count')).toHaveTextContent('0')

      await clickStepModalOk()
      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.steps[0].dependsOn).toEqual([])
    })
  })

  describe('workflow — step list display fallbacks', () => {
    it('renders type without emoji, unknown type as None, and JSON-string dependencies', async () => {
      const steps = [
        makeStep({ id: 'step-1', name: 'Plain step', type: 'plain' }),
        makeStep({ id: 'step-2', name: 'Typeless step', type: '', stepIndex: 1 }),
        makeStep({
          id: 'step-3',
          name: 'Stringly step',
          stepIndex: 2,
          dependsOn: '["step-1"]' as unknown as string[],
        }),
        makeStep({
          id: 'step-4',
          name: 'Multi dep step',
          stepIndex: 3,
          dependsOn: ['step-1', 'step-2'],
        }),
      ]
      render(<UnifiedTaskEdit task={makeWorkflow(steps)} />)
      await screen.findByText('1. Plain step')

      // Type with no emoji renders just the name; empty type falls back to None
      expect(screen.getByText(/Type: Plain \|/)).toBeInTheDocument()
      expect(screen.getByText(/Type: None/)).toBeInTheDocument()
      // dependsOn persisted as a JSON string still resolves to the step name
      expect(
        screen.getByText(
          (_, element) =>
            element?.classList.contains('arco-typography') === true &&
            element.textContent === 'Depends on: Plain step',
        ),
      ).toBeInTheDocument()
      // Multiple valid dependencies are comma-separated
      expect(
        screen.getByText(
          (_, element) =>
            element?.classList.contains('arco-typography') === true &&
            element.textContent === 'Depends on: Plain step, Typeless step',
        ),
      ).toBeInTheDocument()
    })

    it('marks a broken reference in first position without a leading comma', async () => {
      const steps = [
        makeStep({ id: 'step-1', name: 'Orphan step', dependsOn: ['ghost-step'] }),
      ]
      render(<UnifiedTaskEdit task={makeWorkflow(steps)} />)
      await screen.findByText('1. Orphan step')

      expect(
        screen.getByText(
          (_, element) =>
            element?.classList.contains('arco-typography') === true &&
            element.textContent === 'Depends on: (broken ref)',
        ),
      ).toBeInTheDocument()
    })
  })

  describe('workflow — more step editing paths', () => {
    it('moves a step up with the up button', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA(), stepB()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(stepActionButton(listItems(container)[1], 'arco-icon-up'))

      expect(await screen.findByText('1. Review draft')).toBeInTheDocument()
      expect(screen.getByText('2. Draft outline')).toBeInTheDocument()
    })

    it('closes the step split modal without splitting', async () => {
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(stepActionButton(listItems(container)[0], 'arco-icon-scissor'))
      expect(screen.getByTestId('step-split-modal')).toBeInTheDocument()

      fireEvent.click(screen.getByText('close-step-split'))
      await waitFor(() => {
        expect(screen.queryByTestId('step-split-modal')).not.toBeInTheDocument()
      })
      // Steps unchanged
      expect(screen.getByText('1. Draft outline')).toBeInTheDocument()
    })
  })

  describe('non-Error failure values', () => {
    it('reports a step-loading failure that is not an Error instance', async () => {
      mockGetTasks.mockRejectedValue('db exploded')

      render(<UnifiedTaskEdit task={makeWorkflow([])} />)

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to load workflow steps')
      })
    })

    it('reports a workflow save failure that is not an Error instance', async () => {
      mockUpdateSequencedTask.mockRejectedValueOnce('save exploded')
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Save'))

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to save changes')
      })
    })

    it('reports a priority-reset failure that is not an Error instance', async () => {
      mockUpdateSequencedTask.mockRejectedValueOnce('reset exploded')
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(screen.getByText('Apply to all steps'))
      await confirmPopconfirm()

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to update steps')
      })
    })

    it('reports a step save failure that is not an Error instance', async () => {
      mockUpdateSequencedTask.mockRejectedValueOnce('step exploded')
      const { container } = render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      fireEvent.click(stepActionButton(listItems(container)[0], 'arco-icon-edit'))
      await screen.findByPlaceholderText('Enter step name')
      await clickStepModalOk()

      await waitFor(() => {
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Failed to save step')
      })
    })
  })

  describe('without configured task types', () => {
    it('still renders and lets a new step default to an empty type', async () => {
      taskTypesHolder.types = []
      render(<UnifiedTaskEdit task={makeWorkflow([stepA()])} startInEditMode />)
      await screen.findByText('1. Draft outline')

      // Type lookup falls back to the raw id when no types exist
      expect(screen.getByText(/Type: focused/)).toBeInTheDocument()

      fireEvent.click(screen.getByText('Add Step'))
      const nameInput = await screen.findByPlaceholderText('Enter step name')
      fireEvent.change(nameInput, { target: { value: 'Untyped step' } })
      await clickStepModalOk()

      await waitFor(() => expect(mockUpdateSequencedTask).toHaveBeenCalledTimes(1))
      const [, payload] = mockUpdateSequencedTask.mock.calls[0]
      expect(payload.steps[1]).toMatchObject({ name: 'Untyped step', type: '' })
    })
  })
})
