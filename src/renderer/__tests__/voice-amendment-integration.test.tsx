import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VoiceAmendmentModal } from '../components/voice/VoiceAmendmentModal'
import { Amendment } from '../../shared/amendment-types'
import { Message } from '../components/common/Message'

// Mock the database
vi.mock('../services/database', () => ({
  getDatabase: () => ({
    transcribeAudioBuffer: vi.fn(),
    updateTask: vi.fn(),
    updateSequencedTask: vi.fn(),
    getTaskById: vi.fn(),
    getSequencedTaskById: vi.fn(),
    createWorkSession: vi.fn(),
  }),
}))

// Mock the store
vi.mock('../store/useTaskStore', () => ({
  useTaskStore: () => ({
    tasks: [
      { id: 'task-1', name: 'API Implementation' },
      { id: 'task-2', name: 'Database Migration' },
    ],
    sequencedTasks: [
      { 
        id: 'wf-1', 
        name: 'Feature Deployment',
        steps: [
          { id: 'step-1', name: 'Implementation', duration: 120 },
          { id: 'step-2', name: 'Testing', duration: 60 },
          { id: 'step-3', name: 'Deployment', duration: 30 },
        ]
      },
    ],
  }),
}))

// Mock the Message component
vi.mock('../components/common/Message', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock the electron API
const mockParseAmendment = vi.fn()
global.window = {
  ...global.window,
  electronAPI: {
    ai: {
      parseAmendment: mockParseAmendment,
    },
  },
} as any

describe('Voice Amendment Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Complete Workflow', () => {
    it('should handle text input for workflow status updates', async () => {
      mockParseAmendment.mockResolvedValue({
        amendments: [{
          type: 'status_update',
          target: {
            type: 'workflow',
            id: 'wf-1',
            name: 'Feature Deployment',
            confidence: 0.9,
          },
          newStatus: 'in_progress',
        }],
        confidence: 0.9,
        transcription: 'kick off the deployment workflow',
        warnings: [],
        needsClarification: [],
      })

      const onAmendmentsApplied = vi.fn()
      
      render(
        <VoiceAmendmentModal
          visible={true}
          onClose={() => {}}
          onAmendmentsApplied={onAmendmentsApplied}
        />
      )

      // Switch to text input
      const textInputButton = screen.getByText('Text Input')
      fireEvent.click(textInputButton)

      // Enter text
      const textArea = screen.getByPlaceholderText(/Type your amendment here/)
      fireEvent.change(textArea, { target: { value: 'kick off the deployment workflow' } })

      // Process the amendment
      const processButton = screen.getByText('Process Amendment')
      fireEvent.click(processButton)

      await waitFor(() => {
        expect(mockParseAmendment).toHaveBeenCalledWith(
          'kick off the deployment workflow',
          expect.objectContaining({
            recentTasks: expect.any(Array),
            recentWorkflows: expect.any(Array),
          })
        )
      })

      // Should display the parsed amendment
      await waitFor(() => {
        expect(screen.getByText(/Feature Deployment/)).toBeInTheDocument()
        expect(screen.getByText(/in_progress/)).toBeInTheDocument()
      })

      // Apply the amendment
      const applyButton = screen.getByText(/Apply 1 Change/)
      fireEvent.click(applyButton)

      await waitFor(() => {
        expect(onAmendmentsApplied).toHaveBeenCalledWith([
          expect.objectContaining({
            type: 'status_update',
            newStatus: 'in_progress',
          })
        ])
      })
    })

    it('should handle workflow step modifications', async () => {
      mockParseAmendment.mockResolvedValue({
        amendments: [{
          type: 'step_addition',
          workflowTarget: {
            type: 'workflow',
            id: 'wf-1',
            name: 'Feature Deployment',
            confidence: 0.85,
          },
          stepName: 'Code Review',
          duration: 45,
          type: 'focused',
          afterStep: 'Implementation',
        }],
        confidence: 0.85,
        transcription: 'add a code review step after implementation',
        warnings: [],
        needsClarification: [],
      })

      const onAmendmentsApplied = vi.fn()
      
      render(
        <VoiceAmendmentModal
          visible={true}
          onClose={() => {}}
          onAmendmentsApplied={onAmendmentsApplied}
        />
      )

      // Switch to text input
      const textInputButton = screen.getByText('Text Input')
      fireEvent.click(textInputButton)

      // Enter text
      const textArea = screen.getByPlaceholderText(/Type your amendment here/)
      fireEvent.change(textArea, { 
        target: { value: 'add a code review step after implementation' } 
      })

      // Process the amendment
      const processButton = screen.getByText('Process Amendment')
      fireEvent.click(processButton)

      await waitFor(() => {
        expect(mockParseAmendment).toHaveBeenCalled()
      })

      // Should display the step addition
      await waitFor(() => {
        expect(screen.getByText(/Code Review/)).toBeInTheDocument()
      })

      // Apply the amendment
      const applyButton = screen.getByText(/Apply 1 Change/)
      fireEvent.click(applyButton)

      await waitFor(() => {
        expect(onAmendmentsApplied).toHaveBeenCalledWith([
          expect.objectContaining({
            type: 'step_addition',
            stepName: 'Code Review',
          })
        ])
      })
    })

    it('should handle multiple amendments from one input', async () => {
      mockParseAmendment.mockResolvedValue({
        amendments: [
          {
            type: 'status_update',
            target: {
              type: 'workflow',
              id: 'wf-1',
              name: 'Feature Deployment',
              confidence: 0.9,
            },
            newStatus: 'completed',
            stepName: 'Testing',
          },
          {
            type: 'time_log',
            target: {
              type: 'workflow',
              id: 'wf-1',
              name: 'Feature Deployment',
              confidence: 0.9,
            },
            duration: 90,
            stepName: 'Testing',
          },
        ],
        confidence: 0.88,
        transcription: 'finished testing step, took an hour and a half',
        warnings: [],
        needsClarification: [],
      })

      const onAmendmentsApplied = vi.fn()
      
      render(
        <VoiceAmendmentModal
          visible={true}
          onClose={() => {}}
          onAmendmentsApplied={onAmendmentsApplied}
        />
      )

      // Switch to text input
      const textInputButton = screen.getByText('Text Input')
      fireEvent.click(textInputButton)

      // Enter text
      const textArea = screen.getByPlaceholderText(/Type your amendment here/)
      fireEvent.change(textArea, { 
        target: { value: 'finished testing step, took an hour and a half' } 
      })

      // Process the amendment
      const processButton = screen.getByText('Process Amendment')
      fireEvent.click(processButton)

      await waitFor(() => {
        expect(mockParseAmendment).toHaveBeenCalled()
      })

      // Should display both amendments
      await waitFor(() => {
        expect(screen.getByText(/completed/)).toBeInTheDocument()
        expect(screen.getByText(/90 minutes/)).toBeInTheDocument()
      })

      // Apply both amendments
      const applyButton = screen.getByText(/Apply 2 Changes/)
      fireEvent.click(applyButton)

      await waitFor(() => {
        expect(onAmendmentsApplied).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'status_update',
              newStatus: 'completed',
            }),
            expect.objectContaining({
              type: 'time_log',
              duration: 90,
            }),
          ])
        )
      })
    })

    it('should allow selective amendment application', async () => {
      mockParseAmendment.mockResolvedValue({
        amendments: [
          {
            type: 'status_update',
            target: {
              type: 'task',
              id: 'task-1',
              name: 'API Implementation',
              confidence: 0.8,
            },
            newStatus: 'completed',
          },
          {
            type: 'note_addition',
            target: {
              type: 'task',
              id: 'task-2',
              name: 'Database Migration',
              confidence: 0.6,
            },
            note: 'This might be wrong',
            append: true,
          },
        ],
        confidence: 0.7,
        transcription: 'finished api and database needs work',
        warnings: [],
        needsClarification: [],
      })

      const onAmendmentsApplied = vi.fn()
      
      render(
        <VoiceAmendmentModal
          visible={true}
          onClose={() => {}}
          onAmendmentsApplied={onAmendmentsApplied}
        />
      )

      // Process text input
      const textInputButton = screen.getByText('Text Input')
      fireEvent.click(textInputButton)

      const textArea = screen.getByPlaceholderText(/Type your amendment here/)
      fireEvent.change(textArea, { 
        target: { value: 'finished api and database needs work' } 
      })

      const processButton = screen.getByText('Process Amendment')
      fireEvent.click(processButton)

      await waitFor(() => {
        expect(mockParseAmendment).toHaveBeenCalled()
      })

      // Wait for amendments to be displayed
      await waitFor(() => {
        expect(screen.getByText(/API Implementation/)).toBeInTheDocument()
        expect(screen.getByText(/Database Migration/)).toBeInTheDocument()
      })

      // Find and click on the second amendment to deselect it
      const amendments = screen.getAllByRole('listitem')
      expect(amendments).toHaveLength(2)
      fireEvent.click(amendments[1]) // Deselect the note addition

      // Apply only the selected amendment
      const applyButton = screen.getByText(/Apply 1 Change/)
      fireEvent.click(applyButton)

      await waitFor(() => {
        expect(onAmendmentsApplied).toHaveBeenCalledWith([
          expect.objectContaining({
            type: 'status_update',
            newStatus: 'completed',
          })
        ])
        // Should NOT include the note addition
        expect(onAmendmentsApplied).not.toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              type: 'note_addition',
            })
          ])
        )
      })
    })

    it('should show clarification needs', async () => {
      mockParseAmendment.mockResolvedValue({
        amendments: [],
        confidence: 0.2,
        transcription: 'do the thing with the stuff',
        warnings: ['Could not identify specific task or workflow'],
        needsClarification: ['Please specify which task or workflow you want to update'],
      })

      render(
        <VoiceAmendmentModal
          visible={true}
          onClose={() => {}}
        />
      )

      // Process unclear input
      const textInputButton = screen.getByText('Text Input')
      fireEvent.click(textInputButton)

      const textArea = screen.getByPlaceholderText(/Type your amendment here/)
      fireEvent.change(textArea, { 
        target: { value: 'do the thing with the stuff' } 
      })

      const processButton = screen.getByText('Process Amendment')
      fireEvent.click(processButton)

      await waitFor(() => {
        expect(mockParseAmendment).toHaveBeenCalled()
      })

      // Should show warning and clarification messages
      await waitFor(() => {
        expect(screen.getByText(/Could not identify specific task or workflow/)).toBeInTheDocument()
        expect(screen.getByText(/Please specify which task or workflow/)).toBeInTheDocument()
      })

      // Should show "Try Again" button
      expect(screen.getByText('Try Again')).toBeInTheDocument()
    })

    it('should handle errors gracefully', async () => {
      mockParseAmendment.mockRejectedValue(new Error('AI service unavailable'))

      render(
        <VoiceAmendmentModal
          visible={true}
          onClose={() => {}}
        />
      )

      // Try to process input
      const textInputButton = screen.getByText('Text Input')
      fireEvent.click(textInputButton)

      const textArea = screen.getByPlaceholderText(/Type your amendment here/)
      fireEvent.change(textArea, { 
        target: { value: 'complete the api implementation' } 
      })

      const processButton = screen.getByText('Process Amendment')
      fireEvent.click(processButton)

      await waitFor(() => {
        expect(mockParseAmendment).toHaveBeenCalled()
      })

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/Failed to parse amendments/)).toBeInTheDocument()
      })
    })
  })

  describe('Active Context Usage', () => {
    it('should use active task context', async () => {
      mockParseAmendment.mockResolvedValue({
        amendments: [{
          type: 'status_update',
          target: {
            type: 'task',
            id: 'task-1',
            name: 'API Implementation',
            confidence: 1.0,
          },
          newStatus: 'completed',
        }],
        confidence: 0.95,
        transcription: 'mark this as complete',
        warnings: [],
        needsClarification: [],
      })

      render(
        <VoiceAmendmentModal
          visible={true}
          onClose={() => {}}
          activeTaskId="task-1"
        />
      )

      // Process with active context
      const textInputButton = screen.getByText('Text Input')
      fireEvent.click(textInputButton)

      const textArea = screen.getByPlaceholderText(/Type your amendment here/)
      fireEvent.change(textArea, { 
        target: { value: 'mark this as complete' } 
      })

      const processButton = screen.getByText('Process Amendment')
      fireEvent.click(processButton)

      await waitFor(() => {
        expect(mockParseAmendment).toHaveBeenCalledWith(
          'mark this as complete',
          expect.objectContaining({
            activeTaskId: 'task-1',
          })
        )
      })

      // Should show high confidence
      await waitFor(() => {
        expect(screen.getByText(/100%/)).toBeInTheDocument()
      })
    })

    it('should use active workflow context', async () => {
      mockParseAmendment.mockResolvedValue({
        amendments: [{
          type: 'status_update',
          target: {
            type: 'workflow',
            id: 'wf-1',
            name: 'Feature Deployment',
            confidence: 1.0,
          },
          newStatus: 'in_progress',
        }],
        confidence: 0.95,
        transcription: 'start this',
        warnings: [],
        needsClarification: [],
      })

      render(
        <VoiceAmendmentModal
          visible={true}
          onClose={() => {}}
          activeWorkflowId="wf-1"
        />
      )

      // Process with active context
      const textInputButton = screen.getByText('Text Input')
      fireEvent.click(textInputButton)

      const textArea = screen.getByPlaceholderText(/Type your amendment here/)
      fireEvent.change(textArea, { 
        target: { value: 'start this' } 
      })

      const processButton = screen.getByText('Process Amendment')
      fireEvent.click(processButton)

      await waitFor(() => {
        expect(mockParseAmendment).toHaveBeenCalledWith(
          'start this',
          expect.objectContaining({
            activeWorkflowId: 'wf-1',
          })
        )
      })
    })
  })
})