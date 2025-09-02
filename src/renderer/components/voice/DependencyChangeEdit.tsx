import React from 'react'
import { Space, Typography, Select, Divider } from '@arco-design/web-react'
import { DependencyChange } from '@shared/amendment-types'

const { Text } = Typography

interface DependencyChangeEditProps {
  amendment: DependencyChange
  onChange: (updated: DependencyChange) => void
  availableSteps?: TaskStep[]  // Available steps in the workflow for selection
}

export const DependencyChangeEdit: React.FC<DependencyChangeEditProps> = ({
  amendment,
  onChange,
  availableSteps = [],
}) => {
  // Get step names for the select options, excluding the current step
  const stepOptions = availableSteps
    .filter(step => step.name !== amendment.stepName)
    .map(step => ({
      label: step.name,
      value: step.name,
    }))

  const handleDependenciesChange = (field: 'addDependencies' | 'removeDependencies' | 'addDependents' | 'removeDependents') => (value: string[]) => {
    onChange({
      ...amendment,
      [field]: value,
    })
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="medium">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text strong>Forward Dependencies</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Tasks that {amendment.stepName || 'this task'} depends on
        </Text>

        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text>Add dependencies:</Text>
            <Select
              mode="multiple"
              placeholder="Select tasks this depends on"
              value={amendment.addDependencies || []}
              onChange={handleDependenciesChange('addDependencies')}
              options={stepOptions}
              style={{ width: '100%', marginTop: 8 }}
              allowClear
            />
          </div>

          <div>
            <Text>Remove dependencies:</Text>
            <Select
              mode="multiple"
              placeholder="Select dependencies to remove"
              value={amendment.removeDependencies || []}
              onChange={handleDependenciesChange('removeDependencies')}
              options={stepOptions}
              style={{ width: '100%', marginTop: 8 }}
              allowClear
            />
          </div>
        </Space>
      </Space>

      <Divider />

      <Space direction="vertical" style={{ width: '100%' }}>
        <Text strong>Reverse Dependencies</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Tasks that should depend on {amendment.stepName || 'this task'}
        </Text>

        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text>Add dependents:</Text>
            <Select
              mode="multiple"
              placeholder="Select tasks that should depend on this"
              value={amendment.addDependents || []}
              onChange={handleDependenciesChange('addDependents')}
              options={stepOptions}
              style={{ width: '100%', marginTop: 8 }}
              allowClear
            />
          </div>

          <div>
            <Text>Remove dependents:</Text>
            <Select
              mode="multiple"
              placeholder="Select tasks to stop depending on this"
              value={amendment.removeDependents || []}
              onChange={handleDependenciesChange('removeDependents')}
              options={stepOptions}
              style={{ width: '100%', marginTop: 8 }}
              allowClear
            />
          </div>
        </Space>
      </Space>

      {/* Show a summary of what will happen */}
      {(amendment.addDependencies?.length ||
        amendment.removeDependencies?.length ||
        amendment.addDependents?.length ||
        amendment.removeDependents?.length) ? (
        <Space direction="vertical" style={{
          width: '100%',
          padding: 12,
          background: '#f5f5f5',
          borderRadius: 4,
        }}>
          <Text strong>Summary of changes:</Text>
          {amendment.addDependencies?.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              • {amendment.stepName} will depend on: {amendment.addDependencies.join(', ')}
            </Text>
          ) : null}
          {amendment.removeDependencies?.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              • {amendment.stepName} will no longer depend on: {amendment.removeDependencies.join(', ')}
            </Text>
          ) : null}
          {amendment.addDependents?.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              • These will depend on {amendment.stepName}: {amendment.addDependents.join(', ')}
            </Text>
          ) : null}
          {amendment.removeDependents?.length ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              • These will no longer depend on {amendment.stepName}: {amendment.removeDependents.join(', ')}
            </Text>
          ) : null}
        </Space>
      ) : null}
    </Space>
  )
}
