import { useState, useEffect } from 'react'
import { Modal, Button, Space, Typography, Alert, Tabs } from '@arco-design/web-react'
import { IconDelete, IconTool, IconMessage, IconList, IconFile } from '@arco-design/web-react/icon'
import { getDatabase } from '../../services/database'
import { Message } from '../common/Message'
import { logger } from '../../utils/logger'
import { FeedbackForm } from './FeedbackForm'
import { FeedbackViewer } from './FeedbackViewer'
import { LogViewer } from './LogViewer'

const { Title, Text } = Typography
const TabPane = Tabs.TabPane

interface DevToolsProps {
  visible: boolean
  onClose: () => void
}

export function DevTools({ visible, onClose }: DevToolsProps) {
  const [isClearing, setIsClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState('feedback')

  useEffect(() => {
    if (visible) {
      logger.ui.info('DevTools opened', { activeTab })
    }
  }, [visible, activeTab])

  const handleClearAllData = async () => {
    logger.ui.info('Clear all data requested')
    setShowConfirm(true)
  }

  const performClearData = async () => {
    logger.ui.warn('Clearing all user data - confirmed by user')
    setIsClearing(true)
    setShowConfirm(false)
    try {
      await getDatabase().deleteAllUserData()
      logger.ui.info('All user data cleared successfully')
      Message.success('All user data cleared successfully')
      // Reload the page to refresh everything
      setTimeout(() => window.location.reload(), 1000)
    } catch (error) {
      logger.ui.error('Failed to clear data:', error)
      Message.error('Failed to clear user data')
    } finally {
      setIsClearing(false)
    }
  }

  const handleTabChange = (key: string) => {
    logger.ui.debug('DevTools tab changed', { from: activeTab, to: key })
    setActiveTab(key)
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
      style={{ width: 900 }}
    >
      <Tabs defaultActiveTab="feedback" activeTab={activeTab} onChange={handleTabChange}>
        <TabPane
          key="feedback"
          title={
            <Space>
              <IconMessage />
              <span>Submit Feedback</span>
            </Space>
          }
        >
          <FeedbackForm onClose={onClose} />
        </TabPane>

        <TabPane
          key="viewer"
          title={
            <Space>
              <IconList />
              <span>View Feedback</span>
            </Space>
          }
        >
          <FeedbackViewer onClose={onClose} />
        </TabPane>

        <TabPane
          key="logs"
          title={
            <Space>
              <IconFile />
              <span>View Logs</span>
            </Space>
          }
        >
          <LogViewer onClose={onClose} />
        </TabPane>

        <TabPane
          key="database"
          title={
            <Space>
              <IconDelete />
              <span>Database</span>
            </Space>
          }
        >
          <Space direction="vertical" style={{ width: '100%', marginTop: 20 }} size="large">
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
        </TabPane>
      </Tabs>

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
