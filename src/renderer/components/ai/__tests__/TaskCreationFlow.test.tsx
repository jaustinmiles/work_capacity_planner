import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskCreationFlow } from '../TaskCreationFlow'
import { getDatabase } from '../../../services/database'
import { useTaskStore } from '../../../store/useTaskStore'
import { logger } from '@/logger'
import { TaskStatus } from '@shared/enums'

vi.mock('../../../services/database')
vi.mock('../../../store/useTaskStore')
vi.mock('@/logger', () => ({
  logger: {
    ui: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    system: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  },
}))

interface ExtractedTaskFixture {
  name: string
  description: string
  estimatedDuration: number
  importance: number
  urgency: number
  type: string
  needsMoreInfo?: boolean
}

const READY_TASK: ExtractedTaskFixture = {
  name: 'Ready task',
  description: 'A ready description',
  estimatedDuration: 45,
  importance: 6,
  urgency: 7,
  type: 'focused',
}

const NEEDS_INFO_TASK: ExtractedTaskFixture = {
  name: 'Vague task',
  description: 'Needs more details',
  estimatedDuration: 30,
  importance: 5,
  urgency: 5,
  type: 'admin',
  needsMoreInfo: true,
}

const FULL_ENHANCEMENT = {
  confidence: 85,
  suggestions: {
    description: 'Enhanced description',
    duration: 90,
    importance: 9,
    urgency: 8,
    type: 'deep-work',
    tips: ['Tip one', 'Tip two'],
  },
}

const QUESTIONS = {
  questions: [
    { question: 'What is the deadline?', type: 'text', purpose: 'timing' },
    { question: 'How many people are involved?', type: 'number', purpose: 'scope' },
    { question: 'Where will it happen?', type: 'choice', choices: ['Home', 'Office'], purpose: 'location' },
  ],
}

const ORIGINAL_PAYLOAD = {
  name: 'Ready task',
  duration: 45,
  importance: 6,
  urgency: 7,
  type: 'focused',
  notes: 'A ready description',
  dependencies: [],
  asyncWaitTime: 0,
  completed: false,
  sessionId: '',
  hasSteps: false,
  overallStatus: TaskStatus.NotStarted,
  criticalPathDuration: 45,
  worstCaseDuration: 45,
  archived: false,
  inActiveSprint: false,
}

