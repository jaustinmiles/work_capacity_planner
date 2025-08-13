import { useState } from 'react'
import { Modal, Button, Space, Typography, Alert } from '@arco-design/web-react'
import { IconDelete, IconTool } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'

const { Title, Text } = Typography

interface DevToolsProps {
  visible: boolean
  onClose: () => void
}

export function DevTools({ visible, onClose }: DevToolsProps) {
  const [isClearing, setIsClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleClearAllData = async () => {
    setShowConfirm(true)
  }

  const performClearData = async () => {
    setIsClearing(true)
    setShowConfirm(false)
    try {
      await getDatabase().deleteAllUserData()
      Message.success('All user data cleared successfully')
      // Reload the page to refresh everything
      setTimeout(() => window.location.reload(), 1000)
    } catch (error) {
      console.error('Failed to clear data:', error)
      Message.error('Failed to clear user data')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <Modal
      title={
        <Space>
          <IconTool />
          <span>Developer Tools</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={null}
      style={{ width: 600 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Alert
          type="warning"
          title="Warning"
          content="These tools are for development purposes only. Use with caution."
        />

        <div>
          <Title heading={6}>Database Management</Title>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Button
              type="primary"
              status="danger"
              icon={<IconDelete />}
              onClick={handleClearAllData}
              loading={isClearing}
              long
            >
              Clear All User Data
            </Button>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Removes all tasks, workflows, schedules, and settings. Sessions are preserved but cleared.
            </Text>
          </Space>
        </div>
      </Space>

      {/* Custom Confirmation Modal */}
      <Modal
        title="Clear All User Data?"
        visible={showConfirm}
        onOk={performClearData}
        onCancel={() => setShowConfirm(false)}
        okText="Clear All Data"
        okButtonProps={{ status: 'danger', loading: isClearing }}
        cancelButtonProps={{ disabled: isClearing }}
        maskClosable={!isClearing}
      >
        <Alert
          type="error"
          content="This will delete all tasks, workflows, schedules, and settings. Sessions will be kept but cleared. This action cannot be undone."
          showIcon
        />
      </Modal>
    </Modal>
  )
}
