import { describe, it, expect, vi } from 'vitest'
import { appEvents, EVENTS } from '../events'

describe('EventEmitter', () => {
  it('should emit and listen to events', () => {
    const callback = vi.fn()

    appEvents.on('test-event', callback)
    appEvents.emit('test-event', 'arg1', 'arg2')

    expect(callback).toHaveBeenCalledWith('arg1', 'arg2')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('should handle multiple listeners for the same event', () => {
    const callback1 = vi.fn()
    const callback2 = vi.fn()

    appEvents.on('multi-test', callback1)
    appEvents.on('multi-test', callback2)
    appEvents.emit('multi-test', 'data')

    expect(callback1).toHaveBeenCalledWith('data')
    expect(callback2).toHaveBeenCalledWith('data')
  })

  it('should remove listeners with off', () => {
    const callback = vi.fn()

    appEvents.on('remove-test', callback)
    appEvents.emit('remove-test')
    expect(callback).toHaveBeenCalledTimes(1)

    appEvents.off('remove-test', callback)
    appEvents.emit('remove-test')
    expect(callback).toHaveBeenCalledTimes(1) // Still 1, not called again
  })

  it('should handle emitting events with no listeners', () => {
    // Should not throw
    expect(() => appEvents.emit('no-listeners')).not.toThrow()
  })

  it('should have correct event constants', () => {
    expect(EVENTS.TIME_LOGGED).toBe('time-logged')
    expect(EVENTS.TASK_UPDATED).toBe('task-updated')
    expect(EVENTS.WORKFLOW_UPDATED).toBe('workflow-updated')
  })
})
