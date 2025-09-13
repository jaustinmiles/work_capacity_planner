import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchedulingDebugInfo } from './SchedulingDebugInfo'
import '@testing-library/jest-dom'

describe('SchedulingDebugInfo', () => {
  const mockDebugInfo = {
    unscheduledItems: [
      {
        id: 'task-1',
        name: 'Unscheduled Task 1',
        duration: 60,
        type: 'focused',
        reason: 'No available capacity',
        priorityBreakdown: {
          total: 85,
          eisenhower: 50,
          deadlineBoost: 20,
          asyncBoost: 5,
          cognitiveMatch: 10,
          contextSwitchPenalty: -5,
          workflowDepthBonus: 5,
        },
      },
      {
        id: 'task-2',
        name: 'Unscheduled Task 2',
        duration: 30,
        type: 'admin',
        reason: 'Dependencies not met',
      },
    ],
    scheduledItems: [
      {
        id: 'scheduled-1',
        name: 'Scheduled Task 1',
        type: 'focused',
        startTime: '2024-01-01T09:00:00',
        duration: 90,
        priority: 90,
        priorityBreakdown: {
          total: 90,
          eisenhower: 60,
          deadlineBoost: 30,
        },
      },
      {
        id: 'scheduled-2',
        name: 'Scheduled Task 2',
        type: 'admin',
        startTime: '2024-01-01T10:30:00',
        duration: 45,
        priority: 60,
      },
    ],
    warnings: [
      'Some tasks exceed available capacity',
      'Consider redistributing workload',
    ],
    unusedFocusCapacity: 120,
    unusedAdminCapacity: 60,
    blockUtilization: [
      {
        date: new Date().toISOString().split('T')[0],
        blockId: 'block-1',
        blockStart: '09:00',
        blockEnd: '12:00',
        capacity: 180,
        used: 120,
        utilizationPercent: 66.67,
        focusUsed: 120,
        focusTotal: 180,
        adminUsed: 0,
        adminTotal: 0,
        type: 'focused',
      },
      {
        date: new Date().toISOString().split('T')[0],
        blockId: 'block-2',
        blockStart: '13:00',
        blockEnd: '17:00',
        capacity: 240,
        used: 60,
        utilizationPercent: 25,
        focusUsed: 0,
        focusTotal: 0,
        adminUsed: 60,
        adminTotal: 240,
        type: 'admin',
        unusedReason: 'Partially utilized',
      },
    ],
  }

  it('renders nothing when debugInfo is null', () => {
    const { container } = render(<SchedulingDebugInfo debugInfo={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders debug info card when provided', () => {
    render(<SchedulingDebugInfo debugInfo={mockDebugInfo} />)
    expect(screen.getByText('Scheduling Debug Info')).toBeInTheDocument()
  })

  it('shows warning icon and count when there are issues', () => {
    render(<SchedulingDebugInfo debugInfo={mockDebugInfo} />)
    expect(screen.getByText('2 unscheduled items')).toBeInTheDocument()
  })

  it('displays warnings in alert', () => {
    render(<SchedulingDebugInfo debugInfo={mockDebugInfo} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    expect(screen.getByText('Some tasks exceed available capacity')).toBeInTheDocument()
    expect(screen.getByText('Consider redistributing workload')).toBeInTheDocument()
  })

  it('shows unscheduled items table with priority breakdown', () => {
    render(<SchedulingDebugInfo debugInfo={mockDebugInfo} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    expect(screen.getByText('Unscheduled Items (2)')).toBeInTheDocument()
    expect(screen.getByText('Unscheduled Task 1')).toBeInTheDocument()
    expect(screen.getByText('No available capacity')).toBeInTheDocument()
    expect(screen.getByText('Dependencies not met')).toBeInTheDocument()
    
    // Check priority breakdown rendering
    expect(screen.getByText(/Total: 85/)).toBeInTheDocument()
    expect(screen.getByText(/E:50/)).toBeInTheDocument()
  })

  it('shows scheduled items table', () => {
    render(<SchedulingDebugInfo debugInfo={mockDebugInfo} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    expect(screen.getByText('Scheduled Items Priority Analysis (First 10 by Schedule Order)')).toBeInTheDocument()
    expect(screen.getByText('Scheduled Task 1')).toBeInTheDocument()
    expect(screen.getByText('Scheduled Task 2')).toBeInTheDocument()
  })

  it('shows block utilization table', () => {
    render(<SchedulingDebugInfo debugInfo={mockDebugInfo} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    expect(screen.getByText('Block Utilization (Current & Next Day)')).toBeInTheDocument()
    expect(screen.getByText('120/180')).toBeInTheDocument() // Focus usage
    expect(screen.getByText('60/240')).toBeInTheDocument() // Admin usage
  })

  it('filters block utilization to current and next day only', () => {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - 2)
    
    const debugInfoWithPastBlocks = {
      ...mockDebugInfo,
      blockUtilization: [
        ...mockDebugInfo.blockUtilization,
        {
          date: pastDate.toISOString().split('T')[0],
          blockId: 'past-block',
          blockStart: '09:00',
          blockEnd: '12:00',
          capacity: 180,
          used: 0,
          utilizationPercent: 0,
          focusUsed: 0,
          focusTotal: 180,
          adminUsed: 0,
          adminTotal: 0,
          type: 'focused',
          unusedReason: 'Block is in the past',
        },
      ],
    }
    
    render(<SchedulingDebugInfo debugInfo={debugInfoWithPastBlocks} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    // Past block should not be shown
    expect(screen.queryByText('past-block')).not.toBeInTheDocument()
  })

  it('handles empty states gracefully', () => {
    const emptyDebugInfo = {
      unscheduledItems: [],
      scheduledItems: [],
      warnings: [],
      unusedFocusCapacity: 0,
      unusedAdminCapacity: 0,
      blockUtilization: [],
    }
    
    render(<SchedulingDebugInfo debugInfo={emptyDebugInfo} />)
    
    // Should still render but not be expanded by default
    expect(screen.getByText('Scheduling Debug Info')).toBeInTheDocument()
  })

  it('sorts unscheduled items by priority', () => {
    const debugInfoWithPriorities = {
      ...mockDebugInfo,
      unscheduledItems: [
        {
          id: 'low',
          name: 'Low Priority',
          duration: 30,
          type: 'admin',
          reason: 'Test',
          priorityBreakdown: { total: 30, eisenhower: 30 },
        },
        {
          id: 'high',
          name: 'High Priority',
          duration: 30,
          type: 'admin',
          reason: 'Test',
          priorityBreakdown: { total: 100, eisenhower: 100 },
        },
        {
          id: 'medium',
          name: 'Medium Priority',
          duration: 30,
          type: 'admin',
          reason: 'Test',
          priorityBreakdown: { total: 60, eisenhower: 60 },
        },
      ],
    }
    
    render(<SchedulingDebugInfo debugInfo={debugInfoWithPriorities} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    const taskNames = screen.getAllByRole('cell').filter(cell => 
      ['High Priority', 'Medium Priority', 'Low Priority'].includes(cell.textContent || '')
    )
    
    expect(taskNames[0].textContent).toBe('High Priority')
    expect(taskNames[1].textContent).toBe('Medium Priority')
    expect(taskNames[2].textContent).toBe('Low Priority')
  })

  it('renders different status tags for block utilization', () => {
    const debugInfoWithStatuses = {
      ...mockDebugInfo,
      blockUtilization: [
        {
          date: new Date().toISOString().split('T')[0],
          blockId: 'fully-used',
          blockStart: '09:00',
          blockEnd: '12:00',
          capacity: 180,
          used: 180,
          utilizationPercent: 100,
          focusUsed: 180,
          focusTotal: 180,
          adminUsed: 0,
          adminTotal: 0,
          type: 'focused',
        },
        {
          date: new Date().toISOString().split('T')[0],
          blockId: 'past',
          blockStart: '07:00',
          blockEnd: '08:00',
          capacity: 60,
          used: 0,
          utilizationPercent: 0,
          focusUsed: 0,
          focusTotal: 60,
          adminUsed: 0,
          adminTotal: 0,
          type: 'focused',
          unusedReason: 'Block is in the past',
        },
        {
          date: new Date().toISOString().split('T')[0],
          blockId: 'started',
          blockStart: '14:00',
          blockEnd: '15:00',
          capacity: 60,
          used: 30,
          utilizationPercent: 50,
          focusUsed: 30,
          focusTotal: 60,
          adminUsed: 0,
          adminTotal: 0,
          type: 'focused',
          unusedReason: 'Block started at 14:00',
        },
      ],
    }
    
    render(<SchedulingDebugInfo debugInfo={debugInfoWithStatuses} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    expect(screen.getByText('Fully utilized')).toBeInTheDocument()
    expect(screen.getByText('Block is in the past')).toBeInTheDocument()
    expect(screen.getByText('Block started at 14:00')).toBeInTheDocument()
  })

  it('handles items without priority breakdown', () => {
    const debugInfoNoPriority = {
      ...mockDebugInfo,
      unscheduledItems: [
        {
          id: 'no-priority',
          name: 'No Priority Task',
          duration: 30,
          type: 'admin',
          reason: 'Test',
        },
      ],
      scheduledItems: [
        {
          id: 'scheduled-no-breakdown',
          name: 'Task without breakdown',
          type: 'focused',
          startTime: '2024-01-01T09:00:00',
          duration: 60,
          priority: 75,
        },
      ],
    }
    
    render(<SchedulingDebugInfo debugInfo={debugInfoNoPriority} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    // Should show dash for unscheduled items without priority - use getAllByText since there might be multiple
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThan(0)
    
    // Should show simple priority tag for scheduled items without breakdown
    expect(screen.getByText('Priority: 75')).toBeInTheDocument()
  })

  it('handles personal time blocks', () => {
    const debugInfoWithPersonal = {
      ...mockDebugInfo,
      blockUtilization: [
        {
          date: new Date().toISOString().split('T')[0],
          blockId: 'personal-block',
          blockStart: '12:00',
          blockEnd: '13:00',
          capacity: 60,
          used: 30,
          utilizationPercent: 50,
          focusUsed: 0,
          focusTotal: 0,
          adminUsed: 0,
          adminTotal: 0,
          personalUsed: 30,
          personalTotal: 60,
          type: 'personal',
        },
      ],
    }
    
    render(<SchedulingDebugInfo debugInfo={debugInfoWithPersonal} />)
    
    // Click to expand the collapse panel
    const header = screen.getByText('Scheduling Debug Info')
    fireEvent.click(header.parentElement!)
    
    // Should show personal utilization
    expect(screen.getByText('30/60')).toBeInTheDocument()
  })
})