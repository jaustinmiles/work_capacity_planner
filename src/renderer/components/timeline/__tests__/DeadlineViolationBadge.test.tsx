import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DeadlineViolationBadge } from '../DeadlineViolationBadge'

describe('DeadlineViolationBadge', () => {

  it('should render violation badge when deadline is missed', () => {
    const deadline = new Date('2025-09-04T14:00:00') // 1 hour ago
    const endTime = new Date('2025-09-04T17:00:00') // 2 hours from now

    render(
      <DeadlineViolationBadge
        deadline={deadline}
        endTime={endTime}
      />,
    )

    expect(screen.getByText('DEADLINE MISSED')).toBeInTheDocument()
  })

  it('should not render when deadline is not violated', () => {
    const deadline = new Date('2025-09-04T18:00:00') // 3 hours from now
    const endTime = new Date('2025-09-04T17:00:00') // 2 hours from now (before deadline)

    const { container } = render(
      <DeadlineViolationBadge
        deadline={deadline}
        endTime={endTime}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

  it('should show workflow-specific text for workflows', () => {
    const deadline = new Date('2025-09-04T14:30:00') // 30 min ago
    const endTime = new Date('2025-09-04T16:00:00') // 1 hour from now

    render(
      <DeadlineViolationBadge
        deadline={deadline}
        endTime={endTime}
        isWorkflow={true}
        workflowName="Evening Preparation"
      />,
    )

    expect(screen.getByText('WORKFLOW DEADLINE MISSED')).toBeInTheDocument()
  })

  it('should not render when visible is false', () => {
    const deadline = new Date('2025-09-04T14:00:00')
    const endTime = new Date('2025-09-04T16:00:00')

    const { container } = render(
      <DeadlineViolationBadge
        deadline={deadline}
        endTime={endTime}
        visible={false}
      />,
    )

    expect(container.firstChild).toBeNull()
  })

})
