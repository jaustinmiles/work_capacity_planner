/**
 * DependencyConfirmationModal - Confirms ambiguous dependency resolutions
 *
 * Shows when AI-generated dependencies have low confidence matches,
 * allowing users to confirm or correct the resolved dependencies.
 */

import { useState } from 'react'
import {
  Modal,
  Space,
  Typography,
  Button,
  Radio,
  Tag,
  Alert,
  List,
  Progress,
} from '@arco-design/web-react'
import {
  IconCheckCircle,
  IconExclamationCircle,
  IconClose,
} from '@arco-design/web-react/icon'
import type { DependencyResolutionReport } from '@shared/dependency-resolver'

const { Title, Text } = Typography

interface DependencyConfirmationModalProps {
  visible: boolean
  onClose: () => void
  onConfirm: (confirmedIds: string[]) => void
  report: DependencyResolutionReport
  stepName: string
}

interface ResolutionChoice {
  ref: string
  selectedId: string | null
}

export function DependencyConfirmationModal({
  visible,
  onClose,
  onConfirm,
  report,
  stepName,
}: DependencyConfirmationModalProps) {
  // Initialize choices from the report's resolved dependencies
  const [choices, setChoices] = useState<ResolutionChoice[]>(() =>
    report.results.map(result => ({
      ref: result.originalRef,
      selectedId: result.resolvedId,
    })),
  )

  const handleChoiceChange = (ref: string, selectedId: string | null) => {
    setChoices(prev =>
      prev.map(choice =>
        choice.ref === ref ? { ...choice, selectedId } : choice,
      ),
    )
  }

  const handleConfirm = () => {
    const confirmedIds = choices
      .map(c => c.selectedId)
      .filter((id): id is string => id !== null)
    onConfirm(confirmedIds)
    onClose()
  }

  const handleSkipAll = () => {
    onConfirm([])
    onClose()
  }

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.9) return 'green'
    if (confidence >= 0.7) return 'orange'
    return 'red'
  }

  const getConfidenceLabel = (confidence: number): string => {
    if (confidence >= 0.9) return 'High'
    if (confidence >= 0.7) return 'Medium'
    return 'Low'
  }

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      title={
        <Space>
          <IconExclamationCircle style={{ color: 'var(--color-warning-6)' }} />
          <span>Confirm Dependencies for &ldquo;{stepName}&rdquo;</span>
        </Space>
      }
      footer={
        <Space>
          <Button onClick={handleSkipAll}>Skip All Dependencies</Button>
          <Button type="primary" onClick={handleConfirm}>
            Confirm Selection
          </Button>
        </Space>
      }
      style={{ width: 600 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="medium">
        {report.failed.length > 0 && (
          <Alert
            type="warning"
            title="Unresolved Dependencies"
            content={
              <List
                size="small"
                dataSource={report.failed}
                render={(item) => (
                  <List.Item key={item.ref}>
                    <Text type="warning">&ldquo;{item.ref}&rdquo; - {item.reason}</Text>
                  </List.Item>
                )}
              />
            }
          />
        )}

        {report.ambiguous.length > 0 && (
          <div>
            <Title heading={6} style={{ marginBottom: 12 }}>
              Please confirm these matches:
            </Title>
            <List
              dataSource={report.ambiguous}
              render={(item) => {
                const choice = choices.find(c => c.ref === item.ref)
                const result = report.results.find(r => r.originalRef === item.ref)

                return (
                  <List.Item
                    key={item.ref}
                    style={{
                      background: 'var(--color-fill-1)',
                      borderRadius: 8,
                      padding: 16,
                      marginBottom: 8,
                    }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space>
                        <Text bold>&ldquo;{item.ref}&rdquo;</Text>
                        <Tag color={getConfidenceColor(item.confidence)}>
                          {getConfidenceLabel(item.confidence)} confidence
                        </Tag>
                        <Progress
                          percent={Math.round(item.confidence * 100)}
                          size="small"
                          style={{ width: 80 }}
                          showText={false}
                        />
                      </Space>

                      <Radio.Group
                        value={choice?.selectedId}
                        onChange={(value) => handleChoiceChange(item.ref, value)}
                        direction="vertical"
                      >
                        {/* Best match */}
                        <Radio value={item.resolvedId}>
                          <Space>
                            <IconCheckCircle style={{ color: 'var(--color-success-6)' }} />
                            <Text>{result?.resolvedName || item.resolvedId}</Text>
                            <Tag size="small" color="arcoblue">Best match</Tag>
                          </Space>
                        </Radio>

                        {/* Alternatives */}
                        {item.alternatives.map(alt => (
                          <Radio key={alt.id} value={alt.id}>
                            <Space>
                              <Text>{alt.name}</Text>
                              <Tag size="small">
                                {Math.round(alt.score * 100)}% match
                              </Tag>
                            </Space>
                          </Radio>
                        ))}

                        {/* Skip option */}
                        <Radio value={null}>
                          <Space>
                            <IconClose style={{ color: 'var(--color-text-3)' }} />
                            <Text type="secondary">Skip this dependency</Text>
                          </Space>
                        </Radio>
                      </Radio.Group>
                    </Space>
                  </List.Item>
                )
              }}
            />
          </div>
        )}

        {report.resolved.length > 0 && report.ambiguous.length === 0 && report.failed.length === 0 && (
          <Alert
            type="success"
            title="All dependencies resolved successfully"
            content={
              <List
                size="small"
                dataSource={report.resolved}
                render={(item) => (
                  <List.Item key={item.ref}>
                    <Space>
                      <IconCheckCircle style={{ color: 'var(--color-success-6)' }} />
                      <Text>&ldquo;{item.ref}&rdquo; → matched with {Math.round(item.confidence * 100)}% confidence</Text>
                    </Space>
                  </List.Item>
                )}
              />
            }
          />
        )}

        <Text type="secondary" style={{ fontSize: 12 }}>
          Dependencies with high confidence are automatically accepted.
          Review and confirm the matches above, or skip dependencies that don&apos;t look right.
        </Text>
      </Space>
    </Modal>
  )
}