const ENHANCED_PAYLOAD = {
  ...ORIGINAL_PAYLOAD,
  duration: 90,
  importance: 9,
  urgency: 8,
  type: 'deep-work',
  notes: 'Enhanced description',
  criticalPathDuration: 90,
  worstCaseDuration: 90,
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Arco's Select VirtualList reads padding/margin values off getComputedStyle and
// calls .replace on them — the global setup mock omits those fields, so any string
// property must resolve to a CSS-like string here (same shim as EndeavorDetail tests).
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

describe('TaskCreationFlow', () => {
  const mockAddTask = vi.fn()
  const mockOnClose = vi.fn()
  let mockDb: { getContextualQuestions: ReturnType<typeof vi.fn>; enhanceTaskDetails: ReturnType<typeof vi.fn> }

  const renderFlow = (
    extractedTasks: ExtractedTaskFixture[] = [READY_TASK, NEEDS_INFO_TASK],
    visible: boolean = true,
  ) => render(<TaskCreationFlow visible={visible} onClose={mockOnClose} extractedTasks={extractedTasks} />)

  beforeEach(() => {
    vi.clearAllMocks()
    mockAddTask.mockResolvedValue(undefined)
    mockDb = {
      getContextualQuestions: vi.fn().mockResolvedValue(QUESTIONS),
      enhanceTaskDetails: vi.fn().mockResolvedValue(FULL_ENHANCEMENT),
    }
    ;(getDatabase as any).mockReturnValue(mockDb)
    ;(useTaskStore as any).mockReturnValue({ addTask: mockAddTask })
  })

  describe('review step', () => {
    it('renders extracted tasks with their status labels and descriptions', () => {
      renderFlow()

      expect(screen.getByText('Create Tasks from AI Analysis')).toBeInTheDocument()
      expect(screen.getByText('Tasks to Create (2)')).toBeInTheDocument()
      expect(screen.getByText('Ready task')).toBeInTheDocument()
      expect(screen.getByText('A ready description')).toBeInTheDocument()
      expect(screen.getByText('Ready to Create')).toBeInTheDocument()
      expect(screen.getByText('Vague task')).toBeInTheDocument()
      expect(screen.getByText('Needs more details')).toBeInTheDocument()
      expect(screen.getByText('Needs Info')).toBeInTheDocument()
      // Review footer
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create All Tasks' })).toBeInTheDocument()
    })

    it('renders nothing when not visible', () => {
      renderFlow([READY_TASK], false)

      expect(screen.queryByText('Create Tasks from AI Analysis')).not.toBeInTheDocument()
    })

    it('shows zero tasks and disables Create All when nothing was extracted', () => {
      renderFlow([])

      expect(screen.getByText('Tasks to Create (0)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create All Tasks' })).toBeDisabled()
    })

    it('disables Create All Tasks when every task still needs info', () => {
      renderFlow([NEEDS_INFO_TASK])

      expect(screen.getByRole('button', { name: 'Create All Tasks' })).toBeDisabled()
    })

    it('enables Create All Tasks when at least one task is ready', () => {
      renderFlow()

      expect(screen.getByRole('button', { name: 'Create All Tasks' })).not.toBeDisabled()
    })

    it('invokes onClose when Cancel is clicked', () => {
      renderFlow()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    it('re-initializes the task list when reopened with new extractions', () => {
      const { rerender } = renderFlow([READY_TASK])

      expect(screen.getByText('Tasks to Create (1)')).toBeInTheDocument()

      rerender(
        <TaskCreationFlow
          visible
          onClose={mockOnClose}
          extractedTasks={[READY_TASK, NEEDS_INFO_TASK]}
        />,
      )

      expect(screen.getByText('Tasks to Create (2)')).toBeInTheDocument()
      expect(screen.getByText('Vague task')).toBeInTheDocument()
    })
  })

  describe('enhance flow (ready task)', () => {
    it('shows a spinner while enhancing, then renders original vs AI suggestions', async () => {
      const enhancement = deferred<typeof FULL_ENHANCEMENT>()
      mockDb.enhanceTaskDetails.mockReturnValue(enhancement.promise)
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByText('Ready task'))

      expect(await screen.findByText('AI is analyzing and enhancing your task...')).toBeInTheDocument()
      expect(screen.getByText('AI Enhancements for: Ready task')).toBeInTheDocument()
      expect(mockDb.enhanceTaskDetails).toHaveBeenCalledWith('Ready task', {
        description: 'A ready description',
        duration: 45,
        importance: 6,
        urgency: 7,
      })

      enhancement.resolve(FULL_ENHANCEMENT)

      expect(await screen.findByText(/AI Confidence: 85%/)).toBeInTheDocument()
      expect(screen.queryByText('AI is analyzing and enhancing your task...')).not.toBeInTheDocument()

      // Original task column
      expect(screen.getByText('Original Task')).toBeInTheDocument()
      expect(screen.getByText('A ready description')).toBeInTheDocument()
      expect(document.body.textContent).toContain('Duration: 45 minutes')
      expect(document.body.textContent).toContain('Priority: 6 × 7 = 42')
      expect(document.body.textContent).toContain('Type: focused')

      // AI suggestions column
      expect(screen.getByText('AI Suggestions')).toBeInTheDocument()
      expect(screen.getByText('Enhanced description')).toBeInTheDocument()
      expect(document.body.textContent).toContain('Suggested Duration: 90 minutes')
      expect(document.body.textContent).toContain('Suggested Priority: 9 × 8 = 72')
      expect(document.body.textContent).toContain('Suggested Type: deep-work')
      expect(screen.getByText('Tip one')).toBeInTheDocument()
      expect(screen.getByText('Tip two')).toBeInTheDocument()
    })

    it('falls back to 0% confidence, hides absent suggestion sections, and uses original values when suggestions are empty', async () => {
      mockDb.enhanceTaskDetails.mockResolvedValue({})
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByText('Ready task'))

      expect(await screen.findByText(/AI Confidence: 0%/)).toBeInTheDocument()
      expect(screen.queryByText('Enhanced Description:')).not.toBeInTheDocument()
      expect(screen.queryByText('Suggested Duration:')).not.toBeInTheDocument()
      expect(screen.queryByText('Suggested Priority:')).not.toBeInTheDocument()
      expect(screen.queryByText('Suggested Type:')).not.toBeInTheDocument()
      expect(screen.queryByText('Tips:')).not.toBeInTheDocument()

      // "Use AI Suggestions" with no suggestions falls back to the original values
      fireEvent.click(screen.getByRole('button', { name: 'Use AI Suggestions' }))

      await waitFor(() => expect(mockAddTask).toHaveBeenCalledTimes(1))
      expect(mockAddTask).toHaveBeenCalledWith(ORIGINAL_PAYLOAD)
    })

    it('creates the task with original values via Use Original and marks it created', async () => {
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByText('Ready task'))
      await screen.findByText(/AI Confidence: 85%/)

      fireEvent.click(screen.getByRole('button', { name: 'Use Original' }))

      await waitFor(() => expect(mockAddTask).toHaveBeenCalledTimes(1))
      expect(mockAddTask).toHaveBeenCalledWith(ORIGINAL_PAYLOAD)

      fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))

      expect(await screen.findByText('Created')).toBeInTheDocument()

      // A created task is no longer clickable — no second enhancement fetch
      fireEvent.click(screen.getByText('Ready task'))
      expect(mockDb.enhanceTaskDetails).toHaveBeenCalledTimes(1)
    })

    it('creates the task with AI suggestion values via Use AI Suggestions', async () => {
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByText('Ready task'))
      await screen.findByText(/AI Confidence: 85%/)

      fireEvent.click(screen.getByRole('button', { name: 'Use AI Suggestions' }))

      await waitFor(() => expect(mockAddTask).toHaveBeenCalledTimes(1))
      expect(mockAddTask).toHaveBeenCalledWith(ENHANCED_PAYLOAD)
    })

    it('logs and recovers when enhancement fails', async () => {
      mockDb.enhanceTaskDetails.mockRejectedValue(new Error('enhance exploded'))
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByText('Ready task'))

      await waitFor(() =>
        expect(logger.ui.error).toHaveBeenCalledWith(
          'Error enhancing task',
          { error: 'enhance exploded', taskId: 'task-0' },
          'task-enhance-error',
        ),
      )
      expect(screen.queryByText('AI is analyzing and enhancing your task...')).not.toBeInTheDocument()
      expect(screen.queryByText(/AI Confidence/)).not.toBeInTheDocument()
      expect(mockAddTask).not.toHaveBeenCalled()
    })

    it('renders only the provided suggestion sections and mixes suggested with original values on create', async () => {
      mockDb.enhanceTaskDetails.mockResolvedValue({
        confidence: 60,
        // importance WITHOUT urgency → no priority suggestion; tips: [] → no tips section
        suggestions: { duration: 120, importance: 9, tips: [] },
      })
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByText('Ready task'))

      expect(await screen.findByText(/AI Confidence: 60%/)).toBeInTheDocument()
      expect(document.body.textContent).toContain('Suggested Duration: 120 minutes')
      expect(screen.queryByText('Suggested Priority:')).not.toBeInTheDocument()
      expect(screen.queryByText('Suggested Type:')).not.toBeInTheDocument()
      expect(screen.queryByText('Enhanced Description:')).not.toBeInTheDocument()
      expect(screen.queryByText('Tips:')).not.toBeInTheDocument()

      // Per-field fallback: suggested duration/importance, original urgency/type/notes
      fireEvent.click(screen.getByRole('button', { name: 'Use AI Suggestions' }))

      await waitFor(() => expect(mockAddTask).toHaveBeenCalledTimes(1))
      expect(mockAddTask).toHaveBeenCalledWith({
        ...ORIGINAL_PAYLOAD,
        duration: 120,
        importance: 9,
        criticalPathDuration: 120,
        worstCaseDuration: 120,
      })
    })

    it('logs when task creation fails and does not mark the task created', async () => {
      // Non-Error rejection exercises the String(error) branch
      mockAddTask.mockRejectedValue('plain failure')
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByText('Ready task'))
      await screen.findByText(/AI Confidence: 85%/)

      fireEvent.click(screen.getByRole('button', { name: 'Use Original' }))

      await waitFor(() =>
        expect(logger.ui.error).toHaveBeenCalledWith(
          'Error creating task',
          { error: 'plain failure', taskId: 'task-0' },
          'task-create-error',
        ),
      )

      fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))

      expect(screen.queryByText('Created')).not.toBeInTheDocument()
      expect(await screen.findByText('AI Enhancing')).toBeInTheDocument()
    })
  })

  describe('context flow (needs-info task)', () => {
    it('shows a spinner while generating questions, then renders the question form', async () => {
      const questions = deferred<typeof QUESTIONS>()
      mockDb.getContextualQuestions.mockReturnValue(questions.promise)
      renderFlow([NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))

      expect(await screen.findByText('Generating contextual questions...')).toBeInTheDocument()
      expect(screen.getByText('Provide Context for: Vague task')).toBeInTheDocument()
      expect(mockDb.getContextualQuestions).toHaveBeenCalledWith('Vague task', 'Needs more details')

      questions.resolve(QUESTIONS)

      expect(await screen.findByText('What is the deadline?')).toBeInTheDocument()
      expect(screen.getByText('(timing)')).toBeInTheDocument()
      expect(screen.getByText('How many people are involved?')).toBeInTheDocument()
      expect(screen.getByText('(scope)')).toBeInTheDocument()
      expect(screen.getByText('Where will it happen?')).toBeInTheDocument()
      expect(screen.getByText('(location)')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Continue with AI Enhancement' })).toBeInTheDocument()
    })

    it('blocks empty submissions: required rules fire for every question type and no enhancement starts', async () => {
      // Regression for the Form.Item binding bug: controls were rendered as an array of
      // `{type === 'x' && ...}` conditionals, so Arco never bound them — required rules
      // never registered and empty submissions sailed through to enhancement.
      renderFlow([NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))
      await screen.findByText('What is the deadline?')

      fireEvent.click(screen.getByRole('button', { name: 'Continue with AI Enhancement' }))

      // One required-rule failure per question (text, number, choice)
      expect(await screen.findAllByText('Please provide an answer')).toHaveLength(3)
      expect(mockDb.enhanceTaskDetails).not.toHaveBeenCalled()
      // Still on the context step, not enhancement
      expect(screen.getByRole('button', { name: 'Continue with AI Enhancement' })).toBeInTheDocument()
      expect(screen.queryByText(/AI Confidence/)).not.toBeInTheDocument()
    })

    it('submits answers and moves on to AI enhancement', async () => {
      mockDb.getContextualQuestions.mockResolvedValue({
        questions: [{ question: 'What is the deadline?', type: 'text', purpose: 'timing' }],
      })
      renderFlow([NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))
      await screen.findByText('What is the deadline?')

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Next Friday' } })
      fireEvent.click(screen.getByRole('button', { name: 'Continue with AI Enhancement' }))

      await waitFor(() =>
        expect(mockDb.enhanceTaskDetails).toHaveBeenCalledWith('Vague task', {
          description: 'Needs more details\n\nAdditional context:\nWhat is the deadline? Next Friday',
          duration: 30,
          importance: 5,
          urgency: 5,
        }),
      )
      expect(await screen.findByText(/AI Confidence: 85%/)).toBeInTheDocument()
      expect(screen.getByText('AI Enhancements for: Vague task')).toBeInTheDocument()
    })

    it('captures typed text, number, and choice answers and sends them to the enhancement payload', async () => {
      renderFlow([NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))
      await screen.findByText('What is the deadline?')

      // Text answer
      fireEvent.change(document.querySelector('.arco-textarea') as HTMLTextAreaElement, {
        target: { value: 'Next Friday' },
      })
      // Number answer
      const numberInput = document.querySelector('.arco-input-number input') as HTMLInputElement
      fireEvent.change(numberInput, { target: { value: '3' } })
      fireEvent.blur(numberInput)
      // Choice answer
      fireEvent.click(document.querySelector('.arco-select') as HTMLElement)
      const option = await waitFor(() => {
        const el = Array.from(document.querySelectorAll('.arco-select-option')).find(
          o => o.textContent === 'Office',
        )
        expect(el).toBeTruthy()
        return el as HTMLElement
      })
      fireEvent.click(option)

      fireEvent.click(screen.getByRole('button', { name: 'Continue with AI Enhancement' }))

      await waitFor(() =>
        expect(mockDb.enhanceTaskDetails).toHaveBeenCalledWith('Vague task', {
          description:
            'Needs more details\n\nAdditional context:\n'
            + 'What is the deadline? Next Friday\n'
            + 'How many people are involved? 3\n'
            + 'Where will it happen? Office',
          duration: 30,
          importance: 5,
          urgency: 5,
        }),
      )
      expect(screen.queryByText('Please provide an answer')).not.toBeInTheDocument()
      expect(await screen.findByText(/AI Confidence: 85%/)).toBeInTheDocument()
    })

    it('does not refetch questions when the task is clicked again from the overview', async () => {
      renderFlow([NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))
      await screen.findByText('What is the deadline?')

      fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))

      // Status now reflects the gathered-context state in the overview
      expect(await screen.findByText('Gathering Context')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Vague task'))

      expect(mockDb.getContextualQuestions).toHaveBeenCalledTimes(1)
      // Stays on the review step
      expect(screen.getByRole('button', { name: 'Create All Tasks' })).toBeInTheDocument()
    })

    it('renders a selector only for choice questions that actually carry choices', async () => {
      mockDb.getContextualQuestions.mockResolvedValue({
        questions: [
          { question: 'Pick a venue', type: 'choice', purpose: 'location' }, // no choices array
          { question: 'Where will it happen?', type: 'choice', choices: ['Home', 'Office'], purpose: 'location' },
        ],
      })
      renderFlow([NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))
      await screen.findByText('Pick a venue')

      // The Modal portals into document.body; only the question WITH choices gets a Select
      expect(screen.getByText('Where will it happen?')).toBeInTheDocument()
      expect(document.querySelectorAll('.arco-select')).toHaveLength(1)
    })

    it('logs and recovers when question generation fails', async () => {
      mockDb.getContextualQuestions.mockRejectedValue(new Error('questions exploded'))
      renderFlow([NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))

      await waitFor(() =>
        expect(logger.ui.error).toHaveBeenCalledWith(
          'Error getting contextual questions',
          { error: 'questions exploded', taskId: 'task-0' },
          'context-questions-error',
        ),
      )
      expect(screen.queryByText('Generating contextual questions...')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Continue with AI Enhancement' })).not.toBeInTheDocument()
    })
  })

  describe('create all tasks', () => {
    it('creates every ready task with original values, skips pending ones, and closes the modal', async () => {
      renderFlow([READY_TASK, NEEDS_INFO_TASK])

      fireEvent.click(screen.getByRole('button', { name: 'Create All Tasks' }))

      await waitFor(() => expect(mockOnClose).toHaveBeenCalledTimes(1))
      expect(mockAddTask).toHaveBeenCalledTimes(1)
      expect(mockAddTask).toHaveBeenCalledWith(ORIGINAL_PAYLOAD)
    })

    it('includes a task still in the enhancing state, created with original values', async () => {
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByText('Ready task'))
      await screen.findByText(/AI Confidence: 85%/)

      fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))
      expect(await screen.findByText('AI Enhancing')).toBeInTheDocument()

      const createAll = screen.getByRole('button', { name: 'Create All Tasks' })
      expect(createAll).not.toBeDisabled()
      fireEvent.click(createAll)

      await waitFor(() => expect(mockOnClose).toHaveBeenCalledTimes(1))
      // Create All never applies enhancements, even when suggestions are loaded
      expect(mockAddTask).toHaveBeenCalledTimes(1)
      expect(mockAddTask).toHaveBeenCalledWith(ORIGINAL_PAYLOAD)
    })

    it('logs instead of crashing when closing the modal throws', async () => {
      mockOnClose.mockImplementation(() => {
        throw new Error('close exploded')
      })
      renderFlow([READY_TASK])

      fireEvent.click(screen.getByRole('button', { name: 'Create All Tasks' }))

      await waitFor(() =>
        expect(logger.ui.error).toHaveBeenCalledWith(
          'Error creating tasks',
          { error: 'close exploded' },
          'tasks-create-all-error',
        ),
      )
      // The ready task was still created before the failure
      expect(mockAddTask).toHaveBeenCalledWith(ORIGINAL_PAYLOAD)
    })
  })

  describe('multi-task state isolation', () => {
    it('gathering context for one task leaves the sibling task untouched', async () => {
      renderFlow([READY_TASK, NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))
      await screen.findByText('What is the deadline?')

      fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))

      expect(await screen.findByText('Gathering Context')).toBeInTheDocument()
      // The ready sibling is unchanged and Create All stays available
      expect(screen.getByText('Ready to Create')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create All Tasks' })).not.toBeDisabled()
      expect(mockDb.enhanceTaskDetails).not.toHaveBeenCalled()
    })

    it('enhancing one task leaves the sibling task untouched', async () => {
      renderFlow([READY_TASK, NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Ready task'))
      await screen.findByText(/AI Confidence: 85%/)

      fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))

      expect(await screen.findByText('AI Enhancing')).toBeInTheDocument()
      // The needs-info sibling is unchanged — no question fetch was triggered for it
      expect(screen.getByText('Needs Info')).toBeInTheDocument()
      expect(mockDb.getContextualQuestions).not.toHaveBeenCalled()
    })

    it('submitting answers advances only the answered task to enhancement', async () => {
      mockDb.getContextualQuestions.mockResolvedValue({
        questions: [{ question: 'What is the deadline?', type: 'text', purpose: 'timing' }],
      })
      renderFlow([READY_TASK, NEEDS_INFO_TASK])

      fireEvent.click(screen.getByText('Vague task'))
      await screen.findByText('What is the deadline?')

      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Next Friday' } })
      fireEvent.click(screen.getByRole('button', { name: 'Continue with AI Enhancement' }))

      expect(await screen.findByText(/AI Confidence: 85%/)).toBeInTheDocument()
      expect(screen.getByText('AI Enhancements for: Vague task')).toBeInTheDocument()
      // Only the vague task's details were sent for enhancement
      expect(mockDb.enhanceTaskDetails).toHaveBeenCalledTimes(1)
      expect(mockDb.enhanceTaskDetails).toHaveBeenCalledWith('Vague task', {
        description: 'Needs more details\n\nAdditional context:\nWhat is the deadline? Next Friday',
        duration: 30,
        importance: 5,
        urgency: 5,
      })

      fireEvent.click(screen.getByRole('button', { name: 'Back to Overview' }))

      expect(await screen.findByText('AI Enhancing')).toBeInTheDocument()
      expect(screen.getByText('Ready to Create')).toBeInTheDocument()
    })
  })
})
