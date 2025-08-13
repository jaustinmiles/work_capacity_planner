import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionManager } from './SessionManager'

// Mock the electronAPI
const mockElectronAPI = {
  db: {
    getSessions: vi.fn() as any,
    createSession: vi.fn() as any,
    switchSession: vi.fn() as any,
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
  },
}

// Add the mock to window
;(global as any).window = {
  electronAPI: mockElectronAPI,
}

describe('SessionManager', () => {
  const mockOnClose = vi.fn()
  const mockOnSessionChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render session manager modal when visible', () => {
    render(
      <SessionManager
        visible={true}
        onClose={mockOnClose}
        onSessionChange={mockOnSessionChange}
      />,
    )

    expect(screen.getByText('Session Management')).toBeInTheDocument()
  })

  it('should load and display sessions on mount', async () => {
    const mockSessions = [
      {
        id: 'session-1',
        name: 'Project Alpha',
        description: 'Main project work',
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
      },
      {
        id: 'session-2',
        name: 'Planning Session',
        description: 'Q1 planning',
        isActive: false,
        createdAt: new Date('2024-01-10'),
        updatedAt: new Date('2024-01-10'),
      },
    ]

    ;(window.electronAPI.db.getSessions as any).mockResolvedValue(mockSessions)

    render(
      <SessionManager
        visible={true}
        onClose={mockOnClose}
        onSessionChange={mockOnSessionChange}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Project Alpha')).toBeInTheDocument()
      expect(screen.getByText('Planning Session')).toBeInTheDocument()
    })

    // Check active session is marked
    expect(screen.getByText('Active Session')).toBeInTheDocument()
  })

  it('should create a new session', async () => {
    const user = userEvent.setup()

    ;(window.electronAPI.db.getSessions as any).mockResolvedValue([])
    ;(window.electronAPI.db.createSession as any).mockResolvedValue({
      id: 'new-session',
      name: 'New Project',
      description: 'Test description',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    render(
      <SessionManager
        visible={true}
        onClose={mockOnClose}
        onSessionChange={mockOnSessionChange}
      />,
    )

    // Click new session button
    const newSessionButton = screen.getByText('New Session')
    await user.click(newSessionButton)

    // Fill in the form
    const nameInput = screen.getByPlaceholderText('e.g., Project Alpha, Q4 Planning')
    const descriptionInput = screen.getByPlaceholderText('Describe what this session is for...')

    await user.type(nameInput, 'New Project')
    await user.type(descriptionInput, 'Test description')

    // Submit the form
    const createButton = screen.getByText('Create Session')
    await user.click(createButton)

    await waitFor(() => {
      expect(window.electronAPI.db.createSession).toHaveBeenCalledWith(
        'New Project',
        'Test description',
      )
      expect(mockOnSessionChange).toHaveBeenCalled()
    })
  })

  it('should switch between sessions', async () => {
    const user = userEvent.setup()

    const mockSessions = [
      {
        id: 'session-1',
        name: 'Active Session',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'session-2',
        name: 'Inactive Session',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    ;(window.electronAPI.db.getSessions as any).mockResolvedValue(mockSessions)
    ;(window.electronAPI.db.switchSession as any).mockResolvedValue({
      ...mockSessions[1],
      isActive: true,
    })

    render(
      <SessionManager
        visible={true}
        onClose={mockOnClose}
        onSessionChange={mockOnSessionChange}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Inactive Session')).toBeInTheDocument()
    })

    // Find and click the switch button for the inactive session
    const switchButtons = screen.getAllByText('Switch')
    await user.click(switchButtons[0])

    await waitFor(() => {
      expect(window.electronAPI.db.switchSession).toHaveBeenCalledWith('session-2')
      expect(mockOnSessionChange).toHaveBeenCalled()
    })
  })

  it('should not show delete button for active session', async () => {
    const mockSessions = [
      {
        id: 'session-1',
        name: 'Active Session',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    ;(window.electronAPI.db.getSessions as any).mockResolvedValue(mockSessions)

    render(
      <SessionManager
        visible={true}
        onClose={mockOnClose}
        onSessionChange={mockOnSessionChange}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Active Session')).toBeInTheDocument()
    })

    // Should not find any delete buttons since it's the active session
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument()
  })
})
