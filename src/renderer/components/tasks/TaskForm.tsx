import React, { useState } from 'react'
import { Modal, Form, Input, Select, Slider, InputNumber, Typography, Space, Grid, Button } from '@arco-design/web-react'
import { IconClockCircle, IconCalendar } from '@arco-design/web-react/icon'
import { useTaskStore } from '../../store/useTaskStore'

const { TextArea } = Input
const { Row, Col } = Grid
const { Text } = Typography

interface TaskFormProps {
  visible: boolean
  onClose: () => void
}

export function TaskForm({ visible, onClose }: TaskFormProps) {
  const { addTask } = useTaskStore()
  const [form] = Form.useForm()
  
  const handleSubmit = async () => {
    try {
      const values = await form.validate()
      await addTask({
        ...values,
        dependencies: [],
        completed: false,
      })
      
      form.resetFields()
      onClose()
    } catch (error) {
      // Form validation failed or database error
      // Error already handled by store
    }
  }
  
  return (
    <Modal
      title="Create New Task"
      visible={visible}
      onOk={handleSubmit}
      onCancel={onClose}
      autoFocus={false}
      focusLock={true}
      okText="Add Task"
      style={{ width: 600 }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          duration: 60,
          importance: 5,
          urgency: 5,
          type: 'focused',
          asyncWaitTime: 0,
        }}
      >
        <Form.Item
          label="Task Name"
          field="name"
          rules={[{ required: true, message: 'Please enter a task name' }]}
        >
          <Input placeholder="Enter task name" />
        </Form.Item>
        
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Type"
              field="type"
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="focused">Focused Work</Select.Option>
                <Select.Option value="admin">Admin/Meetings</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          
          <Col span={12}>
            <Form.Item
              label={
                <Space>
                  <IconClockCircle />
                  <span>Duration (minutes)</span>
                </Space>
              }
              field="duration"
              rules={[{ required: true, min: 5 }]}
            >
              <InputNumber
                min={5}
                step={5}
                placeholder="60"
                style={{ width: '100%' }}
              />
            </Form.Item>
          </Col>
        </Row>
        
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label="Importance (1-10)"
              field="importance"
              rules={[{ required: true }]}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Slider
                  min={1}
                  max={10}
                  marks={{
                    1: '1',
                    5: '5',
                    10: '10',
                  }}
                />
              </Space>
            </Form.Item>
          </Col>
          
          <Col span={12}>
            <Form.Item
              label="Urgency (1-10)"
              field="urgency"
              rules={[{ required: true }]}
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Slider
                  min={1}
                  max={10}
                  marks={{
                    1: '1',
                    5: '5',
                    10: '10',
                  }}
                />
              </Space>
            </Form.Item>
          </Col>
        </Row>
        
        <Form.Item
          label={
            <Space>
              <IconCalendar />
              <span>Async Wait Time (minutes)</span>
            </Space>
          }
          field="asyncWaitTime"
          extra="Time to wait for external processes (e.g., CI/CD, reviews)"
        >
          <InputNumber
            min={0}
            step={5}
            placeholder="0"
            style={{ width: '100%' }}
          />
        </Form.Item>
        
        <Form.Item
          label="Notes"
          field="notes"
        >
          <TextArea
            placeholder="Additional details..."
            showWordLimit
            maxLength={500}
            rows={3}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}