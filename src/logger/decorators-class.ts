/**
 * Class-level and property decorators for automatic logging
 */

import { LogScope } from './types'
import { getScopedLogger } from './scope-helper'

/**
 * DECORATOR #3: Class Lifecycle Logger
 *
 * This decorator logs class instantiation and destruction.
 * It does NOT automatically log all methods - developers should
 * use @logged on specific methods they care about.
 *
 * How it works:
 * 1. Wraps the constructor to log when instances are created
 * 2. If the class has a destructor/cleanup method, logs that too
 *
 * @example
 * @loggedClass({ scope: LogScope.UI })
 * class WorkflowComponent {
 *   constructor(id: string) {
 *     // Logs: "→ new WorkflowComponent" with args: ["workflow-123"]
 *   }
 *
 *   @logged({ scope: LogScope.UI })  // Explicitly log this method
 *   async loadWorkflow() {
 *     // Only logged because we added @logged
 *   }
 *
 *   async saveWorkflow() {
 *     // NOT logged unless you add @logged
 *   }
 *
 *   destroy() {
 *     // If exists, logs: "✗ WorkflowComponent.destroy"
 *   }
 * }
 */
export function loggedClass(options: { scope?: LogScope; tag?: string } = {}) {
  const { scope = LogScope.System, tag } = options

  return function <T extends { new(...args: any[]): {} }>(constructor: T) {
    const className = constructor.name

    // Create a new constructor that wraps the original
    const wrappedConstructor: any = function (...args: any[]) {
      const scopedLogger = getScopedLogger(scope)
      const classTag = tag || className

      // Log instantiation
      scopedLogger.info(`→ new ${className}`, {
        class: className,
        args: args.length > 0 ? args : undefined,
      }, classTag)

      // Create instance with original constructor
      const instance: any = new constructor(...args)

      // If there's a destroy/cleanup method, wrap it to log destruction
      const destructorNames = ['destroy', 'cleanup', 'dispose', 'unmount', 'componentWillUnmount']
      for (const methodName of destructorNames) {
        if (typeof instance[methodName] === 'function') {
          const original = instance[methodName]
          instance[methodName] = function (...destroyArgs: any[]) {
            scopedLogger.info(`✗ ${className}.${methodName}`, {
              class: className,
              method: methodName,
            }, classTag)
            return original.apply(this, destroyArgs)
          }
          break // Only wrap the first destructor we find
        }
      }

      return instance
    }

    // Copy static properties
    Object.setPrototypeOf(wrappedConstructor, constructor)
    Object.setPrototypeOf(wrappedConstructor.prototype, constructor.prototype)

    // Copy static methods and properties
    for (const property of Object.getOwnPropertyNames(constructor)) {
      if (property !== 'prototype' && property !== 'length' && property !== 'name') {
        const descriptor = Object.getOwnPropertyDescriptor(constructor, property)
        if (descriptor) {
          Object.defineProperty(wrappedConstructor, property, descriptor)
        }
      }
    }

    return wrappedConstructor
  }
}

/**
 * DECORATOR #4: Property Watcher
 *
 * This decorator logs whenever a property is accessed or modified.
 * Useful for tracking state changes.
 *
 * How it works:
 * 1. Replaces a property with getter/setter
 * 2. Getter returns the value (can optionally log reads)
 * 3. Setter logs the change and updates the value
 *
 * @example
 * class StateManager {
 *   @watch({ scope: LogScope.System })
 *   private currentTask: Task | null = null
 *
 *   setTask(task: Task) {
 *     this.currentTask = task  // Logs: "Property set: currentTask" with old/new values
 *   }
 * }
 */
export function watch(options: {
  scope?: LogScope;
  tag?: string;
  logReads?: boolean
} = {}) {
  const { scope = LogScope.System, tag, logReads = false } = options

  return function (target: any, propertyKey: string) {
    // Property value will be stored in a closure
    let value = target[propertyKey]

    // Delete the original property
    if (delete target[propertyKey]) {
      // Create new property with getter/setter
      Object.defineProperty(target, propertyKey, {
        get: function() {
          if (logReads) {
            const className = this.constructor.name
            const propTag = tag || `${className}.${propertyKey}`
            const scopedLogger = getScopedLogger(scope)

            scopedLogger.trace(`Property read: ${propertyKey}`, {
              property: propertyKey,
              value,
            }, propTag)
          }
          return value
        },
        set: function(newValue) {
          const className = this.constructor.name
          const propTag = tag || `${className}.${propertyKey}`
          const scopedLogger = getScopedLogger(scope)

          scopedLogger.debug(`Property set: ${propertyKey}`, {
            property: propertyKey,
            oldValue: value,
            newValue,
          }, propTag)

          value = newValue
        },
        enumerable: true,
        configurable: true,
      })
    }
  }
}
