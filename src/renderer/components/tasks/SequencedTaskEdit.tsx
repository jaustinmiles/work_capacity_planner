import { useState, useEffect } from 'react'
import { TaskType } from '@shared/enums'
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
  Popconfirm,
  Divider,
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
  IconClockCircle,
  IconCheckCircle,
  IconCloseCircle,
} from '@arco-design/web-react/icon'
import { SequencedTask, TaskStep } from '@shared/sequencing-types'
import { useTaskStore } from '../../store/useTaskStore'
import { StepWorkSessionsModal } from './StepWorkSessionsModal'
import { getDatabase } from '../../services/database'
import { appEvents, EVENTS } from '../../utils/events'
import { logger } from '../../utils/logger'


const { Title, Text } = Typography
const { Row, Col } = Grid
const FormItem = Form.Item

interface SequencedTaskEditProps {
  task: SequencedTask
  onClose?: () => void
  startInEditMode?: boolean
}

interface EditingStep extends TaskStep {
  tempId?: string
}

export function SequencedTaskEdit({ task, onClose, startInEditMode = false }: SequencedTaskEditProps) {
  const { updateSequencedTask } = useTaskStore()
  const [editedTask, setEditedTask] = useState<SequencedTask>({ ...task })
  const [showWorkSessionsModal, setShowWorkSessionsModal] = useState(false)
  const [selectedStepForSessions, setSelectedStepForSessions] = useState<{id: string, name: string} | null>(null)
  const [stepLoggedTimes, setStepLoggedTimes] = useState<Record<string, number>>({})
  const [editingSteps, setEditingSteps] = useState<EditingStep[]>(
    task.steps.map((step, index) => ({
      ...step,
      // Ensure each step has an ID for dependency tracking
      id: step.id || `step-${task.id}-${index}`,
    })),
  )
  const [isEditing, setIsEditing] = useState(startInEditMode)
  const [isSaving, setIsSaving] = useState(false)
  const [showStepModal, setShowStepModal] = useState(false)
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null)
  const [stepForm] = Form.useForm()

  // Load logged times for all steps
  useEffect(() => {
    const loadLoggedTimes = async () => {
      const times: Record<string, number> = {}
      for (const step of editingSteps) {
        try {
          const sessions = await getDatabase().getStepWorkSessions(step.id)
          const totalMinutes = sessions.reduce((sum: number, session: any) =>
            sum + (session.actualMinutes || session.plannedMinutes || 0), 0)
          times[step.id] = totalMinutes
        } catch (error) {
          logger.ui.error(`Failed to load logged time for step ${step.id}:`, error)
          times[step.id] = 0
        }
      }
      setStepLoggedTimes(times)
    }

    loadLoggedTimes()
  }, [editingSteps])

  // Helper to format dependency list for display
  const formatDependencyList = (dependsOn: string[]): string => {
    if (dependsOn.length === 0) return ''
    return dependsOn.map(dep => {
      // First try to find by ID
      const stepById = editingSteps.find(s => s.id === dep)
      if (stepById) return stepById.name

      // If dep is a name, return it directly (for backward compatibility)
      if (!dep.startsWith('step-')) {
        return dep
      }

      // Fallback for malformed IDs
      return dep
    }).join(', ')
  }

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
          taskId: task.id,
          name: cleanStep.name,
          duration: cleanStep.duration,
          type: cleanStep.type,
          dependsOn: cleanStep.dependsOn,
          asyncWaitTime: cleanStep.asyncWaitTime,
          status: cleanStep.status,
          stepIndex: index,
          percentComplete: cleanStep.percentComplete || 0,
          notes: cleanStep.notes || '',
          cognitiveComplexity: cleanStep.cognitiveComplexity || 3,
        }
      })

      await updateSequencedTask(task.id, {
        name: editedTask.name,
        importance: editedTask.importance,
        urgency: editedTask.urgency,
        type: editedTask.type,
        notes: editedTask.notes,
        steps: cleanedSteps,
        duration: totalDuration,
        criticalPathDuration,
        worstCaseDuration,
      })

      // Emit event to update sidebar
      appEvents.emit(EVENTS.WORKFLOW_UPDATED)

      setIsEditing(false)
      if (onClose) onClose()
    } catch (error) {
      logger.ui.error('Failed to update workflow:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const moveStep = (index: number, direction: 'up' | 'down') => {
    const newSteps = [...editingSteps]
    const targetIndex = direction === 'up' ? index - 1 : index + 1

    if (targetIndex >= 0 && targetIndex < newSteps.length) {
      // Simply swap the steps - dependencies use IDs now so they don't need updating
      [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]]
      setEditingSteps(newSteps)
    }
  }

  const deleteStep = (index: number) => {
    const deletedStep = editingSteps[index]
    if (!deletedStep) return
    const deletedStepId = deletedStep.id
    const newSteps = editingSteps.filter((_, i) => i !== index)

    // Update dependencies - remove references to deleted step by ID
    newSteps.forEach(step => {
      step.dependsOn = step.dependsOn.filter(dep => dep !== deletedStepId)
    })

    setEditingSteps(newSteps)
  }

  const toggleStepStatus = (index: number) => {
    const step = editingSteps[index]
    const newStatus = step.status === 'completed' ? 'pending' : 'completed'
    const updatedSteps = [...editingSteps]
    updatedSteps[index] = {
      ...step,
      status: newStatus,
      percentComplete: newStatus === 'completed' ? 100 : 0,
    }
    setEditingSteps(updatedSteps)
  }

  const openStepModal = (index: number | null = null) => {
    if (index !== null) {
      const step = editingSteps[index]
      if (!step) return

      // Convert dependency names to IDs if needed
      const convertedDependencies = step.dependsOn.map(dep => {
        // If it's already an ID, keep it
        if (dep.startsWith('step-')) {
          return dep
        }
        // Otherwise try to find the step by name and use its ID
        const matchingStep = editingSteps.find(s => s.name === dep)
        return matchingStep ? matchingStep.id : dep
      })

      stepForm.setFieldsValue({
        name: step.name,
        duration: step.duration,
        type: step.type,
        asyncWaitTime: step.asyncWaitTime,
        dependsOn: convertedDependencies,
        notes: step.notes || '',
        cognitiveComplexity: step.cognitiveComplexity || 3,
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
          notes: values.notes || '',
          cognitiveComplexity: values.cognitiveComplexity || 3,
        }
        setEditingSteps(newSteps)
      } else {
        // Add new step with proper ID
        const newStepIndex = editingSteps.length
        const newStep: EditingStep = {
          id: `step-${editedTask.id}-${newStepIndex}`,
          tempId: `temp-${Date.now()}`,
          taskId: editedTask.id || '',
          name: values.name,
          duration: values.duration,
          type: values.type,
          asyncWaitTime: values.asyncWaitTime || 0,
          dependsOn: values.dependsOn || [],
          status: 'pending',
          stepIndex: newStepIndex,
          percentComplete: 0,
          notes: values.notes || '',
          cognitiveComplexity: values.cognitiveComplexity || 3,
        }
        setEditingSteps([...editingSteps, newStep])
      }

      setShowStepModal(false)
      stepForm.resetFields()
    } catch (__error) {
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
              {isEditing ? (
                <Input
                  value={editedTask.name}
                  onChange={(value) => setEditedTask({ ...editedTask, name: value })}
                  style={{ fontSize: 20, fontWeight: 600, maxWidth: 400 }}
                  placeholder="Workflow name"
                />
              ) : (
                <Title heading={4}>{editedTask.name}</Title>
              )}
              <Space>
                <Tag color="blue">
                  {editedTask.type === TaskType.Focused ? 'Focused Work' : 'Admin Task'}
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
                  <Select.Option value={TaskType.Focused}>Focused Work</Select.Option>
                  <Select.Option value={TaskType.Admin}>Admin Task</Select.Option>
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

      {/* Steps List */}
      <Card
        title="Workflow Steps"
        bodyStyle={{ padding: 24 }}
      >
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
                            <Text style={{ fontWeight: 'bold' }}>{index + 1}. {step.name}</Text>
                            <Tag size="small" color={step.type === TaskType.Focused ? 'blue' : 'green'}>
                              {step.type === TaskType.Focused ? 'Focused' : 'Admin'}
                            </Tag>
                            {step.status === 'completed' && (
                              <Tag size="small" color="green" icon={<IconCheckCircle />}>
                                Completed
                              </Tag>
                            )}
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
                            {stepLoggedTimes[step.id] > 0 && (
                              <Tag
                                size="small"
                                color="green"
                                style={{ cursor: 'pointer' }}
                                onClick={() => {
                                  setSelectedStepForSessions({ id: step.id, name: step.name })
                                  setShowWorkSessionsModal(true)
                                }}
                              >
                                Logged: {formatDuration(stepLoggedTimes[step.id])}
                              </Tag>
                            )}
                            {step.dependsOn.length > 0 && (
                              <Tag size="small" color="purple">
                                Depends on: {formatDependencyList(step.dependsOn)}
                              </Tag>
                            )}
                          </Space>

                          {step.notes && (
                            <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>
                              Note: {step.notes}
                            </Text>
                          )}
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
                            <Button
                              size="small"
                              icon={<IconClockCircle />}
                              onClick={() => {
                                setSelectedStepForSessions({ id: step.id, name: step.name })
                                setShowWorkSessionsModal(true)
                              }}
                            />
                            <Button
                              size="small"
                              type={step.status === 'completed' ? 'outline' : 'primary'}
                              icon={step.status === 'completed' ? <IconCloseCircle /> : <IconCheckCircle />}
                              onClick={() => toggleStepStatus(index)}
                            >
                              {step.status === 'completed' ? 'Incomplete' : 'Complete'}
                            </Button>
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
                    <Text style={{ fontWeight: 'bold' }}>
                      {formatDuration(editingSteps.reduce((sum, step) => sum + step.duration, 0))}
                    </Text>
                  </Space>
                </Col>
                <Col span={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Total Wait Time</Text>
                    <Text style={{ fontWeight: 'bold' }}>
                      {formatDuration(editingSteps.reduce((sum, step) => sum + step.asyncWaitTime, 0))}
                    </Text>
                  </Space>
                </Col>
                <Col span={8}>
                  <Space direction="vertical">
                    <Text type="secondary">Total Duration</Text>
                    <Text style={{ fontWeight: 'bold' }}>
                      {formatDuration(
                        editingSteps.reduce((sum, step) => sum + step.duration + step.asyncWaitTime, 0),
                      )}
                    </Text>
                  </Space>
                </Col>
              </Row>
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
            initialValue={TaskType.Focused}
          >
            <Select>
              <Select.Option value={TaskType.Focused}>Focused Work</Select.Option>
              <Select.Option value={TaskType.Admin}>Admin Task</Select.Option>
            </Select>
          </FormItem>

          <FormItem
            label="Dependencies"
            field="dependsOn"
            initialValue={[]}
            help="Select which steps must complete before this step can start"
          >
            <Select
              mode="multiple"
              placeholder="Select steps this depends on"
              allowClear
              value={stepForm.getFieldValue('dependsOn')}
              onChange={(value) => stepForm.setFieldValue('dependsOn', value)}
            >
              {editingSteps.map((step, index) => {
                // Don't allow depending on self or steps after this one
                if (index !== editingStepIndex && (editingStepIndex === null || index < editingStepIndex)) {
                  return (
                    <Select.Option key={step.id || `index-${index}`} value={step.id}>
                      {step.name}
                    </Select.Option>
                  )
                }
                return null
              })}
            </Select>
          </FormItem>

          <FormItem
            label="Cognitive Complexity (1-5)"
            field="cognitiveComplexity"
            help="1=Simple/Routine, 5=Highly Complex. Complex steps are scheduled during peak hours."
          >
            <Select placeholder="Select complexity">
              <Select.Option value={1}>1 - Simple/Routine</Select.Option>
              <Select.Option value={2}>2 - Straightforward</Select.Option>
              <Select.Option value={3}>3 - Moderate</Select.Option>
              <Select.Option value={4}>4 - Complex</Select.Option>
              <Select.Option value={5}>5 - Highly Complex</Select.Option>
            </Select>
          </FormItem>

          <FormItem
            label="Notes"
            field="notes"
            help="Add any notes or context for this step (e.g., 'Started build process', 'Waiting for review')"
          >
            <Input.TextArea
              placeholder="Add notes about this step..."
              rows={3}
              showWordLimit
              maxLength={500}
            />
          </FormItem>
        </Form>
      </Modal>

      {/* Step Work Sessions Modal */}
      {selectedStepForSessions && (
        <StepWorkSessionsModal
          visible={showWorkSessionsModal}
          onClose={() => {
            setShowWorkSessionsModal(false)
            setSelectedStepForSessions(null)
          }}
          stepId={selectedStepForSessions.id}
          stepName={selectedStepForSessions.name}
          taskId={task.id}
          onSessionsUpdated={async () => {
            // Reload logged times for this step
            try {
              const sessions = await getDatabase().getStepWorkSessions(selectedStepForSessions.id)
              const totalMinutes = sessions.reduce((sum: number, session: any) =>
                sum + (session.actualMinutes || session.plannedMinutes || 0), 0)
              setStepLoggedTimes(prev => ({
                ...prev,
                [selectedStepForSessions.id]: totalMinutes,
              }))
            } catch (error) {
              logger.ui.error('Failed to reload logged time:', error)
            }
          }}
        />
      )}
    </Space>
  )
}
