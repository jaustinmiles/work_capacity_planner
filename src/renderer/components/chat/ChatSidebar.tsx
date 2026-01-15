/**
 * ChatSidebar Component
 *
 * Main container for the chat interface, rendered as a collapsible right sidebar.
 * Includes a draggable resize handle and toggles between conversation list and chat view.
 */

import React, { useEffect } from 'react'
import { Layout, Button, Typography } from '@arco-design/web-react'
import {
  IconLeft,
  IconPlus,
  IconMessage,
  IconClose,
} from '@arco-design/web-react/icon'
import { useConversationStore, ConversationStatus } from '../../store/useConversationStore'
import { useResizable } from '../../hooks/useResizable'
import { ConversationList } from './ConversationList'
import { ChatView } from './ChatView'
import { ViewType } from '@shared/enums'

const { Sider } = Layout
const { Title } = Typography

interface ChatSidebarProps {
  /** Callback to navigate to a specific view (for visual amendment application) */
  onNavigateToView?: (view: ViewType) => void
}

export function ChatSidebar({ onNavigateToView }: ChatSidebarProps): React.ReactElement | null {
  const {
    sidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    setSidebarOpen,
    activeConversationId,
    selectConversation,
    createConversation,
    loadConversations,
    conversations,
    status,
  } = useConversationStore()

  // Resizable sidebar
  const { size, isResizing, handleProps } = useResizable({
    initialSize: sidebarWidth,
    minSize: 320,
    maxSize: 700,
    direction: 'horizontal',
    handlePosition: 'start',
    storageKey: 'chat-sidebar-width',
    onResizeEnd: (newSize) => {
      setSidebarWidth(newSize)
    },
  })

  // Load conversations when sidebar opens
  useEffect(() => {
    if (sidebarOpen && conversations.length === 0) {
      loadConversations()
    }
  }, [sidebarOpen, conversations.length, loadConversations])

  // Don't render if sidebar is closed
  if (!sidebarOpen) {
    return null
  }

  const isLoading = status === ConversationStatus.Loading
  const showingChat = activeConversationId !== null

  const handleNewChat = async () => {
    await createConversation()
  }

  const handleBackToList = () => {
    selectConversation(null)
  }

  const handleClose = () => {
    setSidebarOpen(false)
  }

  return (
    <Sider
      width={size}
      style={{
        background: 'var(--color-bg-1)',
        borderLeft: '1px solid var(--color-border)',
        // Fixed position to stay pinned to viewport, independent of page scroll
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        zIndex: 100, // Above main content but below modals
      }}
    >
      {/* Resize Handle */}
      <div
        {...handleProps}
        style={{
          ...handleProps.style,
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          zIndex: 10,
          background: isResizing ? 'var(--color-primary-light-4)' : 'transparent',
          transition: isResizing ? 'none' : 'background 0.2s',
        }}
        onMouseEnter={(e) => {
          if (!isResizing) {
            e.currentTarget.style.background = 'var(--color-border-2)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isResizing) {
            e.currentTarget.style.background = 'transparent'
          }
        }}
      />

      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showingChat && (
            <Button
              type="text"
              icon={<IconLeft />}
              onClick={handleBackToList}
              size="small"
            />
          )}
          <IconMessage style={{ fontSize: 18, color: 'var(--color-text-2)' }} />
          <Title heading={6} style={{ margin: 0 }}>
            {showingChat ? 'Chat' : 'Conversations'}
          </Title>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!showingChat && (
            <Button
              type="primary"
              icon={<IconPlus />}
              size="small"
              onClick={handleNewChat}
              loading={isLoading}
            >
              New
            </Button>
          )}
          <Button
            type="text"
            icon={<IconClose />}
            onClick={handleClose}
            size="small"
          />
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {showingChat ? (
          <ChatView onNavigateToView={onNavigateToView} />
        ) : (
          <ConversationList />
        )}
      </div>
    </Sider>
  )
}
