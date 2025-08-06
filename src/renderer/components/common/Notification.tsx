import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { Space } from '@arco-design/web-react'
import { IconCheck, IconClose, IconExclamationCircle, IconInfo } from '@arco-design/web-react/icon'

type NotificationType = 'success' | 'error' | 'warning' | 'info'

interface NotificationProps {
  type: NotificationType
  content: string
  duration?: number
  onClose?: () => void
}

const NotificationItem: React.FC<NotificationProps> = ({ type, content, duration = 3000, onClose }) => {
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

  const getIcon = () => {
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

  const getBackgroundColor = () => {
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

  const getBorderColor = () => {
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
        alignItems: 'center',
        padding: '8px 16px',
        marginBottom: 8,
        background: getBackgroundColor(),
        border: `1px solid ${getBorderColor()}`,
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'all 0.2s ease',
      }}
    >
      <Space>
        {getIcon()}
        <span>{content}</span>
      </Space>
    </div>
  )
}

class NotificationManager {
  private container: HTMLDivElement | null = null
  private root: ReactDOM.Root | null = null
  private notifications: Array<{ id: string; props: NotificationProps }> = []

  private ensureContainer() {
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

  private render() {
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
      </div>
    )
  }

  private add(type: NotificationType, content: string, duration?: number) {
    this.ensureContainer()
    const id = `notification-${Date.now()}-${Math.random()}`
    this.notifications.push({ id, props: { type, content, duration } })
    this.render()
  }

  private remove(id: string) {
    this.notifications = this.notifications.filter(n => n.id !== id)
    this.render()
  }

  success(content: string, duration?: number) {
    this.add('success', content, duration)
  }

  error(content: string, duration?: number) {
    this.add('error', content, duration)
  }

  warning(content: string, duration?: number) {
    this.add('warning', content, duration)
  }

  info(content: string, duration?: number) {
    this.add('info', content, duration)
  }
}

// Create a singleton instance
const notificationManager = new NotificationManager()

// Export the notification API
export const Notification = {
  success: (content: string, duration?: number) => notificationManager.success(content, duration),
  error: (content: string, duration?: number) => notificationManager.error(content, duration),
  warning: (content: string, duration?: number) => notificationManager.warning(content, duration),
  info: (content: string, duration?: number) => notificationManager.info(content, duration),
}