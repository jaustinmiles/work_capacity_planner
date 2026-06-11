import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { WorkBlocksEditor } from '../WorkBlocksEditor'
import { ResponsiveProvider } from '../../../providers/ResponsiveProvider'
import { Message } from '../../common/Message'
import { WorkBlock, WorkMeeting } from '@shared/work-blocks-types'
import { BlockConfigKind, MeetingType, WorkBlockType } from '@shared/enums'
import { AccumulatedTimeByType } from '@shared/user-task-types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mutable time source so each test controls "now" deterministically
const timeState = vi.hoisted(() => ({ now: new Date('2025-01-15T09:00:00') }))
vi.mock('@shared/time-provider', () => ({
  getCurrentTime: () => timeState.now,
}))

// Mutable task-type store state
const typeStoreState = vi.hoisted(() => ({
  isInitialized: true,
  loadTypes: vi.fn(),
  types: [] as Array<{
    id: string
    sessionId: string
    name: string
    emoji: string
    color: string
    sortOrder: number
    createdAt: Date
    updatedAt: Date
  }>,
}))
vi.mock('@/renderer/store/useUserTaskTypeStore', () => ({
  useSortedUserTaskTypes: () => typeStoreState.types,
  useUserTaskTypeStore: (
    selector: (state: { isInitialized: boolean; loadTypes: () => void }) => unknown,
  ) => selector({ isInitialized: typeStoreState.isInitialized, loadTypes: typeStoreState.loadTypes }),
}))

