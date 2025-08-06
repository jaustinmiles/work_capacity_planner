import React, { useState } from 'react'
import {
  Card,
  Space,
  Typography,
  Button,
  InputNumber,
  Select,
  List,
  Tag,
  Modal,
  Form,
  Input,
  Grid,
  Message,
  Popconfirm,
  Divider,
  Tabs,
} from '@arco-design/web-react'
import {
  IconEdit,
  IconSave,
  IconClose,
  IconUp,
  IconDown,
  IconDelete,
  IconPlus,
  IconDragDot,
  IconMindMapping,
  IconList,
} from '@arco-design/web-react/icon'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { useTaskStore } from '../../store/useTaskStore'
import { WorkflowGraph } from './WorkflowGraph'

const { Title, Text } = Typography
const { Row, Col } = Grid
const FormItem = Form.Item

interface SequencedTaskEditProps {
  task: SequencedTask
  onClose?: () => void
}

interface EditingStep extends TaskStep {
  tempId?: string
}

export function SequencedTaskEdit({ task, onClose }: SequencedTaskEditProps) {
  const { updateSequencedTask } = useTaskStore()
  const [editedTask, setEditedTask] = useState<SequencedTask>({ ...task })
  const [editingSteps, setEditingSteps] = useState<EditingStep[]>(task.steps.map(step => ({ ...step })))
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showStepModal, setShowStepModal] = useState(false)
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null)
  const [stepForm] = Form.useForm()

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Recalculate durations based on edited steps
      const totalDuration = editingSteps.reduce((sum, step) => sum + step.duration, 0)
      const totalWaitTime = editingSteps.reduce((sum, step) => sum + step.asyncWaitTime, 0)
      const criticalPathDuration = totalDuration + totalWaitTime
      const worstCaseDuration = criticalPathDuration * 1.5 // Estimate

      // Clean up step data before sending to database
      const cleanedSteps = editingSteps.map((step, index) => {
        // Extract only the fields that should be sent to the database
        const { tempId, ...cleanStep } = step
        return {
          id: cleanStep.id,
          name: cleanStep.name,
          duration: cleanStep.duration,
          type: cleanStep.type,
          dependsOn: cleanStep.dependsOn,
          asyncWaitTime: cleanStep.asyncWaitTime,
          status: cleanStep.status,
          stepIndex: index,
        }
      })

      await updateSequencedTask(task.id, {
        ...editedTask,
        steps: cleanedSteps,
        totalDuration,
        criticalPathDuration,
        worstCaseDuration,
      })

      Message.success('Workflow updated successfully')
      setIsEditing(false)
      if (onClose) onClose()
    } catch (error) {
      Message.error('Failed to update workflow')
      console.error('Error updating workflow:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...editingSteps]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (targetIndex >= 0 && targetIndex < newSteps.length) {
      [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]]

      // Update dependencies
      newSteps.forEach((step, i) => {
        if (step.dependsOn.includes(`step-${index}`)) {
          step.dependsOn = step.dependsOn.map(dep =>
            dep === `step-${index}` ? `step-${targetIndex}` : dep,
          )
        }
        if (step.dependsOn.includes(`step-${targetIndex}`)) {
          step.dependsOn = step.dependsOn.map(dep =>
            dep === `step-${targetIndex}` ? `step-${index}` : dep,
          )
        }
      })

      setEditingSteps(newSteps)
    }
  }

  const deleteStep = (index: number) => {
    const newSteps = editingSteps.filter((_, i) => i !== index)

    // Update dependencies
    newSteps.forEach(step => {
      // Remove references to deleted step
      step.dependsOn = step.dependsOn.filter(dep => dep !== `step-${index}`)

      // Adjust step references for steps after the deleted one
      step.dependsOn = step.dependsOn.map(dep => {
        const match = dep.match(/^step-(\d+)$/)
        if (match) {
          const stepNum = parseInt(match[1])
          if (stepNum > index) {
            return `step-${stepNum - 1}`
          }
        }
        return dep
      })
    })

    setEditingSteps(newSteps)
  }

  const openStepModal = (index: number | null = null) => {
    if (index !== null) {
      const step = editingSteps[index]
      stepForm.setFieldsValue({
        name: step.name,
        duration: step.duration,
        type: step.type,
        asyncWaitTime: step.asyncWaitTime,
        dependsOn: step.dependsOn,
      })
    } else {
      stepForm.resetFields()
    }
    setEditingStepIndex(index)
    setShowStepModal(true)
  }

  const handleStepSubmit = async () => {
    try {
      await stepForm.validate()
      const values = stepForm.getFields()

      if (editingStepIndex !== null) {
        // Edit existing step
        const newSteps = [...editingSteps]
        newSteps[editingStepIndex] = {
          ...newSteps[editingStepIndex],
          name: values.name,
          duration: values.duration,
          type: values.type,
          asyncWaitTime: values.asyncWaitTime || 0,
          dependsOn: values.dependsOn || [],
        }
        setEditingSteps(newSteps)
      } else {
        // Add new step
        const newStep: EditingStep = {
          id: '',
          tempId: `temp-${Date.now()}`,
          name: values.name,
          duration: values.duration,
          type: values.type,
          asyncWaitTime: values.asyncWaitTime || 0,
          dependsOn: values.dependsOn || [],
          status: 'pending',
          stepIndex: editingSteps.length,
        }
        setEditingSteps([...editingSteps, newStep])
      }

      setShowStepModal(false)
      stepForm.resetFields()
    } catch (error) {
      // Form validation failed
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0) {
      return `${hours}h ${mins > 0 ? `${mins}m` : ''}`
    }
    return `${mins}m`
  }

  const getPriorityLabel = (importance: number, urgency: number) => {
    const score = importance * urgency
    if (score >= 64) return 'Critical'
    if (score >= 49) return 'High'
    if (score >= 36) return 'Medium'
    return 'Low'
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {/* Header */}
      <Card>
        <Row gutter={16} align="center">
          <Col flex="auto">
            <Space direction="vertical" size="small">
              <Title heading={4}>{editedTask.name}</Title>
              <Space>
                <Tag color="blue">
                  {editedTask.type === 'focused' ? 'Focused Work' : 'Admin Task'}
                </Tag>
                <Tag color="orange">
                  {getPriorityLabel(editedTask.importance, editedTask.urgency)} Priority
                </Tag>
                <Tag>
                  {editingSteps.length} steps
                </Tag>
              </Space>
            </Space>
          </Col>
          <Col>
            <Space>
              {!isEditing ? (
                <Button
                  type="primary"
                  icon={<IconEdit />}
                  onClick={() => setIsEditing(true)}
                >
                  Edit Workflow
                </Button>
              ) : (
                <>
                  <Button
                    type="primary"
                    icon={<IconSave />}
                    onClick={handleSave}
                    loading={isSaving}
                  >
                    Save Changes
                  </Button>
                  <Button
                    icon={<IconClose />}
                    onClick={() => {
                      setEditingSteps(task.steps.map(step => ({ ...step })))
                      setEditedTask({ ...task })
                      setIsEditing(false)
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
              {onClose && (
                <Button onClick={onClose}>
                  Close
                </Button>
              )}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Priority & Metadata Edit */}
      {isEditing && (
        <Card title="Workflow Properties">
          <Row gutter={16}>
            <Col span={6}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>Importance (1-10)</Text>
                <InputNumber
                  value={editedTask.importance}
                  min={1}
                  max={10}
                  onChange={(value) => setEditedTask({ ...editedTask, importance: value || 5 })}
                  style={{ width: '100%' }}
                />
              </Space>
            </Col>
            <Col span={6}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>Urgency (1-10)</Text>
                <InputNumber
                  value={editedTask.urgency}
                  min={1}
                  max={10}
                  onChange={(value) => setEditedTask({ ...editedTask, urgency: value || 5 })}
                  style={{ width: '100%' }}
                />
              </Space>
            </Col>
            <Col span={6}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>Type</Text>
                <Select
                  value={editedTask.type}
                  onChange={(value) => setEditedTask({ ...editedTask, type: value })}
                  style={{ width: '100%' }}
                >
                  <Select.Option value="focused">Focused Work</Select.Option>
                  <Select.Option value="admin">Admin Task</Select.Option>
                </Select>
              </Space>
            </Col>
            <Col span={6}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>Priority Score</Text>
                <Tag color="orange" style={{ fontSize: 16, padding: '4px 12px' }}>
                  {editedTask.importance * editedTask.urgency} - {getPriorityLabel(editedTask.importance, editedTask.urgency)}
                </Tag>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {/* Steps View - List or Graph */}
      <Card bodyStyle={{ padding: 0 }}>
        <Tabs defaultActiveTab="list">
          <Tabs.TabPane
            key="list"
            title={
              <Space>
                <IconList />
                Steps List
              </Space>
            }
          >
            <div style={{ padding: 24 }}>
              {isEditing && (
                <div style={{ marginBottom: 16, textAlign: 'right' }}>
                  <Button
                    type="primary"
                    icon={<IconPlus />}
                    size="small"
                    onClick={() => openStepModal(null)}
                  >
                    Add Step
                  </Button>
                </div>
              )}

              <List
                dataSource={editingSteps}
                render={(step, index) => (
                  <List.Item
                    key={step.id || step.tempId}
                    style={{
                      padding: '16px',
                      backgroundColor: index % 2 === 0 ? '#f7f8fa' : 'white',
                      borderRadius: 4,
                      marginBottom: 8,
                    }}
                  >
                    <Row gutter={16} align="center" style={{ width: '100%' }}>
                      {isEditing && (
                        <Col style={{ width: 40 }}>
                          <IconDragDot style={{ fontSize: 20, color: '#86909c' }} />
                        </Col>
                      )}

                      <Col flex="auto">
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Space>
                            <Text strong>{index + 1}. {step.name}</Text>
                            <Tag size="small" color={step.type === 'focused' ? 'blue' : 'green'}>
                              {step.type === 'focused' ? 'Focused' : 'Admin'}
                            </Tag>
                          </Space>

                          <Space>
                            <Tag size="small">
                              Duration: {formatDuration(step.duration)}
                            </Tag>
                            {step.asyncWaitTime > 0 && (
                              <Tag size="small" color="red">
                                Wait: {formatDuration(step.asyncWaitTime)}
                              </Tag>
                            )}
                            {step.dependsOn.length > 0 && (
                              <Tag size="small" color="purple">
                                Depends on: {step.dependsOn.join(', ')}
                              </Tag>
                            )}
                          </Space>
                        </Space>
                      </Col>

                      {isEditing && (
                        <Col>
                          <Space>
                            <Button
                              size="small"
                              icon={<IconUp />}
                              disabled={index === 0}
                              onClick={() => moveStep(index, 'up')}
                            />
                            <Button
                              size="small"
                              icon={<IconDown />}
                              disabled={index === editingSteps.length - 1}
                              onClick={() => moveStep(index, 'down')}
                            />
                            <Button
                              size="small"
                              icon={<IconEdit />}
                              onClick={() => openStepModal(index)}
                            />
                            <Popconfirm
                              title="Delete this step?"
                              content="This will also remove any dependencies on this step."
                              onOk={() => deleteStep(index)}
                            >
                              <Button
                                size="small"
                                status="danger"
                                icon={<IconDelete />}
                              />
                            </Popconfirm>
                          </Space>
                        </Col>
                      )}
                    </Row>
                  </List.Item>
                )}
              />

              <Divider />

              {/* Summary */}
              <Row gutter={16}>
                <Col span={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Total Active Work</Text>
                    <Text strong>
                      {formatDuration(editingSteps.reduce((sum, step) => sum + step.duration, 0))}
                    </Text>
                  </Space>
                </Col>
                <Col span={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Total Wait Time</Text>
                    <Text strong>
                      {formatDuration(editingSteps.reduce((sum, step) => sum + step.asyncWaitTime, 0))}
                    </Text>
                  </Space>
                </Col>
                <Col span={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Total Duration</Text>
                    <Text strong>
                      {formatDuration(
                        editingSteps.reduce((sum, step) => sum + step.duration + step.asyncWaitTime, 0),
                      )}
                    </Text>
                  </Space>
                </Col>
              </Row>
            </div>
          </Tabs.TabPane>

          <Tabs.TabPane
            key="graph"
            title={
              <Space>
                <IconMindMapping />
                Graph View
              </Space>
            }
          >
            <div style={{ padding: 24 }}>
              <WorkflowGraph task={{ ...editedTask, steps: editingSteps }} />
            </div>
          </Tabs.TabPane>
        </Tabs>
      </Card>

      {/* Step Edit Modal */}
      <Modal
        title={editingStepIndex !== null ? 'Edit Step' : 'Add New Step'}
        visible={showStepModal}
        onOk={handleStepSubmit}
        onCancel={() => {
          setShowStepModal(false)
          stepForm.resetFields()
        }}
        style={{ width: 600 }}
      >
        <Form form={stepForm} layout="vertical">
          <FormItem
            label="Step Name"
            field="name"
            rules={[{ required: true, message: 'Please enter step name' }]}
          >
            <Input placeholder="e.g., Write unit tests" />
          </FormItem>

          <Row gutter={16}>
            <Col span={12}>
              <FormItem
                label="Duration (minutes)"
                field="duration"
                rules={[{ required: true, message: 'Please enter duration' }]}
              >
                <InputNumber
                  min={1}
                  placeholder="60"
                  style={{ width: '100%' }}
                />
              </FormItem>
            </Col>
            <Col span={12}>
              <FormItem
                label="Async Wait Time (minutes)"
                field="asyncWaitTime"
                initialValue={0}
              >
                <InputNumber
                  min={0}
                  placeholder="0"
                  style={{ width: '100%' }}
                />
              </FormItem>
            </Col>
          </Row>

          <FormItem
            label="Type"
            field="type"
            initialValue="focused"
          >
            <Select>
              <Select.Option value="focused">Focused Work</Select.Option>
              <Select.Option value="admin">Admin Task</Select.Option>
            </Select>
          </FormItem>

          <FormItem
            label="Dependencies"
            field="dependsOn"
            initialValue={[]}
          >
            <Select
              mode="multiple"
              placeholder="Select steps this depends on"
            >
              {editingSteps.map((step, index) => {
                if (index !== editingStepIndex) {
                  return (
                    <Select.Option key={index} value={`step-${index}`}>
                      Step {index + 1}: {step.name}
                    </Select.Option>
                  )
                }
                return null
              })}
            </Select>
          </FormItem>
        </Form>
      </Modal>
    </Space>
  )
}
