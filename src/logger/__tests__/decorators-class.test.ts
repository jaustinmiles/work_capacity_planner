import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loggedClass, watch } from '../decorators-class'
import { LogScope } from '../types'

// Mock the scope helper
const mockLogger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
}

vi.mock('../scope-helper', () => ({
  getScopedLogger: () => mockLogger,
}))

describe('decorators-class', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loggedClass', () => {
    it('should log class instantiation', () => {
      class TestClass {
        value: string
        constructor(value: string) {
          this.value = value
        }
      }

      const WrappedClass = loggedClass({ scope: LogScope.System })(TestClass)
      const instance = new WrappedClass('test-value')

      expect(instance.value).toBe('test-value')
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('new TestClass'),
        expect.objectContaining({
          class: 'TestClass',
          args: ['test-value'],
        }),
        expect.any(String),
      )
    })

    it('should use default scope when not specified', () => {
      class DefaultScopeClass {}

      const WrappedClass = loggedClass()(DefaultScopeClass)
      new WrappedClass()

      expect(mockLogger.info).toHaveBeenCalled()
    })

    it('should use custom tag when provided', () => {
      class TaggedClass {}

      const WrappedClass = loggedClass({ tag: 'custom-tag' })(TaggedClass)
      new WrappedClass()

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'custom-tag',
      )
    })

    it('should wrap destroy method', () => {
      class DestroyableClass {
        destroyed = false
        destroy() {
          this.destroyed = true
        }
      }

      const WrappedClass = loggedClass()(DestroyableClass)
      const instance = new WrappedClass()

      // Clear mock from constructor log
      mockLogger.info.mockClear()

      instance.destroy()

      expect(instance.destroyed).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('DestroyableClass.destroy'),
        expect.objectContaining({
          class: 'DestroyableClass',
          method: 'destroy',
        }),
        expect.any(String),
      )
    })

    it('should wrap cleanup method', () => {
      class CleanupClass {
        cleanedUp = false
        cleanup() {
          this.cleanedUp = true
        }
      }

      const WrappedClass = loggedClass()(CleanupClass)
      const instance = new WrappedClass()

      mockLogger.info.mockClear()
      instance.cleanup()

      expect(instance.cleanedUp).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('CleanupClass.cleanup'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should wrap dispose method', () => {
      class DisposableClass {
        disposed = false
        dispose() {
          this.disposed = true
        }
      }

      const WrappedClass = loggedClass()(DisposableClass)
      const instance = new WrappedClass()

      mockLogger.info.mockClear()
      instance.dispose()

      expect(instance.disposed).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('DisposableClass.dispose'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should wrap unmount method', () => {
      class UnmountableClass {
        unmounted = false
        unmount() {
          this.unmounted = true
        }
      }

      const WrappedClass = loggedClass()(UnmountableClass)
      const instance = new WrappedClass()

      mockLogger.info.mockClear()
      instance.unmount()

      expect(instance.unmounted).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('UnmountableClass.unmount'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should wrap componentWillUnmount method', () => {
      class ReactLikeClass {
        unmounted = false
        componentWillUnmount() {
          this.unmounted = true
        }
      }

      const WrappedClass = loggedClass()(ReactLikeClass)
      const instance = new WrappedClass()

      mockLogger.info.mockClear()
      instance.componentWillUnmount()

      expect(instance.unmounted).toBe(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('ReactLikeClass.componentWillUnmount'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should only wrap first destructor found', () => {
      class MultiDestructorClass {
        destroyCalled = false
        cleanupCalled = false
        destroy() {
          this.destroyCalled = true
        }
        cleanup() {
          this.cleanupCalled = true
        }
      }

      const WrappedClass = loggedClass()(MultiDestructorClass)
      const instance = new WrappedClass()

      mockLogger.info.mockClear()
      instance.destroy()
      instance.cleanup()

      // destroy is wrapped and logged, cleanup is not wrapped
      expect(mockLogger.info).toHaveBeenCalledTimes(1)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('destroy'),
        expect.any(Object),
        expect.any(String),
      )
    })

    it('should not log args when constructor has no arguments', () => {
      class NoArgsClass {}

      const WrappedClass = loggedClass()(NoArgsClass)
      new WrappedClass()

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          class: 'NoArgsClass',
          args: undefined,
        }),
        expect.any(String),
      )
    })

    it('should preserve static properties', () => {
      class StaticClass {
        static staticValue = 42
        static staticMethod() {
          return 'static'
        }
      }

      const WrappedClass = loggedClass()(StaticClass)

      expect(WrappedClass.staticValue).toBe(42)
      expect(WrappedClass.staticMethod()).toBe('static')
    })
  })

  describe('watch', () => {
    it('should log property writes', () => {
      const target = { constructor: { name: 'TestClass' } }
      const propertyKey = 'testProp'

      // Apply the decorator
      watch({ scope: LogScope.System })(target, propertyKey)

      // Set the property
      ;(target as any).testProp = 'new value'

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Property set: testProp'),
        expect.objectContaining({
          property: 'testProp',
          newValue: 'new value',
        }),
        expect.any(String),
      )
    })

    it('should track old and new values', () => {
      const target = { constructor: { name: 'TestClass' } }
      const propertyKey = 'trackedProp'

      watch()(target, propertyKey)

      ;(target as any).trackedProp = 'first'
      mockLogger.debug.mockClear()

      ;(target as any).trackedProp = 'second'

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          oldValue: 'first',
          newValue: 'second',
        }),
        expect.any(String),
      )
    })

    it('should log property reads when logReads is true', () => {
      const target = { constructor: { name: 'TestClass' } }
      const propertyKey = 'readableProp'

      watch({ logReads: true })(target, propertyKey)

      // Set the property first
      ;(target as any).readableProp = 'value'
      mockLogger.trace.mockClear()

      // Read the property
      const _value = (target as any).readableProp

      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining('Property read: readableProp'),
        expect.objectContaining({
          property: 'readableProp',
          value: 'value',
        }),
        expect.any(String),
      )
    })

    it('should not log property reads by default', () => {
      const target = { constructor: { name: 'TestClass' } }
      const propertyKey = 'silentReadProp'

      watch()(target, propertyKey)

      ;(target as any).silentReadProp = 'value'
      mockLogger.trace.mockClear()

      const _value = (target as any).silentReadProp

      expect(mockLogger.trace).not.toHaveBeenCalled()
    })

    it('should use custom tag when provided', () => {
      const target = { constructor: { name: 'TestClass' } }
      const propertyKey = 'taggedProp'

      watch({ tag: 'custom-prop-tag' })(target, propertyKey)

      ;(target as any).taggedProp = 'value'

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'custom-prop-tag',
      )
    })

    it('should use default tag based on class and property name', () => {
      const target = { constructor: { name: 'MyClass' } }
      const propertyKey = 'myProp'

      watch()(target, propertyKey)

      ;(target as any).myProp = 'value'

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        'MyClass.myProp',
      )
    })

    it('should return correct value from getter', () => {
      const target = { constructor: { name: 'TestClass' } }
      const propertyKey = 'gettableProp'

      watch()(target, propertyKey)

      ;(target as any).gettableProp = 'expected value'

      expect((target as any).gettableProp).toBe('expected value')
    })
  })
})
