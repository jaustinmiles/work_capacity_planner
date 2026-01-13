/**
 * ConversationList Component
 *
 * Displays a list of saved conversations with title, message count, and date.
 * Supports selecting, deleting, and creating new conversations.
 */

import React from 'react'
import { List, Typography, Button, Empty, Spin, Popconfirm } from '@arco-design/web-react'
import { IconDelete, IconMessage } from '@arco-design/web-react/icon'
import { useConversationStore, ConversationStatus } from '../../store/useConversationStore'
import { Conversation } from '@shared/conversation-types'
import { ConversationId } from '@shared/id-types'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { Text } = Typography

export function ConversationList(): React.ReactElement {
  const {
    conversations,
    selectConversation,
    deleteConversation,
    createConversation,
    status,
  } = useConversationStore()

  const isLoading = status === ConversationStatus.Loading

  const handleSelect = (conversation: Conversation) => {
    selectConversation(conversation.id)
  }

  const handleDelete = async (e: React.MouseEvent, id: ConversationId) => {
    e.stopPropagation()
    await deleteConversation(id)
  }

  const handleNewChat = async () => {
    await createConversation()
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          padding: 40,
        }}
      >
        <Spin size={32} />
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          padding: 40,
        }}
      >
        <Empty
          icon={<IconMessage style={{ fontSize: 48 }} />}
          description="No conversations yet"
        />
        <Button
          type="primary"
          style={{ marginTop: 16 }}
          onClick={handleNewChat}
        >
          Start a conversation
        </Button>
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      <List
        dataSource={conversations}
        render={(conversation: Conversation) => (
          <List.Item
            key={conversation.id as string}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              borderBottom: '1px solid var(--color-border)',
            }}
            onClick={() => handleSelect(conversation)}
            actions={[
              <Popconfirm
                key="delete"
                title="Delete this conversation?"
                content="This action cannot be undone."
                onOk={(e) => {
                  if (e) handleDelete(e as unknown as React.MouseEvent, conversation.id)
                }}
                onCancel={(e) => e?.stopPropagation()}
              >
                <Button
                  type="text"
                  icon={<IconDelete />}
                  size="small"
                  status="danger"
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <Text
                  ellipsis={{ rows: 1 }}
                  style={{ fontWeight: 500, marginBottom: 4 }}
                >
                  {conversation.title}
                </Text>
              }
              description={
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--color-text-3)',
                    fontSize: 12,
                  }}
                >
                  <span>{conversation.messageCount || 0} messages</span>
                  <span>•</span>
                  <span>{dayjs(conversation.updatedAt).fromNow()}</span>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  )
}
