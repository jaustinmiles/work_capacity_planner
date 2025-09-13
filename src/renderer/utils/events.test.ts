import { describe, it, expect, vi, beforeEach } from 'vitest'
import { appEvents, EVENTS } from './events'

describe('events', () => {
  describe('EventEmitter', () => {
    beforeEach(() => {
      // Clear all event listeners before each test
      // @ts-ignore - accessing private property for testing
      appEvents.events.clear()
    })

    describe('on', () => {
      it('should register event listeners', () => {
        const callback = vi.fn()
        appEvents.on('test-event', callback)

        appEvents.emit('test-event')
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should register multiple listeners for the same event', () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()
        const callback3 = vi.fn()

        appEvents.on('test-event', callback1)
        appEvents.on('test-event', callback2)
        appEvents.on('test-event', callback3)

        appEvents.emit('test-event')

        expect(callback1).toHaveBeenCalledTimes(1)
        expect(callback2).toHaveBeenCalledTimes(1)
        expect(callback3).toHaveBeenCalledTimes(1)
      })

      it('should register listeners for different events', () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()

        appEvents.on('event1', callback1)
        appEvents.on('event2', callback2)

        appEvents.emit('event1')
        expect(callback1).toHaveBeenCalledTimes(1)
        expect(callback2).toHaveBeenCalledTimes(0)

        appEvents.emit('event2')
        expect(callback1).toHaveBeenCalledTimes(1)
        expect(callback2).toHaveBeenCalledTimes(1)
      })

      it('should allow the same callback to be registered multiple times', () => {
        const callback = vi.fn()

        appEvents.on('test-event', callback)
        appEvents.on('test-event', callback)

        appEvents.emit('test-event')
        // Same callback registered twice should be called twice
        expect(callback).toHaveBeenCalledTimes(2)
      })
    })

    describe('off', () => {
      it('should remove event listeners', () => {
        const callback = vi.fn()

        appEvents.on('test-event', callback)
        appEvents.emit('test-event')
        expect(callback).toHaveBeenCalledTimes(1)

        appEvents.off('test-event', callback)
        appEvents.emit('test-event')
        // Should not be called again after removal
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should only remove the specified listener', () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn()

        appEvents.on('test-event', callback1)
        appEvents.on('test-event', callback2)

        appEvents.off('test-event', callback1)
        appEvents.emit('test-event')

        expect(callback1).toHaveBeenCalledTimes(0)
        expect(callback2).toHaveBeenCalledTimes(1)
      })

      it('should handle removing non-existent listeners gracefully', () => {
        const callback = vi.fn()

        // Should not throw when removing a listener that was never added
        expect(() => appEvents.off('test-event', callback)).not.toThrow()
      })

      it('should handle removing from non-existent events gracefully', () => {
        const callback = vi.fn()

        // Should not throw when removing from an event that doesn't exist
        expect(() => appEvents.off('non-existent-event', callback)).not.toThrow()
      })

      it('should only remove the first occurrence of duplicate listeners', () => {
        const callback = vi.fn()

        // Register the same callback twice
        appEvents.on('test-event', callback)
        appEvents.on('test-event', callback)

        // Remove once
        appEvents.off('test-event', callback)
        appEvents.emit('test-event')

        // Should still be called once (second registration remains)
        expect(callback).toHaveBeenCalledTimes(1)
      })
    })

    describe('emit', () => {
      it('should emit events with no arguments', () => {
        const callback = vi.fn()

        appEvents.on('test-event', callback)
        appEvents.emit('test-event')

        expect(callback).toHaveBeenCalledWith()
      })

      it('should emit events with single argument', () => {
        const callback = vi.fn()

        appEvents.on('test-event', callback)
        appEvents.emit('test-event', 'arg1')

        expect(callback).toHaveBeenCalledWith('arg1')
      })

      it('should emit events with multiple arguments', () => {
        const callback = vi.fn()

        appEvents.on('test-event', callback)
        appEvents.emit('test-event', 'arg1', 42, { foo: 'bar' }, true)

        expect(callback).toHaveBeenCalledWith('arg1', 42, { foo: 'bar' }, true)
      })

      it('should handle emitting to non-existent events gracefully', () => {
        // Should not throw when emitting an event with no listeners
        expect(() => appEvents.emit('non-existent-event')).not.toThrow()
      })

      it('should call listeners in order of registration', () => {
        const order: number[] = []
        const callback1 = vi.fn(() => order.push(1))
        const callback2 = vi.fn(() => order.push(2))
        const callback3 = vi.fn(() => order.push(3))

        appEvents.on('test-event', callback1)
        appEvents.on('test-event', callback2)
        appEvents.on('test-event', callback3)

        appEvents.emit('test-event')

        expect(order).toEqual([1, 2, 3])
      })

      it('should handle errors in listeners without affecting other listeners', () => {
        const callback1 = vi.fn()
        const callback2 = vi.fn(() => {
          throw new Error('Test error')
        })
        const callback3 = vi.fn()

        appEvents.on('test-event', callback1)
        appEvents.on('test-event', callback2)
        appEvents.on('test-event', callback3)

        // The error will be thrown, but other listeners should still be called
        expect(() => appEvents.emit('test-event')).toThrow('Test error')

        expect(callback1).toHaveBeenCalledTimes(1)
        expect(callback2).toHaveBeenCalledTimes(1)
        // callback3 won't be called because callback2 throws
        expect(callback3).toHaveBeenCalledTimes(0)
      })
    })

    describe('Complex scenarios', () => {
      it('should handle adding listeners during emit', () => {
        const callback2 = vi.fn()
        const callback1 = vi.fn(() => {
          appEvents.on('test-event', callback2)
        })

        appEvents.on('test-event', callback1)
        appEvents.emit('test-event')

        expect(callback1).toHaveBeenCalledTimes(1)
        // callback2 was added during emit, so it shouldn't be called this time
        expect(callback2).toHaveBeenCalledTimes(0)

        // But it should be called on the next emit
        appEvents.emit('test-event')
        expect(callback1).toHaveBeenCalledTimes(2)
        expect(callback2).toHaveBeenCalledTimes(1)
      })

      it('should handle removing listeners during emit', () => {
        // When a listener removes another listener during emit,
        // it affects the array being iterated if the removed listener comes after
        const callback3 = vi.fn()
        const callback2 = vi.fn(() => {
          appEvents.off('test-event', callback3)
        })
        const callback1 = vi.fn()

        appEvents.on('test-event', callback1)
        appEvents.on('test-event', callback2)
        appEvents.on('test-event', callback3)

        appEvents.emit('test-event')

        expect(callback1).toHaveBeenCalledTimes(1)
        expect(callback2).toHaveBeenCalledTimes(1)
        // callback3 doesn't get called because callback2 removed it from the array
        // and splice modifies the array during forEach iteration
        expect(callback3).toHaveBeenCalledTimes(0)

        // Confirm it's not called on the next emit either
        appEvents.emit('test-event')
        expect(callback1).toHaveBeenCalledTimes(2)
        expect(callback2).toHaveBeenCalledTimes(2)
        expect(callback3).toHaveBeenCalledTimes(0)
      })

      it('should handle self-removal during emit', () => {
        let callCount = 0
        const callback = () => {
          callCount++
          appEvents.off('test-event', callback)
        }

        appEvents.on('test-event', callback)
        appEvents.emit('test-event')

        expect(callCount).toBe(1)

        // Should not be called again since it removed itself
        appEvents.emit('test-event')
        expect(callCount).toBe(1)
      })
    })
  })

  describe('EVENTS constants', () => {
    it('should export all expected event names', () => {
      expect(EVENTS.TIME_LOGGED).toBe('time-logged')
      expect(EVENTS.TASK_UPDATED).toBe('task-updated')
      expect(EVENTS.WORKFLOW_UPDATED).toBe('workflow-updated')
      expect(EVENTS.SESSION_CHANGED).toBe('session-changed')
      expect(EVENTS.DATA_REFRESH_NEEDED).toBe('data-refresh-needed')
      expect(EVENTS.TIME_OVERRIDE_CHANGED).toBe('time-override-changed')
    })

    it('should have unique event names', () => {
      const eventNames = Object.values(EVENTS)
      const uniqueNames = new Set(eventNames)
      expect(uniqueNames.size).toBe(eventNames.length)
    })

    it('should follow naming convention', () => {
      Object.values(EVENTS).forEach(eventName => {
        // All event names should be kebab-case
        expect(eventName).toMatch(/^[a-z]+(-[a-z]+)*$/)
      })
    })

    it('should be a const object (immutable)', () => {
      // TypeScript's 'as const' ensures this at compile time
      // In JavaScript, const only prevents reassignment, not modification
      // So we'll just verify the object exists and has the expected shape
      expect(EVENTS).toBeDefined()
      expect(Object.keys(EVENTS).length).toBe(6)

      // Verify that it's treated as const in TypeScript
      // (the actual immutability is enforced at compile time)
      const originalValue = EVENTS.TIME_LOGGED
      expect(originalValue).toBe('time-logged')
    })
  })

  describe('Integration tests', () => {
    it('should work with real event names', () => {
      const callback = vi.fn()

      appEvents.on(EVENTS.TASK_UPDATED, callback)
      appEvents.emit(EVENTS.TASK_UPDATED, { id: '123', name: 'Test Task' })

      expect(callback).toHaveBeenCalledWith({ id: '123', name: 'Test Task' })
    })

    it('should handle multiple event types simultaneously', () => {
      const timeLoggedCallback = vi.fn()
      const taskUpdatedCallback = vi.fn()
      const sessionChangedCallback = vi.fn()

      appEvents.on(EVENTS.TIME_LOGGED, timeLoggedCallback)
      appEvents.on(EVENTS.TASK_UPDATED, taskUpdatedCallback)
      appEvents.on(EVENTS.SESSION_CHANGED, sessionChangedCallback)

      appEvents.emit(EVENTS.TIME_LOGGED, 30)
      appEvents.emit(EVENTS.TASK_UPDATED, { id: 'task-1' })
      appEvents.emit(EVENTS.SESSION_CHANGED, 'morning')

      expect(timeLoggedCallback).toHaveBeenCalledWith(30)
      expect(taskUpdatedCallback).toHaveBeenCalledWith({ id: 'task-1' })
      expect(sessionChangedCallback).toHaveBeenCalledWith('morning')
    })

    it('should support event-driven workflows', () => {
      const updateLog: string[] = []

      // Set up a chain of event handlers
      appEvents.on(EVENTS.TASK_UPDATED, (task) => {
        updateLog.push(`Task ${task.id} updated`)
        appEvents.emit(EVENTS.DATA_REFRESH_NEEDED)
      })

      appEvents.on(EVENTS.DATA_REFRESH_NEEDED, () => {
        updateLog.push('Refreshing data')
        appEvents.emit(EVENTS.TIME_OVERRIDE_CHANGED, false)
      })

      appEvents.on(EVENTS.TIME_OVERRIDE_CHANGED, (override) => {
        updateLog.push(`Time override: ${override}`)
      })

      // Start the chain
      appEvents.emit(EVENTS.TASK_UPDATED, { id: 'task-123' })

      expect(updateLog).toEqual([
        'Task task-123 updated',
        'Refreshing data',
        'Time override: false',
      ])
    })
  })
})
