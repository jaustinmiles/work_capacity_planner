/**
 * Pomodoro Desktop Notifications
 *
 * Sends OS-level notifications for Pomodoro phase transitions via Electron IPC.
 * Falls back to Web Notification API when not running in Electron.
 */

import { PomodoroPhase } from '@shared/enums'
import { logger } from '@/logger'

const NOTIFICATION_MESSAGES: Record<string, { title: string; body: string }> = {
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

/**
 * Send a desktop notification for a Pomodoro phase transition.
 * Uses Electron IPC when available, falls back to Web Notification API.
 */
export async function sendPomodoroNotification(
  completedPhase: PomodoroPhase,
  taskName?: string | null,
): Promise<void> {
  const message = NOTIFICATION_MESSAGES[completedPhase]
  if (!message) return

  const title = message.title
  const body = taskName ? `${message.body} (was: ${taskName})` : message.body

  try {
    // Try Electron IPC first
    if (window.electronAPI?.showNotification) {
      await window.electronAPI.showNotification(title, body)
      return
    }

    // Fallback: Web Notification API
    if ('Notification' in window && window.Notification.permission === 'granted') {
      new window.Notification(title, { body })
    } else if ('Notification' in window && window.Notification.permission === 'default') {
      const permission = await window.Notification.requestPermission()
      if (permission === 'granted') {
        new window.Notification(title, { body })
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.ui.warn('Failed to send desktop notification', { error: msg }, 'pomodoro-notification-error')
  }
}
