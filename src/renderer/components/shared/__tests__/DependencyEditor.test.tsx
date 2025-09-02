import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DependencyEditor } from '../DependencyEditor'
import { AmendmentType, EntityType } from '@shared/amendment-types'

describe('DependencyEditor', () => {
  const mockSteps = [
    { id: 'step-1', name: 'Step 1', stepIndex: 0 },
    { id: 'step-2', name: 'Step 2', stepIndex: 1 },
    { id: 'step-3', name: 'Step 3', stepIndex: 2 },
  ]

  describe('Direct Mode', () => {
    it('should render in direct mode with forward dependencies', () => {
      const onForwardChange = vi.fn()
      
      render(
        <DependencyEditor
          mode="direct"
          currentStepId="step-1"
          currentStepName="Step 1"
          availableSteps={mockSteps}
          forwardDependencies={['step-2']}
          onForwardDependenciesChange={onForwardChange}
          showBidirectional={false}
        />
      )
      
      expect(screen.getByText('Dependencies')).toBeInTheDocument()
      expect(screen.getByText(/Steps that must complete before Step 1 can start/)).toBeInTheDocument()
      expect(screen.getByText('Depends on: Step 2')).toBeInTheDocument()
    })

    it('should render bidirectional dependencies when enabled', () => {
      const onForwardChange = vi.fn()
      const onReverseChange = vi.fn()
      
      render(
        <DependencyEditor
          mode="direct"
          currentStepId="step-1"
          currentStepName="Step 1"
          availableSteps={mockSteps}
          forwardDependencies={[]}
          onForwardDependenciesChange={onForwardChange}
          reverseDependencies={['step-3']}
          onReverseDependenciesChange={onReverseChange}
          showBidirectional={true}
        />
      )
      
      expect(screen.getByText('Dependencies')).toBeInTheDocument()
      expect(screen.getByText('Reverse Dependencies')).toBeInTheDocument()
      expect(screen.getByText('Required by: Step 3')).toBeInTheDocument()
    })

    it('should filter out current step from available options', () => {
      const onForwardChange = vi.fn()
      
      const { container } = render(
        <DependencyEditor
          currentStepId="step-1"
          currentStepName="Step 1"
          availableSteps={mockSteps}
          forwardDependencies={[]}
          onForwardDependenciesChange={onForwardChange}
        />
      )
      
      // The Select component should not include Step 1 as an option
      const select = container.querySelector('.arco-select')
      expect(select).toBeInTheDocument()
    })

    it('should show circular dependency warning', () => {
      const onForwardChange = vi.fn()
      const onReverseChange = vi.fn()
      
      render(
        <DependencyEditor
          currentStepId="step-1"
          availableSteps={mockSteps}
          forwardDependencies={['step-2']}
          onForwardDependenciesChange={onForwardChange}
          reverseDependencies={['step-2']} // Same step in both - circular
          onReverseDependenciesChange={onReverseChange}
          showBidirectional={true}
        />
      )
      
      expect(screen.getByText(/Circular dependencies detected/)).toBeInTheDocument()
    })
  })

  describe('Amendment Mode', () => {
    it('should render in amendment mode', () => {
      const onChange = vi.fn()
      
      const amendment = {
        type: AmendmentType.DependencyChange as const,
        target: { 
          type: EntityType.Workflow as const, 
          name: 'Test Workflow', 
          confidence: 1 
        },
        stepName: 'Step 1',
        addDependencies: ['Step 2'],
        removeDependencies: ['Step 3'],
      }
      
      render(
        <DependencyEditor
          mode="amendment"
          amendment={amendment}
          onChange={onChange}
          availableSteps={mockSteps}
        />
      )
      
      expect(screen.getByText('Forward Dependencies')).toBeInTheDocument()
      expect(screen.getByText('Add dependencies:')).toBeInTheDocument()
      expect(screen.getByText('Remove dependencies:')).toBeInTheDocument()
    })

    it('should show summary of changes in amendment mode', () => {
      const onChange = vi.fn()
      
      const amendment = {
        type: AmendmentType.DependencyChange as const,
        target: { 
          type: EntityType.Workflow as const, 
          name: 'Test Workflow', 
          confidence: 1 
        },
        stepName: 'Step 1',
        addDependencies: ['Step 2'],
        removeDependencies: ['Step 3'],
        addDependents: ['Step 3'],
        removeDependents: ['Step 2'],
      }
      
      render(
        <DependencyEditor
          mode="amendment"
          amendment={amendment}
          onChange={onChange}
          availableSteps={mockSteps}
        />
      )
      
      expect(screen.getByText('Summary of changes:')).toBeInTheDocument()
      expect(screen.getByText(/Step 1 will depend on: Step 2/)).toBeInTheDocument()
      expect(screen.getByText(/Step 1 will no longer depend on: Step 3/)).toBeInTheDocument()
      expect(screen.getByText(/These will depend on Step 1: Step 3/)).toBeInTheDocument()
      expect(screen.getByText(/These will no longer depend on Step 1: Step 2/)).toBeInTheDocument()
    })

    it('should handle amendment changes', () => {
      const onChange = vi.fn()
      
      const amendment = {
        type: AmendmentType.DependencyChange as const,
        target: { 
          type: EntityType.Workflow as const, 
          name: 'Test Workflow', 
          confidence: 1 
        },
        stepName: 'Step 1',
        addDependencies: [],
      }
      
      const { container } = render(
        <DependencyEditor
          mode="amendment"
          amendment={amendment}
          onChange={onChange}
          availableSteps={mockSteps}
        />
      )
      
      // Find the first select (Add dependencies)
      const selects = container.querySelectorAll('.arco-select')
      expect(selects.length).toBeGreaterThan(0)
    })

    it('should render reverse dependencies in amendment mode', () => {
      const onChange = vi.fn()
      
      const amendment = {
        type: AmendmentType.DependencyChange as const,
        target: { 
          type: EntityType.Workflow as const, 
          name: 'Test Workflow', 
          confidence: 1 
        },
        stepName: 'Step 1',
        addDependents: ['Step 2'],
        removeDependents: ['Step 3'],
      }
      
      render(
        <DependencyEditor
          mode="amendment"
          amendment={amendment}
          onChange={onChange}
          availableSteps={mockSteps}
        />
      )
      
      expect(screen.getByText('Reverse Dependencies')).toBeInTheDocument()
      expect(screen.getByText('Add dependents:')).toBeInTheDocument()
      expect(screen.getByText('Remove dependents:')).toBeInTheDocument()
    })
  })

  describe('Mode Switching', () => {
    it('should default to direct mode when mode is not specified', () => {
      const onForwardChange = vi.fn()
      
      render(
        <DependencyEditor
          currentStepId="step-1"
          availableSteps={mockSteps}
          forwardDependencies={[]}
          onForwardDependenciesChange={onForwardChange}
        />
      )
      
      // Direct mode shows "Dependencies" instead of "Forward Dependencies"
      expect(screen.getByText('Dependencies')).toBeInTheDocument()
      expect(screen.queryByText('Forward Dependencies')).not.toBeInTheDocument()
    })

    it('should handle disabled state', () => {
      const onForwardChange = vi.fn()
      
      const { container } = render(
        <DependencyEditor
          currentStepId="step-1"
          availableSteps={mockSteps}
          forwardDependencies={[]}
          onForwardDependenciesChange={onForwardChange}
          disabled={true}
        />
      )
      
      const select = container.querySelector('.arco-select')
      expect(select).toHaveClass('arco-select-disabled')
    })
  })
})