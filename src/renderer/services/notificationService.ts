/**
 * NotificationService — Singleton for desktop notifications
 *
 * Wraps Electron IPC and Web Notification API behind a unified interface.
 * Designed to be extensible for future notification types (reminders, alerts, etc.).
 *
 * Usage:
 *   NotificationService.getInstance().send('Title', 'Body')
 *   NotificationService.getInstance().sendPomodoroPhaseComplete(phase, taskName)
 */

import { PomodoroPhase } from '@shared/enums'
import { logger } from '@/logger'

interface NotificationOptions {
  silent?: boolean
  /** Tag for deduplication — only one notification per tag is shown at a time */
  tag?: string
}

const POMODORO_MESSAGES: Record<string, { title: string; body: string }> = {
  [PomodoroPhase.Work]: {
    title: 'Work Phase Complete',
    body: 'Time for a break! Choose an activity.',
  },
  [PomodoroPhase.ShortBreak]: {
    title: 'Break Over',
    body: 'Ready to get back to work? Pick your next task.',
  },
  [PomodoroPhase.LongBreak]: {
    title: 'Long Break Over',
    body: 'Refreshed? Time to start a new Pomodoro cycle.',
  },
}

export class NotificationService {
  private static instance: NotificationService | null = null

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }

  /**
   * Send a generic desktop notification.
   * Tries Electron IPC first, falls back to Web Notification API.
   */
  async send(title: string, body: string, options?: NotificationOptions): Promise<void> {
    try {
      if (await this.sendViaElectron(title, body)) {
        return
      }
      await this.sendViaWebAPI(title, body, options)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.ui.warn('Failed to send desktop notification', { error: msg }, 'notification-error')
    }
  }

  /**
   * Send a Pomodoro phase-completion notification.
   */
  async sendPomodoroPhaseComplete(
    completedPhase: PomodoroPhase,
    taskName?: string | null,
  ): Promise<void> {
    const message = POMODORO_MESSAGES[completedPhase]
    if (!message) return

    const body = taskName ? `${message.body} (was: ${taskName})` : message.body
    await this.send(message.title, body, { tag: 'pomodoro-phase' })
  }

  // ---------------------------------------------------------------------------
  // Transport methods
  // ---------------------------------------------------------------------------

  private async sendViaElectron(title: string, body: string): Promise<boolean> {
    if (!window.electronAPI?.showNotification) return false
    await window.electronAPI.showNotification(title, body)
    return true
  }

  private async sendViaWebAPI(
    title: string,
    body: string,
    options?: NotificationOptions,
  ): Promise<void> {
    if (!('Notification' in window)) return

    if (window.Notification.permission === 'default') {
      await window.Notification.requestPermission()
    }

    if (window.Notification.permission === 'granted') {
      new window.Notification(title, {
        body,
        silent: options?.silent,
        tag: options?.tag,
      })
    }
  }
}
