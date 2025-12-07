import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { Space } from '@arco-design/web-react'
import { IconCheck, IconClose, IconExclamationCircle, IconInfo } from '@arco-design/web-react/icon'

type NotificationType = 'success' | 'error' | 'warning' | 'info'

/**
 * Input format for notifications.
 * Supports both simple string and Arco-style object format for compatibility.
 */
type NotificationInput = string | { title?: string; content: string }

interface NotificationProps {
  type: NotificationType
  content: string
  title?: string
  duration?: number
  onClose?: () => void
}

const NotificationItem: React.FC<NotificationProps> = ({ type, content, title, duration = 3000, onClose }) => {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(() => {
        onClose?.()
      }, 200)
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const getIcon = (): React.ReactElement => {
    switch (type) {
      case 'success':
        return <IconCheck style={{ color: '#52c41a' }} />
      case 'error':
        return <IconClose style={{ color: '#ff4d4f' }} />
      case 'warning':
        return <IconExclamationCircle style={{ color: '#faad14' }} />
      case 'info':
        return <IconInfo style={{ color: '#1890ff' }} />
    }
  }

  const getBackgroundColor = (): string => {
    switch (type) {
      case 'success':
        return '#f6ffed'
      case 'error':
        return '#fff2f0'
      case 'warning':
        return '#fffbe6'
      case 'info':
        return '#e6f7ff'
    }
  }

  const getBorderColor = (): string => {
    switch (type) {
      case 'success':
        return '#b7eb8f'
      case 'error':
        return '#ffccc7'
      case 'warning':
        return '#ffe58f'
      case 'info':
        return '#91d5ff'
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '12px 16px',
        marginBottom: 8,
        background: getBackgroundColor(),
        border: `1px solid ${getBorderColor()}`,
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'all 0.2s ease',
        pointerEvents: 'auto',
        minWidth: 280,
        maxWidth: 400,
      }}
    >
      <Space align="start" size={8}>
        <div style={{ marginTop: 2 }}>{getIcon()}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {title && (
            <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
          )}
          <span style={{ fontSize: 13, color: title ? '#666' : 'inherit' }}>{content}</span>
        </div>
      </Space>
    </div>
  )
}

/**
 * Normalizes notification input to props.
 * Handles both string and object formats.
 */
function normalizeInput(input: NotificationInput): { content: string; title?: string } {
  if (typeof input === 'string') {
    return { content: input }
  }
  return { content: input.content, title: input.title }
}

class NotificationManager {
  private container: HTMLDivElement | null = null
  private root: ReactDOM.Root | null = null
  private notifications: Array<{ id: string; props: NotificationProps }> = []

  private ensureContainer(): void {
    if (!this.container) {
      this.container = document.createElement('div')
      this.container.style.position = 'fixed'
      this.container.style.top = '24px'
      this.container.style.right = '24px'
      this.container.style.zIndex = '9999'
      this.container.style.pointerEvents = 'none'
      document.body.appendChild(this.container)
      this.root = ReactDOM.createRoot(this.container)
    }
  }

  private render(): void {
    if (!this.root) return

    this.root.render(
      <div>
        {this.notifications.map(({ id, props }) => (
          <NotificationItem
            key={id}
            {...props}
            onClose={() => this.remove(id)}
          />
        ))}
      </div>,
    )
  }

  private add(type: NotificationType, input: NotificationInput, duration?: number): void {
    this.ensureContainer()
    const id = `notification-${Date.now()}-${Math.random()}`
    const { content, title } = normalizeInput(input)
    this.notifications.push({
      id,
      props: { type, content, title, duration: duration ?? 3000 },
    })
    this.render()
  }

  private remove(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id)
    this.render()
  }

  success(input: NotificationInput, duration?: number): void {
    this.add('success', input, duration)
  }

  error(input: NotificationInput, duration?: number): void {
    this.add('error', input, duration)
  }

  warning(input: NotificationInput, duration?: number): void {
    this.add('warning', input, duration)
  }

  info(input: NotificationInput, duration?: number): void {
    this.add('info', input, duration)
  }
}

// Create a singleton instance
const notificationManager = new NotificationManager()

/**
 * React 18-compatible notification API.
 * Supports both simple string and Arco-style object format:
 *
 * @example
 * // Simple string
 * Notification.success('Operation completed')
 *
 * // Object with title
 * Notification.error({ title: 'Error', content: 'Something went wrong' })
 */
export const Notification = {
  success: (input: NotificationInput, duration?: number): void =>
    notificationManager.success(input, duration),
  error: (input: NotificationInput, duration?: number): void =>
    notificationManager.error(input, duration),
  warning: (input: NotificationInput, duration?: number): void =>
    notificationManager.warning(input, duration),
  info: (input: NotificationInput, duration?: number): void =>
    notificationManager.info(input, duration),
}
