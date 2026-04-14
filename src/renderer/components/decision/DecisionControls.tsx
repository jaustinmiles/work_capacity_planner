/**
 * DecisionControls — Chat input and session controls for Decision Mode.
 */

import React, { useState } from 'react'
import { Input, Button, Space, Spin } from '@arco-design/web-react'
import { IconSend } from '@arco-design/web-react/icon'
import { useDecisionStore } from '../../store/useDecisionStore'

const { TextArea } = Input

export function DecisionControls(): React.ReactElement {
  const {
    activeSessionId,
    isProcessing,
    sendMessage,
    endSession,
    conversationHistory,
  } = useDecisionStore()

  const [inputValue, setInputValue] = useState('')

  const handleSend = async (): Promise<void> => {
    const text = inputValue.trim()
    if (!text || isProcessing || !activeSessionId) return

    setInputValue('')
    await sendMessage(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  if (!activeSessionId) return <div />

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', padding: 12, background: 'var(--color-bg-2)' }}>
      {/* Conversation display */}
      {conversationHistory.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8, padding: '0 4px' }}>
          {conversationHistory.map((msg, i) => (
            <div
              key={i}
              style={{
                marginBottom: 6,
                padding: '4px 8px',
                borderRadius: 6,
                background: msg.role === 'user' ? 'var(--color-primary-light-4)' : 'var(--color-bg-3)',
                fontSize: 13,
              }}
            >
              {msg.text}
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{ display: 'flex', gap: 8 }}>
        <TextArea
          value={inputValue}
          onChange={setInputValue}
          onKeyDown={handleKeyDown}
          placeholder="What are you deciding? Just start talking..."
          autoSize={{ minRows: 1, maxRows: 3 }}
          disabled={isProcessing}
          style={{ flex: 1 }}
        />
        <Space direction="vertical" size={4}>
          <Button
            type="primary"
            icon={isProcessing ? <Spin size={16} /> : <IconSend />}
            onClick={handleSend}
            disabled={!inputValue.trim() || isProcessing}
          />
          <Button
            size="small"
            status="warning"
            onClick={endSession}
            disabled={isProcessing}
          >
            End
          </Button>
        </Space>
      </div>
    </div>
  )
}