vi.mock('../../common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

// Replace the clock picker with a plain controlled input so time edits are testable
vi.mock('../../common/ClockTimePicker', () => ({
  ClockTimePicker: (props: { value?: string; onChange?: (value: string) => void }) => (
    <input
      aria-label="time-picker"
      value={props.value ?? ''}
      onChange={(event) => props.onChange?.(event.target.value)}
    />
  ),
}))

// Capture TimelineVisualizer props so we can drive its callbacks
interface CapturedTimelineProps {
  blocks: WorkBlock[]
  meetings: WorkMeeting[]
  onBlockUpdate: (id: string, updates: Partial<WorkBlock>) => void
  onMeetingUpdate: (id: string, updates: Partial<WorkMeeting>) => void
  startHour: number
  endHour: number
  height: number
}
const timelineCapture = vi.hoisted(() => ({ props: null as CapturedTimelineProps | null }))
vi.mock('../../schedule/TimelineVisualizer', () => ({
  TimelineVisualizer: (props: CapturedTimelineProps) => {
    timelineCapture.props = props
    return <div data-testid="timeline-visualizer" />
  },
}))

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const makeUserType = (id: string, name: string, emoji: string, sortOrder: number) => ({
  id,
  sessionId: 'session-1',
  name,
  emoji,
  color: 'blue',
  sortOrder,
  createdAt: new Date('2025-01-01T00:00:00'),
  updatedAt: new Date('2025-01-01T00:00:00'),
})

const focusedBlock = (id: string, startTime: string, endTime: string, totalMinutes: number): WorkBlock => ({
  id,
  startTime,
  endTime,
  typeConfig: { kind: BlockConfigKind.Single, typeId: 'focused' },
  capacity: { totalMinutes },
})

interface EditorPattern {
  id?: string
  blocks: WorkBlock[]
  meetings: WorkMeeting[]
  templateName?: string
}

const renderEditor = (options: {
  pattern?: EditorPattern
  accumulated?: AccumulatedTimeByType
  onSave?: (blocks: WorkBlock[], meetings: WorkMeeting[]) => void | Promise<void>
} = {}) => {
  const onSave = options.onSave ?? vi.fn()
  const view = render(
    <ResponsiveProvider>
      <WorkBlocksEditor
        date="2025-01-15"
        pattern={options.pattern}
        accumulated={options.accumulated}
        onSave={onSave}
      />
    </ResponsiveProvider>,
  )
  return { ...view, onSave }
}

const mustQuery = (root: HTMLElement, selector: string): HTMLElement => {
  const element = root.querySelector<HTMLElement>(selector)
  if (!element) throw new Error(`Element not found: ${selector}`)
  return element
}

/** Assert that some element's trimmed textContent equals the given text (e.g. a capacity Tag). */
const expectTextContent = (text: string) => {
  const matches = screen.getAllByText((_, element) => element?.textContent?.trim() === text)
  expect(matches.length).toBeGreaterThan(0)
}

const queryTextContent = (text: string) =>
  screen.queryAllByText((_, element) => element?.textContent?.trim() === text)

const timePickerValues = () =>
  screen.getAllByLabelText<HTMLInputElement>('time-picker').map((input) => input.value)

/** Click the OK button inside the currently open Popconfirm popup. */
const confirmPopconfirm = async () => {
  const okButton = await waitFor(() => mustQuery(document.body, '.arco-popconfirm .arco-btn-primary'))
  fireEvent.click(okButton)
}

beforeEach(() => {
  vi.clearAllMocks()
  timeState.now = new Date('2025-01-15T09:00:00')
  timelineCapture.props = null
  typeStoreState.isInitialized = true
  typeStoreState.types = [
    makeUserType('focused', 'Focused', '🎯', 0),
    makeUserType('admin', 'Admin', '📋', 1),
  ]
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkBlocksEditor', () => {
  describe('empty and populated rendering', () => {
    it('renders empty states when there is no pattern', () => {
      renderEditor()

      expect(screen.getByText('No work blocks. Click Add Block to get started.')).toBeInTheDocument()
      expect(screen.getByText('No meetings or blocked time.')).toBeInTheDocument()
      expect(screen.getByText('No blocks defined')).toBeInTheDocument()
      expect(screen.getByText('None used')).toBeInTheDocument()
      expect(screen.getByText('--')).toBeInTheDocument()
      // Clear Day only shows when blocks exist
      expect(screen.queryByText('Clear Day')).not.toBeInTheDocument()
      // Timeline gets the (empty) data
      expect(timelineCapture.props?.blocks).toEqual([])
      expect(timelineCapture.props?.meetings).toEqual([])
      expect(timelineCapture.props?.startHour).toBe(0)
      expect(timelineCapture.props?.endHour).toBe(24)
    })

    it('sums capacity by type across single and combo blocks, skipping system blocks', () => {
      const blocks: WorkBlock[] = [
        focusedBlock('b1', '09:00', '10:00', 60),
        {
          id: 'b2',
          startTime: '10:00',
          endTime: '12:00',
          typeConfig: {
            kind: BlockConfigKind.Combo,
            allocations: [
              { typeId: 'focused', ratio: 0.5 },
              { typeId: 'admin', ratio: 0.5 },
            ],
          },
          capacity: { totalMinutes: 120 },
        },
        {
          id: 'b3',
          startTime: '12:00',
          endTime: '13:00',
          typeConfig: { kind: BlockConfigKind.System, systemType: WorkBlockType.Blocked },
          capacity: { totalMinutes: 0 },
        },
      ]
      renderEditor({ pattern: { blocks, meetings: [] } })

      // focused: 60 + floor(120 * 0.5) = 120; admin: 60
      expectTextContent('🎯 2h 0m Focused')
      expectTextContent('📋 1h 0m Admin')
      // The system block contributes nothing to totals but renders a 0m badge
      expectTextContent('0m')
      expect(screen.queryByText('No blocks defined')).not.toBeInTheDocument()
    })

    it('shows used and remaining capacity, with negative remaining and unknown-type fallback', () => {
      const blocks = [focusedBlock('b1', '09:00', '11:00', 120)]
      renderEditor({
        pattern: { blocks, meetings: [] },
        accumulated: { focused: 90, mystery: 30 },
      })

      // Used Today
      expectTextContent('🎯 1h 30m Focused')
      expectTextContent('30m Unknown')
      // Remaining: focused 120-90=30, mystery 0-30=-30
      expectTextContent('🎯 30m Focused')
      expectTextContent('-30m Unknown')
      expect(screen.queryByText('None used')).not.toBeInTheDocument()
      expect(screen.queryByText('--')).not.toBeInTheDocument()
    })

    it('renders meeting rows with type tags and recurring tag', () => {
      const meetings: WorkMeeting[] = [
        { id: 'm1', name: 'Standup', startTime: '09:00', endTime: '09:15', type: MeetingType.Meeting, recurring: 'daily' },
        { id: 'm2', name: 'Lunch', startTime: '12:00', endTime: '13:00', type: MeetingType.Break },
        { id: 'm3', name: 'Errand', startTime: '15:00', endTime: '15:30', type: MeetingType.Personal, recurring: 'none' },
      ]
      renderEditor({ pattern: { blocks: [], meetings } })

      expect(screen.getByText('Standup')).toBeInTheDocument()
      expectTextContent('09:00 - 09:15')
      expect(screen.getByText('meeting')).toBeInTheDocument()
      expect(screen.getByText('break')).toBeInTheDocument()
      expect(screen.getByText('personal')).toBeInTheDocument()
      // recurring tag only shown when set and not 'none'
      expect(screen.getByText('daily')).toBeInTheDocument()
      expect(screen.queryByText('none')).not.toBeInTheDocument()
    })

    it('updates blocks and meetings when the pattern prop changes', () => {
      const initial: EditorPattern = { blocks: [focusedBlock('b1', '09:00', '10:00', 60)], meetings: [] }
      const { rerender, onSave } = renderEditor({ pattern: initial })
      expectTextContent('🎯 1h 0m Focused')

      const next: EditorPattern = {
        blocks: [{
          id: 'b2',
          startTime: '06:00',
          endTime: '07:00',
          typeConfig: { kind: BlockConfigKind.Single, typeId: 'admin' },
          capacity: { totalMinutes: 60 },
        }],
        meetings: [{ id: 'm1', name: 'Sync', startTime: '08:00', endTime: '08:30', type: MeetingType.Meeting }],
      }
      rerender(
        <ResponsiveProvider>
          <WorkBlocksEditor date="2025-01-15" pattern={next} onSave={onSave} />
        </ResponsiveProvider>,
      )

      expectTextContent('📋 1h 0m Admin')
      expect(queryTextContent('🎯 1h 0m Focused')).toHaveLength(0)
      expect(screen.getByText('Sync')).toBeInTheDocument()
      expect(timePickerValues()).toEqual(['06:00', '07:00'])
    })
  })

  describe('task type loading', () => {
    it('loads task types on mount when the store is not initialized', () => {
      typeStoreState.isInitialized = false
      renderEditor()
      expect(typeStoreState.loadTypes).toHaveBeenCalledTimes(1)
    })

    it('does not reload task types when the store is already initialized', () => {
      renderEditor()
      expect(typeStoreState.loadTypes).not.toHaveBeenCalled()
    })
  })

  describe('adding blocks', () => {
    it('adds a one-hour block at the current time and reveals the Clear Day button', () => {
      renderEditor()
      fireEvent.click(screen.getByText('Add Block'))

      expect(timePickerValues()).toEqual(['09:00', '10:00'])
      expectTextContent('60m')
      expectTextContent('🎯 1h 0m Focused')
      expect(screen.getByText('Clear Day')).toBeInTheDocument()
      expect(screen.queryByText('No work blocks. Click Add Block to get started.')).not.toBeInTheDocument()
    })

    it('rounds the start time up to the next 15-minute mark', () => {
      timeState.now = new Date('2025-01-15T09:07:00')
      renderEditor()
      fireEvent.click(screen.getByText('Add Block'))

      expect(timePickerValues()).toEqual(['09:15', '10:15'])
    })

    it('jumps past an occupied slot when the current time overlaps an existing block', () => {
      renderEditor({ pattern: { blocks: [focusedBlock('b1', '09:00', '10:00', 60)], meetings: [] } })
      fireEvent.click(screen.getByText('Add Block'))

      expect(timePickerValues()).toEqual(['09:00', '10:00', '10:00', '11:00'])
    })

    it('clamps the new block end time to the start of the next block', () => {
      renderEditor({ pattern: { blocks: [focusedBlock('b1', '09:30', '12:00', 150)], meetings: [] } })
      fireEvent.click(screen.getByText('Add Block'))

      expect(timePickerValues()).toEqual(['09:30', '12:00', '09:00', '09:30'])
      expectTextContent('30m')
    })

    it('enforces a minimum 15-minute duration when the gap is tiny', () => {
      renderEditor({ pattern: { blocks: [focusedBlock('b1', '09:05', '10:00', 55)], meetings: [] } })
      fireEvent.click(screen.getByText('Add Block'))

      expect(timePickerValues()).toEqual(['09:05', '10:00', '09:00', '09:15'])
      expectTextContent('15m')
    })

    it('clamps near-midnight additions inside the 24h day', () => {
      timeState.now = new Date('2025-01-15T23:50:00')
      renderEditor()
      fireEvent.click(screen.getByText('Add Block'))

      expect(timePickerValues()).toEqual(['23:00', '24:00'])
    })
  })

  describe('editing blocks', () => {
    it('updates a block start time through the time picker', () => {
      renderEditor({ pattern: { blocks: [focusedBlock('b1', '09:00', '10:00', 60)], meetings: [] } })
      const [startInput] = screen.getAllByLabelText<HTMLInputElement>('time-picker')

      fireEvent.change(startInput, { target: { value: '08:00' } })

      expect(timePickerValues()).toEqual(['08:00', '10:00'])
    })

    it('deletes a block after Popconfirm confirmation', async () => {
      const { container } = renderEditor({
        pattern: { blocks: [focusedBlock('b1', '09:00', '10:00', 60)], meetings: [] },
      })

      fireEvent.click(mustQuery(container, '.arco-icon-delete').closest('button') ?? container)
      await confirmPopconfirm()

      await waitFor(() =>
        expect(screen.getByText('No work blocks. Click Add Block to get started.')).toBeInTheDocument(),
      )
      expect(screen.getByText('No blocks defined')).toBeInTheDocument()
    })
  })

  describe('saving and clearing', () => {
    it('saves the current blocks and meetings', () => {
      const blocks = [focusedBlock('b1', '09:00', '10:00', 60)]
      const meetings: WorkMeeting[] = [
        { id: 'm1', name: 'Sync', startTime: '08:00', endTime: '08:30', type: MeetingType.Meeting },
      ]
      const { onSave } = renderEditor({ pattern: { blocks, meetings } })

      fireEvent.click(screen.getByText('Save'))

      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledWith(blocks, meetings)
    })

    it('clears the whole day after confirmation, saving an empty schedule', async () => {
      const { onSave } = renderEditor({
        pattern: {
          blocks: [focusedBlock('b1', '09:00', '10:00', 60)],
          meetings: [{ id: 'm1', name: 'Sync', startTime: '08:00', endTime: '08:30', type: MeetingType.Meeting }],
        },
      })

      fireEvent.click(screen.getByText('Clear Day'))
      expect(await screen.findByText('Clear entire schedule?')).toBeInTheDocument()
      await confirmPopconfirm()

      await waitFor(() => expect(onSave).toHaveBeenCalledWith([], []))
      expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Schedule cleared')
      expect(screen.getByText('No work blocks. Click Add Block to get started.')).toBeInTheDocument()
      expect(screen.getByText('No meetings or blocked time.')).toBeInTheDocument()
    })
  })

  describe('meetings', () => {
    it('adds a sleep block spanning 22:00 to 06:00', () => {
      renderEditor()
      fireEvent.click(screen.getByText('Add Sleep Block'))

      expect(screen.getByText('Sleep')).toBeInTheDocument()
      expectTextContent('22:00 - 06:00')
      expect(screen.getByText('blocked')).toBeInTheDocument()
      expect(screen.queryByText('No meetings or blocked time.')).not.toBeInTheDocument()
    })

    it('shows a validation error when saving a meeting without required fields', async () => {
      renderEditor()
      fireEvent.click(screen.getByText('Add Meeting'))

      expect(await screen.findByText('Add Meeting', { selector: '.arco-modal-title' })).toBeInTheDocument()
      fireEvent.click(mustQuery(document.body, '.arco-modal-footer .arco-btn-primary'))

      await waitFor(() =>
        expect(vi.mocked(Message.error)).toHaveBeenCalledWith('Please fill in all required fields'),
      )
      // No meeting was added
      expect(screen.getByText('No meetings or blocked time.')).toBeInTheDocument()
    })

    it('creates a meeting from the modal form', async () => {
      renderEditor()
      fireEvent.click(screen.getByText('Add Meeting'))
      await screen.findByText('Add Meeting', { selector: '.arco-modal-title' })

      fireEvent.change(screen.getByPlaceholderText('Team standup, Lunch break, etc.'), {
        target: { value: 'Design review' },
      })
      const [startInput, endInput] = screen.getAllByLabelText<HTMLInputElement>('time-picker')
      fireEvent.change(startInput, { target: { value: '13:00' } })
      fireEvent.change(endInput, { target: { value: '13:30' } })
      fireEvent.click(mustQuery(document.body, '.arco-modal-footer .arco-btn-primary'))

      await waitFor(() => expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Meeting saved'))
      expect(screen.getByText('Design review')).toBeInTheDocument()
      expectTextContent('13:00 - 13:30')
      expect(screen.getByText('meeting')).toBeInTheDocument()
    })

    it('cancelling the modal does not add a meeting', async () => {
      const { onSave } = renderEditor()
      fireEvent.click(screen.getByText('Add Meeting'))
      await screen.findByText('Add Meeting', { selector: '.arco-modal-title' })

      const footer = mustQuery(document.body, '.arco-modal-footer')
      const cancelButton = Array.from(footer.querySelectorAll('button')).find(
        (button) => !button.classList.contains('arco-btn-primary'),
      )
      if (!cancelButton) throw new Error('Cancel button not found')
      fireEvent.click(cancelButton)

      // Arco keeps the dismissed modal mounted in jsdom, so assert on the outcome
      // instead of DOM removal: the meeting list is unchanged and nothing persisted.
      expect(screen.getByText('No meetings or blocked time.')).toBeInTheDocument()
      expect(onSave).not.toHaveBeenCalled()
    })

    it('edits an existing meeting in place without duplicating it', async () => {
      renderEditor({
        pattern: {
          blocks: [],
          meetings: [
            { id: 'standup-1', name: 'Standup', startTime: '09:00', endTime: '09:15', type: MeetingType.Meeting, recurring: 'daily' },
          ],
        },
      })

      const { container } = { container: document.body }
      fireEvent.click(mustQuery(container, '.arco-icon-edit').closest('button') ?? container)

      // Existing meetings (id not starting with "meeting-") use the Edit title
      expect(await screen.findByText('Edit Meeting', { selector: '.arco-modal-title' })).toBeInTheDocument()
      const nameInput = screen.getByPlaceholderText<HTMLInputElement>('Team standup, Lunch break, etc.')
      expect(nameInput.value).toBe('Standup')

      fireEvent.change(nameInput, { target: { value: 'Daily Standup' } })
      fireEvent.click(mustQuery(document.body, '.arco-modal-footer .arco-btn-primary'))

      await waitFor(() => expect(screen.getByText('Daily Standup')).toBeInTheDocument())
      expect(screen.queryByText('Standup')).not.toBeInTheDocument()
      expect(vi.mocked(Message.success)).toHaveBeenCalledWith('Meeting saved')
    })

    it('deletes a meeting after Popconfirm confirmation', async () => {
      const { container } = renderEditor({
        pattern: {
          blocks: [],
          meetings: [{ id: 'm1', name: 'Sync', startTime: '08:00', endTime: '08:30', type: MeetingType.Meeting }],
        },
      })

      fireEvent.click(mustQuery(container, '.arco-icon-delete').closest('button') ?? container)
      await confirmPopconfirm()

      await waitFor(() => expect(screen.queryByText('Sync')).not.toBeInTheDocument())
      expect(screen.getByText('No meetings or blocked time.')).toBeInTheDocument()
    })
  })

  describe('timeline integration', () => {
    it('routes timeline block and meeting updates into editor state', () => {
      renderEditor({
        pattern: {
          blocks: [focusedBlock('b1', '09:00', '10:00', 60)],
          meetings: [{ id: 'm1', name: 'Sync', startTime: '08:00', endTime: '08:30', type: MeetingType.Meeting }],
        },
      })

      expect(timelineCapture.props?.blocks).toHaveLength(1)
      expect(timelineCapture.props?.meetings).toHaveLength(1)

      act(() => {
        timelineCapture.props?.onBlockUpdate('b1', { startTime: '07:30' })
      })
      expect(timePickerValues()).toEqual(['07:30', '10:00'])

      act(() => {
        timelineCapture.props?.onMeetingUpdate('m1', { name: 'Renamed Sync' })
      })
      expect(screen.getByText('Renamed Sync')).toBeInTheDocument()
      expect(screen.queryByText('Sync')).not.toBeInTheDocument()
    })
  })
})
