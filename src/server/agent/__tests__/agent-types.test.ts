/**
 * Tests for agent SSE event types
 *
 * Verifies that SSE events can be serialized and deserialized
 * correctly for the client-server stream.
 */

import { describe, it, expect } from 'vitest'
import type {
  AgentSSEEvent,
  AgentTextDeltaEvent,
  AgentToolStatusEvent,
  AgentProposedActionEvent,
  AgentActionResultEvent,
  AgentDoneEvent,
  AgentErrorEvent,
} from '../../../shared/agent-types'

describe('agent SSE event serialization', () => {
  /** Simulate the SSE write/parse round-trip */
  function roundTrip(event: AgentSSEEvent): AgentSSEEvent {
    const serialized = `data: ${JSON.stringify(event)}\n\n`
    const jsonStr = serialized.replace(/^data: /, '').trim()
    return JSON.parse(jsonStr) as AgentSSEEvent
  }

  it('should round-trip a text_delta event', () => {
    const event: AgentTextDeltaEvent = {
      type: 'text_delta',
      content: 'okay so you have 3 tasks due today',
    }

    const parsed = roundTrip(event)
    expect(parsed).toEqual(event)
  })

  it('should round-trip a tool_status event', () => {
    const event: AgentToolStatusEvent = {
      type: 'tool_status',
      toolName: 'get_tasks',
      toolCallId: 'toolu_abc123',
      status: 'completed',
      label: 'Checking your tasks...',
      durationMs: 42,
    }

    const parsed = roundTrip(event)
    expect(parsed).toEqual(event)
  })

  it('should round-trip a proposed_action event', () => {
    const event: AgentProposedActionEvent = {
      type: 'proposed_action',
      proposalId: 'proposal-123',
      toolName: 'create_task',
      toolInput: {
        name: 'Review Q4 numbers',
        duration: 60,
        importance: 7,
        urgency: 5,
        type: 'type-abc',
      },
      preview: {
        title: 'Create Task',
        description: '"Review Q4 numbers" — 60min, importance 7/10, urgency 5/10',
        details: { name: 'Review Q4 numbers', duration: '60 minutes' },
      },
    }

    const parsed = roundTrip(event)
    expect(parsed).toEqual(event)
  })

  it('should round-trip an action_result event with data', () => {
    const event: AgentActionResultEvent = {
      type: 'action_result',
      proposalId: 'proposal-123',
      status: 'applied',
      result: { id: 'task-456', name: 'Review Q4 numbers' },
    }

    const parsed = roundTrip(event)
    expect(parsed).toEqual(event)
  })

  it('should round-trip an action_result rejection', () => {
    const event: AgentActionResultEvent = {
      type: 'action_result',
      proposalId: 'proposal-456',
      status: 'rejected',
    }

    const parsed = roundTrip(event)
    expect(parsed).toEqual(event)
  })

  it('should round-trip a done event', () => {
    const event: AgentDoneEvent = {
      type: 'done',
      toolCallCount: 5,
      loopIterations: 3,
    }

    const parsed = roundTrip(event)
    expect(parsed).toEqual(event)
  })

  it('should round-trip an error event', () => {
    const event: AgentErrorEvent = {
      type: 'error',
      message: 'Agent reached maximum number of tool calls',
      code: 'MAX_ITERATIONS',
    }

    const parsed = roundTrip(event)
    expect(parsed).toEqual(event)
  })

  it('should handle special characters in text content', () => {
    const event: AgentTextDeltaEvent = {
      type: 'text_delta',
      content: 'you\'ve got "deep work" blocks — 3 hours total\nnext one starts at 2pm',
    }

    const parsed = roundTrip(event)
    expect(parsed).toEqual(event)
  })
})
