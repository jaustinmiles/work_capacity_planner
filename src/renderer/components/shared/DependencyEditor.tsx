import React, { useMemo } from 'react'
import { Space, Typography, Select, Divider, Tag, Alert } from '@arco-design/web-react'

const { Text } = Typography

export interface DependencyEditorProps {
  currentStepId?: string
  currentStepName?: string
  availableSteps: Array<{
    id: string
    name: string
    stepIndex?: number
  }>
  forwardDependencies: string[]  // IDs of steps this depends on
  onForwardDependenciesChange: (stepIds: string[]) => void
  reverseDependencies?: string[]  // IDs of steps that depend on this
  onReverseDependenciesChange?: (stepIds: string[]) => void
  showBidirectional?: boolean
  disabled?: boolean
}

/**
 * Shared component for editing task/workflow dependencies
 * Supports both forward dependencies (what this depends on) and
 * reverse dependencies (what depends on this)
 */
export const DependencyEditor: React.FC<DependencyEditorProps> = ({
  currentStepId,
  currentStepName = 'this step',
  availableSteps,
  forwardDependencies,
  onForwardDependenciesChange,
  reverseDependencies = [],
  onReverseDependenciesChange,
  showBidirectional = false,
  disabled = false,
}) => {
  // Filter out current step and calculate available options
  const forwardOptions = useMemo(() => {
    return availableSteps
      .filter(step => {
        // Can't depend on self
        if (step.id === currentStepId) return false
        // Can't create circular dependencies
        if (reverseDependencies.includes(step.id)) return false
        return true
      })
      .map(step => ({
        label: step.name,
        value: step.id,
      }))
  }, [availableSteps, currentStepId, reverseDependencies])

  const reverseOptions = useMemo(() => {
    return availableSteps
      .filter(step => {
        // Can't make self depend on self
        if (step.id === currentStepId) return false
        // Can't create circular dependencies
        if (forwardDependencies.includes(step.id)) return false
        return true
      })
      .map(step => ({
        label: step.name,
        value: step.id,
      }))
  }, [availableSteps, currentStepId, forwardDependencies])

  // Helper to get step names from IDs
  const getStepNames = (stepIds: string[]) => {
    return stepIds.map(id => {
      const step = availableSteps.find(s => s.id === id)
      return step?.name || id
    }).join(', ')
  }

  const handleForwardChange = (value: string[]) => {
    // Remove any that would create circular dependencies
    const filtered = value.filter(id => !reverseDependencies.includes(id))
    onForwardDependenciesChange(filtered)
  }

  const handleReverseChange = (value: string[]) => {
    if (!onReverseDependenciesChange) return
    // Remove any that would create circular dependencies
    const filtered = value.filter(id => !forwardDependencies.includes(id))
    onReverseDependenciesChange(filtered)
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="medium">
      {/* Forward Dependencies */}
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text strong>Dependencies</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Steps that must complete before {currentStepName} can start
        </Text>
        <Select
          mode="multiple"
          placeholder="Select prerequisite steps"
          value={forwardDependencies}
          onChange={handleForwardChange}
          options={forwardOptions}
          style={{ width: '100%' }}
          disabled={disabled}
          allowClear
        />
        {forwardDependencies.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <Tag color="purple" size="small">
              Depends on: {getStepNames(forwardDependencies)}
            </Tag>
          </div>
        )}
      </Space>

      {/* Bidirectional Dependencies */}
      {showBidirectional && onReverseDependenciesChange && (
        <>
          <Divider style={{ margin: '12px 0' }} />

          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>Reverse Dependencies</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Steps that should wait for {currentStepName} to complete
            </Text>
            <Select
              mode="multiple"
              placeholder="Select steps that depend on this"
              value={reverseDependencies}
              onChange={handleReverseChange}
              options={reverseOptions}
              style={{ width: '100%' }}
              disabled={disabled}
              allowClear
            />
            {reverseDependencies.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Tag color="blue" size="small">
                  Required by: {getStepNames(reverseDependencies)}
                </Tag>
              </div>
            )}
          </Space>
        </>
      )}

      {/* Circular Dependency Warning */}
      {showBidirectional && (forwardDependencies.some(id => reverseDependencies.includes(id)) ||
        reverseDependencies.some(id => forwardDependencies.includes(id))) && (
        <Alert
          type="warning"
          content="Circular dependencies detected and automatically prevented"
          style={{ marginTop: 8 }}
        />
      )}
    </Space>
  )
}

// Re-export for convenience
export default DependencyEditor
