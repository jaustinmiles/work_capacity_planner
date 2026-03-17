/**
 * Type augmentation for Electron's Notification class.
 *
 * Electron exposes Notification at runtime, but its TypeScript
 * declarations omit it as a top-level export. This augmentation
 * allows clean imports: `import { Notification } from 'electron'`
 */

declare module 'electron' {
  class Notification {
    static isSupported(): boolean
    constructor(options: { title: string; body: string; silent?: boolean })
    show(): void
    on(event: 'click' | 'close' | 'show', listener: () => void): this
  }
}
