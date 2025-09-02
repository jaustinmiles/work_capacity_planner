import React, { useMemo } from 'react'
import { Space, Typography, Select, Divider, Tag, Alert } from '@arco-design/web-react'
import { DependencyChange } from '@shared/amendment-types'

const { Text } = Typography

// Props for direct state mode (used in edit forms)
export interface DirectModeProps {
  mode?: 'direct'
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

// Props for amendment mode (used in voice amendments)
export interface AmendmentModeProps {
  mode: 'amendment'
  amendment: DependencyChange
  onChange: (updated: DependencyChange) => void
  availableSteps: Array<{
    id: string
    name: string
    stepIndex?: number
  }>
  disabled?: boolean
}

export type DependencyEditorProps = DirectModeProps | AmendmentModeProps

/**
 * Shared component for editing task/workflow dependencies
 * Supports both:
 * - Direct mode: Edit dependencies directly with IDs (used in forms)
 * - Amendment mode: Edit add/remove operations with names (used in voice amendments)
 */
export const DependencyEditor: React.FC<DependencyEditorProps> = (props) => {
  // Determine mode and extract values
  const mode = props.mode || 'direct'
  const isAmendmentMode = mode === 'amendment'

  // Extract values based on mode with proper type narrowing
  let currentStepId: string | undefined
  let currentStepName: string
  let forwardDependencies: string[]
  let reverseDependencies: string[]
  let showBidirectional: boolean

  const availableSteps = props.availableSteps
  const disabled = props.disabled || false

  if (isAmendmentMode && props.mode === 'amendment') {
    // Amendment mode - work with names
    currentStepId = undefined
    currentStepName = props.amendment.stepName || 'this step'
    forwardDependencies = props.amendment.addDependencies || []
    reverseDependencies = props.amendment.addDependents || []
    showBidirectional = true
  } else {
    // Direct mode - work with IDs
    const directProps = props as DirectModeProps
    currentStepId = directProps.currentStepId
    currentStepName = directProps.currentStepName || 'this step'
    forwardDependencies = directProps.forwardDependencies
    reverseDependencies = directProps.reverseDependencies || []
    showBidirectional = directProps.showBidirectional || false
  }
  // Filter out current step and calculate available options
  const forwardOptions = useMemo(() => {
    return availableSteps
      .filter(step => {
        // Can't depend on self (by name in amendment mode, by ID in direct mode)
        if (isAmendmentMode) {
          if (step.name === currentStepName) return false
        } else {
          if (step.id === currentStepId) return false
        }
        // Can't create circular dependencies
        if (isAmendmentMode) {
          // In amendment mode, check by name
          if (reverseDependencies.includes(step.name)) return false
        } else {
          // In direct mode, check by ID
          if (reverseDependencies.includes(step.id)) return false
        }
        return true
      })
      .map(step => ({
        label: step.name,
        value: isAmendmentMode ? step.name : step.id,
      }))
  }, [availableSteps, currentStepId, currentStepName, reverseDependencies, isAmendmentMode])

  const reverseOptions = useMemo(() => {
    return availableSteps
      .filter(step => {
        // Can't make self depend on self
        if (isAmendmentMode) {
          if (step.name === currentStepName) return false
        } else {
          if (step.id === currentStepId) return false
        }
        // Can't create circular dependencies
        if (isAmendmentMode) {
          // In amendment mode, check by name
          if (forwardDependencies.includes(step.name)) return false
        } else {
          // In direct mode, check by ID
          if (forwardDependencies.includes(step.id)) return false
        }
        return true
      })
      .map(step => ({
        label: step.name,
        value: isAmendmentMode ? step.name : step.id,
      }))
  }, [availableSteps, currentStepId, currentStepName, forwardDependencies, isAmendmentMode])

  // Helper to get display names
  const getStepNames = (values: string[]) => {
    if (isAmendmentMode) {
      // In amendment mode, values are already names
      return values.join(', ')
    } else {
      // In direct mode, values are IDs, need to look up names
      return values.map(id => {
        const step = availableSteps.find(s => s.id === id)
        return step?.name || id
      }).join(', ')
    }
  }

  const handleForwardChange = (value: string[]) => {
    // Remove any that would create circular dependencies
    const filtered = value.filter(v => !reverseDependencies.includes(v))

    if (isAmendmentMode) {
      // Update the amendment
      const amendmentProps = props as AmendmentModeProps
      amendmentProps.onChange({
        ...amendmentProps.amendment,
        addDependencies: filtered,
      })
    } else {
      // Update direct dependencies
      const directProps = props as DirectModeProps
      directProps.onForwardDependenciesChange(filtered)
    }
  }

  const handleReverseChange = (value: string[]) => {
    // Remove any that would create circular dependencies
    const filtered = value.filter(v => !forwardDependencies.includes(v))

    if (isAmendmentMode) {
      // Update the amendment
      const amendmentProps = props as AmendmentModeProps
      amendmentProps.onChange({
        ...amendmentProps.amendment,
        addDependents: filtered,
      })
    } else {
      // Update direct dependencies
      const directProps = props as DirectModeProps
      if (directProps.onReverseDependenciesChange) {
        directProps.onReverseDependenciesChange(filtered)
      }
    }
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="medium">
      {/* Forward Dependencies */}
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text style={{ fontWeight: 'bold' }}>
          {isAmendmentMode ? 'Forward Dependencies' : 'Dependencies'}
        </Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {isAmendmentMode
            ? `Tasks that ${currentStepName || 'this task'} depends on`
            : `Steps that must complete before ${currentStepName} can start`}
        </Text>

        {isAmendmentMode ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text>Add dependencies:</Text>
              <Select
                mode="multiple"
                placeholder="Select tasks this depends on"
                value={forwardDependencies}
                onChange={handleForwardChange}
                options={forwardOptions}
                style={{ width: '100%', marginTop: 8 }}
                disabled={disabled}
                allowClear
              />
            </div>

            <div>
              <Text>Remove dependencies:</Text>
              <Select
                mode="multiple"
                placeholder="Select dependencies to remove"
                value={(props as AmendmentModeProps).amendment.removeDependencies || []}
                onChange={(value) => {
                  const amendmentProps = props as AmendmentModeProps
                  amendmentProps.onChange({
                    ...amendmentProps.amendment,
                    removeDependencies: value,
                  })
                }}
                options={forwardOptions}
                style={{ width: '100%', marginTop: 8 }}
                disabled={disabled}
                allowClear
              />
            </div>
          </Space>
        ) : (
          <>
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
          </>
        )}
      </Space>

      {/* Bidirectional Dependencies */}
      {(showBidirectional && (isAmendmentMode || (!isAmendmentMode && (props as DirectModeProps).onReverseDependenciesChange))) && (
        <>
          <Divider style={{ margin: '12px 0' }} />

          <Space direction="vertical" style={{ width: '100%' }}>
            <Text style={{ fontWeight: 'bold' }}>Reverse Dependencies</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {isAmendmentMode
                ? `Tasks that should depend on ${currentStepName || 'this task'}`
                : `Steps that should wait for ${currentStepName} to complete`}
            </Text>

            {isAmendmentMode ? (
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text>Add dependents:</Text>
                  <Select
                    mode="multiple"
                    placeholder="Select tasks that should depend on this"
                    value={reverseDependencies}
                    onChange={handleReverseChange}
                    options={reverseOptions}
                    style={{ width: '100%', marginTop: 8 }}
                    disabled={disabled}
                    allowClear
                  />
                </div>

                <div>
                  <Text>Remove dependents:</Text>
                  <Select
                    mode="multiple"
                    placeholder="Select tasks to stop depending on this"
                    value={(props as AmendmentModeProps).amendment.removeDependents || []}
                    onChange={(value) => {
                      const amendmentProps = props as AmendmentModeProps
                      amendmentProps.onChange({
                        ...amendmentProps.amendment,
                        removeDependents: value,
                      })
                    }}
                    options={reverseOptions}
                    style={{ width: '100%', marginTop: 8 }}
                    disabled={disabled}
                    allowClear
                  />
                </div>
              </Space>
            ) : (
              <>
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
              </>
            )}
          </Space>
        </>
      )}

      {/* Circular Dependency Warning */}
      {showBidirectional && (forwardDependencies.some(v => reverseDependencies.includes(v)) ||
        reverseDependencies.some(v => forwardDependencies.includes(v))) && (
        <Alert
          type="warning"
          content="Circular dependencies detected and automatically prevented"
          style={{ marginTop: 8 }}
        />
      )}

      {/* Amendment Mode Summary */}
      {isAmendmentMode && (() => {
        const amendment = (props as AmendmentModeProps).amendment
        const hasChanges = amendment.addDependencies?.length ||
          amendment.removeDependencies?.length ||
          amendment.addDependents?.length ||
          amendment.removeDependents?.length

        return hasChanges ? (
          <Space direction="vertical" style={{
            width: '100%',
            padding: 12,
            background: '#f5f5f5',
            borderRadius: 4,
          }}>
            <Text style={{ fontWeight: 'bold' }}>Summary of changes:</Text>
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
        ) : null
      })()}
    </Space>
  )
}

// Re-export for convenience
export default DependencyEditor
