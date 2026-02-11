/**
 * EndeavorForm - Create/edit form for endeavors
 *
 * Modal form with fields for:
 * - Name (required)
 * - Description
 * - Priority (importance × urgency sliders)
 * - Deadline with type (hard/soft)
 * - Color picker
 */

import { useEffect } from 'react'
import {
  Modal,
  Form,
  Input,
  Slider,
  DatePicker,
  Select,
  Space,
  Typography,
} from '@arco-design/web-react'
import { Message } from '../common/Message'
import { DeadlineType } from '@shared/enums'
import type { EndeavorWithTasks } from '@shared/types'
import { useEndeavorStore } from '../../store/useEndeavorStore'

const { TextArea } = Input
const { Text } = Typography

const FormItem = Form.Item

interface EndeavorFormProps {
  visible: boolean
  onClose: () => void
  endeavor?: EndeavorWithTasks | null
}

const COLOR_OPTIONS = [
  { label: 'Blue', value: '#4A90D9' },
  { label: 'Green', value: '#52C41A' },
  { label: 'Orange', value: '#FA8C16' },
  { label: 'Red', value: '#F5222D' },
  { label: 'Purple', value: '#722ED1' },
  { label: 'Cyan', value: '#13C2C2' },
  { label: 'Pink', value: '#EB2F96' },
  { label: 'Gray', value: '#8C8C8C' },
]

export function EndeavorForm({ visible, onClose, endeavor }: EndeavorFormProps) {
  const [form] = Form.useForm()
  const isEditing = !!endeavor

  const { createEndeavor, updateEndeavor } = useEndeavorStore()

  // Populate form when editing
  useEffect(() => {
    if (endeavor && visible) {
      form.setFieldsValue({
        name: endeavor.name,
        description: endeavor.description || '',
        notes: endeavor.notes || '',
        importance: endeavor.importance,
        urgency: endeavor.urgency,
        deadline: endeavor.deadline ? new Date(endeavor.deadline) : undefined,
        deadlineType: endeavor.deadlineType || undefined,
        color: endeavor.color || undefined,
      })
    } else if (!endeavor && visible) {
      form.resetFields()
    }
  }, [endeavor, visible, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validate()

      const data = {
        name: values.name,
        description: values.description || undefined,
        notes: values.notes || undefined,
        importance: values.importance || 5,
        urgency: values.urgency || 5,
        deadline: values.deadline ? new Date(values.deadline) : undefined,
        deadlineType: values.deadlineType || undefined,
        color: values.color || undefined,
      }

      if (isEditing && endeavor) {
        await updateEndeavor(endeavor.id, data)
        Message.success('Endeavor updated')
      } else {
        await createEndeavor(data)
        Message.success('Endeavor created')
        form.resetFields()
      }
      onClose()
    } catch (err) {
      if (err instanceof Error && err.message !== 'Validate error') {
        Message.error(`Failed: ${err.message}`)
      }
      // Form validation error - handled by Arco
    }
  }

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      title={isEditing ? 'Edit Endeavor' : 'Create Endeavor'}
      okText={isEditing ? 'Save' : 'Create'}
      onOk={handleSubmit}
      style={{ width: 520 }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          importance: 5,
          urgency: 5,
        }}
      >
        <FormItem
          label="Name"
          field="name"
          rules={[{ required: true, message: 'Please enter a name' }]}
        >
          <Input placeholder="e.g., Q1 Product Launch" />
        </FormItem>

        <FormItem label="Description" field="description">
          <TextArea
            placeholder="Brief description of this endeavor's goals"
            rows={2}
          />
        </FormItem>

        <FormItem label="Notes" field="notes">
          <TextArea
            placeholder="Additional notes, context, or reminders"
            rows={3}
          />
        </FormItem>

        <Space style={{ width: '100%' }} size="large">
          <FormItem
            label={
              <Space>
                <span>Importance</span>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  (strategic value)
                </Text>
              </Space>
            }
            field="importance"
            style={{ flex: 1 }}
          >
            <Slider min={1} max={10} marks={{ 1: '1', 5: '5', 10: '10' }} />
          </FormItem>

          <FormItem
            label={
              <Space>
                <span>Urgency</span>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  (time pressure)
                </Text>
              </Space>
            }
            field="urgency"
            style={{ flex: 1 }}
          >
            <Slider min={1} max={10} marks={{ 1: '1', 5: '5', 10: '10' }} />
          </FormItem>
        </Space>

        <Space style={{ width: '100%' }} size="large">
          <FormItem label="Deadline" field="deadline" style={{ flex: 1 }}>
            <DatePicker style={{ width: '100%' }} />
          </FormItem>

          <FormItem label="Deadline Type" field="deadlineType" style={{ flex: 1 }}>
            <Select
              placeholder="Select type"
              allowClear
              options={[
                { label: 'Hard (must meet)', value: DeadlineType.Hard },
                { label: 'Soft (preferred)', value: DeadlineType.Soft },
              ]}
            />
          </FormItem>
        </Space>

        <FormItem label="Color" field="color">
          <Select
            placeholder="Choose a color (optional)"
            allowClear
            options={COLOR_OPTIONS}
            renderFormat={(option) => (
              <Space>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    backgroundColor: option?.value as string,
                  }}
                />
                <span>{option?.children}</span>
              </Space>
            )}
          />
        </FormItem>
      </Form>
    </Modal>
  )
}
