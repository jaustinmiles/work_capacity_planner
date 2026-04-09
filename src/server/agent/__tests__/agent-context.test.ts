/**
 * Tests for agent context builder
 *
 * Verifies the slim system prompt is well-formed and
 * includes the essential personality and session info.
 */

import { describe, it, expect, vi } from 'vitest'
import { buildAgentSystemPrompt } from '../agent-context'

// Mock time-provider to get deterministic output
vi.mock('../../../shared/time-provider', () => ({
  getCurrentTime: () => new Date('2026-04-07T14:30:00'),
  getLocalDateString: () => '2026-04-07',
}))

describe('buildAgentSystemPrompt', () => {
  it('should include the peer collaborator personality', () => {
    const prompt = buildAgentSystemPrompt({
      sessionName: 'My Session',
      sessionId: 'session-1',
    })

    expect(prompt).toContain('peer collaborator')
    expect(prompt).toContain('Casual and direct')
    expect(prompt).toContain('Never say "just."')
  })

  it('should include ADHD-awareness section', () => {
    const prompt = buildAgentSystemPrompt({
      sessionName: 'My Session',
      sessionId: 'session-1',
    })

    expect(prompt).toContain('ADHD')
    expect(prompt).toContain('Starting is the hardest part')
    expect(prompt).toContain('Time blindness')
    expect(prompt).toContain('Decision paralysis')
  })

  it('should include tool usage instructions', () => {
    const prompt = buildAgentSystemPrompt({
      sessionName: 'My Session',
      sessionId: 'session-1',
    })

    expect(prompt).toContain('Read first, then act')
    expect(prompt).toContain('Write tools require user approval')
    expect(prompt).toContain('get_task_types')
  })

  it('should include current date and session name', () => {
    const prompt = buildAgentSystemPrompt({
      sessionName: 'Work Session Q2',
      sessionId: 'session-1',
    })

    expect(prompt).toContain('2026-04-07')
    expect(prompt).toContain('Work Session Q2')
  })

  it('should include active work session when provided', () => {
    const prompt = buildAgentSystemPrompt({
      sessionName: 'My Session',
      sessionId: 'session-1',
      activeWorkSessionTask: 'Review PR #42',
    })

    expect(prompt).toContain('Currently working on: Review PR #42')
  })

  it('should not include active work session line when not provided', () => {
    const prompt = buildAgentSystemPrompt({
      sessionName: 'My Session',
      sessionId: 'session-1',
    })

    expect(prompt).not.toContain('Currently working on')
  })

  it('should include data integrity rules', () => {
    const prompt = buildAgentSystemPrompt({
      sessionName: 'My Session',
      sessionId: 'session-1',
    })

    expect(prompt).toContain('Check before creating')
    expect(prompt).toContain('Task type IDs are required')
    expect(prompt).toContain('ISO 8601')
  })

  it('should be significantly shorter than 2000 characters', () => {
    const prompt = buildAgentSystemPrompt({
      sessionName: 'My Session',
      sessionId: 'session-1',
    })

    // The old prompt was ~400 lines / ~15000 chars with context dump.
    // The new one should be well under 4000 chars (personality + tool instructions + rules).
    expect(prompt.length).toBeLessThan(4000)
  })
})
