# Responsive Design Implementation Plan - Work Capacity Planner
## Complete Architecture & Implementation Guide

---

## Part A: Strategic Architecture & Foundation

### 1. Overall Responsive Design Philosophy

#### Core Principles
- **Container-First Design**: Components respond to their container, not just viewport
- **Fluid by Default**: Use relative units (%, rem, vw/vh) over fixed pixels
- **Progressive Enhancement**: Mobile-first, then enhance for larger screens
- **Consistent Breakpoints**: Unified system across all components

#### Modern Responsive Architecture
```typescript
// Central responsive configuration
const RESPONSIVE_CONFIG = {
  breakpoints: {
    xs: 0,     // Mobile
    sm: 640,   // Large mobile
    md: 768,   // Tablet
    lg: 1024,  // Desktop
    xl: 1280,  // Large desktop
    xxl: 1536  // Ultra-wide
  },
  containerQueries: {
    narrow: '(max-width: 400px)',
    standard: '(min-width: 401px) and (max-width: 800px)',
    wide: '(min-width: 801px)'
  },
  spacing: {
    base: '1rem',
    scale: [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8]
  }
}
```

### 2. Testing Infrastructure Setup

#### Install Playwright (Recommended over Puppeteer)
```bash
npm install -D @playwright/test @playwright/experimental-ct-react
npx playwright install
```

#### Configure Playwright for Electron
Create `playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    // Launch Electron app
    launchOptions: {
      executablePath: require('electron'),
      args: ['./dist/main/index.js']
    }
  },
  projects: [
    {
      name: 'Desktop',
      use: { viewport: { width: 1920, height: 1080 } }
    },
    {
      name: 'Laptop',
      use: { viewport: { width: 1366, height: 768 } }
    },
    {
      name: 'Tablet',
      use: { viewport: { width: 768, height: 1024 } }
    },
    {
      name: 'Mobile',
      use: { viewport: { width: 375, height: 667 } }
    }
  ]
})
```

#### Responsive Testing Suite
Create `e2e/responsive.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.describe('Responsive Layout Tests', () => {
  test('No horizontal scrollbars at any breakpoint', async ({ page }) => {
    await page.goto('/')
    
    // Check document doesn't overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const windowWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(windowWidth)
  })
  
  test('Components scale properly', async ({ page }) => {
    await page.goto('/')
    
    // Test specific components
    const timeline = await page.locator('.swimlane-timeline')
    const timelineBounds = await timeline.boundingBox()
    expect(timelineBounds?.width).toBeLessThanOrEqual(await page.viewportSize()?.width)
  })
})
```

### 3. Shared Responsive System

#### Create Core Responsive Provider
Create `src/renderer/providers/ResponsiveProvider.tsx`:
```typescript
import React, { createContext, useContext, useEffect, useState } from 'react'

interface ResponsiveContextValue {
  breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
  orientation: 'portrait' | 'landscape'
  containerQuery: (element: HTMLElement) => ContainerSize
  isTouch: boolean
  scale: number // Global scale factor
}

const ResponsiveContext = createContext<ResponsiveContextValue | null>(null)

export const ResponsiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ResponsiveContextValue>({
    breakpoint: 'lg',
    orientation: 'landscape',
    containerQuery: () => ({ width: 0, height: 0 }),
    isTouch: false,
    scale: 1
  })
  
  useEffect(() => {
    const updateResponsive = () => {
      const width = window.innerWidth
      let breakpoint: ResponsiveContextValue['breakpoint'] = 'xs'
      
      if (width >= 1536) breakpoint = 'xxl'
      else if (width >= 1280) breakpoint = 'xl'
      else if (width >= 1024) breakpoint = 'lg'
      else if (width >= 768) breakpoint = 'md'
      else if (width >= 640) breakpoint = 'sm'
      
      setState(prev => ({
        ...prev,
        breakpoint,
        orientation: width > window.innerHeight ? 'landscape' : 'portrait',
        isTouch: 'ontouchstart' in window,
        scale: Math.min(1, width / 1920) // Scale relative to design width
      }))
    }
    
    updateResponsive()
    window.addEventListener('resize', updateResponsive)
    return () => window.removeEventListener('resize', updateResponsive)
  }, [])
  
  return (
    <ResponsiveContext.Provider value={state}>
      {children}
    </ResponsiveContext.Provider>
  )
}

export const useResponsive = () => {
  const context = useContext(ResponsiveContext)
  if (!context) throw new Error('useResponsive must be used within ResponsiveProvider')
  return context
}
```

#### Create HOC for Responsive Components
Create `src/renderer/hoc/withResponsive.tsx`:
```typescript
import React from 'react'
import { useResponsive } from '../providers/ResponsiveProvider'

export interface ResponsiveProps {
  breakpoint: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
  scale: number
  isCompact: boolean
}

export function withResponsive<P extends object>(
  Component: React.ComponentType<P & ResponsiveProps>
) {
  return (props: P) => {
    const { breakpoint, scale } = useResponsive()
    const isCompact = ['xs', 'sm'].includes(breakpoint)
    
    return <Component {...props} breakpoint={breakpoint} scale={scale} isCompact={isCompact} />
  }
}
```

#### Container Query Hook
Create `src/renderer/hooks/useContainerQuery.ts`:
```typescript
import { useEffect, useRef, useState } from 'react'

interface ContainerSize {
  width: number
  height: number
  breakpoint: 'narrow' | 'standard' | 'wide'
}

export function useContainerQuery<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
    breakpoint: 'standard'
  })
  
  useEffect(() => {
    if (!ref.current) return
    
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      const breakpoint = width < 400 ? 'narrow' : width > 800 ? 'wide' : 'standard'
      setSize({ width, height, breakpoint })
    })
    
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  
  return { ref, ...size }
}
```

### 4. CSS Architecture

#### Global Responsive Variables
Create `src/renderer/styles/responsive.css`:
```css
:root {
  /* Fluid spacing scale */
  --space-xs: clamp(0.25rem, 1vw, 0.5rem);
  --space-sm: clamp(0.5rem, 2vw, 1rem);
  --space-md: clamp(1rem, 3vw, 1.5rem);
  --space-lg: clamp(1.5rem, 4vw, 2rem);
  --space-xl: clamp(2rem, 5vw, 3rem);
  
  /* Fluid typography */
  --text-xs: clamp(0.75rem, 1.5vw, 0.875rem);
  --text-sm: clamp(0.875rem, 2vw, 1rem);
  --text-base: clamp(1rem, 2.5vw, 1.125rem);
  --text-lg: clamp(1.125rem, 3vw, 1.25rem);
  --text-xl: clamp(1.25rem, 4vw, 1.5rem);
  
  /* Container widths */
  --container-sm: min(100% - 2rem, 640px);
  --container-md: min(100% - 2rem, 768px);
  --container-lg: min(100% - 2rem, 1024px);
  --container-xl: min(100% - 2rem, 1280px);
  
  /* Component-specific sizing */
  --sidebar-width: clamp(200px, 20vw, 300px);
  --modal-width: min(90vw, 600px);
  --card-min-width: min(100%, 300px);
}

/* Container query support (modern browsers) */
@container (max-width: 400px) {
  .responsive-component {
    --local-spacing: 0.5rem;
  }
}

@container (min-width: 401px) and (max-width: 800px) {
  .responsive-component {
    --local-spacing: 1rem;
  }
}

@container (min-width: 801px) {
  .responsive-component {
    --local-spacing: 1.5rem;
  }
}
```

---

## Part B: Component Patterns & Templates

### Standard Responsive Component Template
```typescript
// Template for all new components
import React from 'react'
import { useContainerQuery } from '@/hooks/useContainerQuery'
import { withResponsive, ResponsiveProps } from '@/hoc/withResponsive'

interface ComponentProps extends ResponsiveProps {
  // Component-specific props
}

const ResponsiveComponentBase: React.FC<ComponentProps> = ({ 
  breakpoint, 
  scale, 
  isCompact,
  ...props 
}) => {
  const { ref, width, height, breakpoint: containerBreakpoint } = useContainerQuery<HTMLDivElement>()
  
  // Calculate responsive values
  const fontSize = isCompact ? 12 : 14
  const padding = isCompact ? 8 : 16
  const columns = {
    'narrow': 1,
    'standard': 2,
    'wide': 3
  }[containerBreakpoint]
  
  return (
    <div ref={ref} style={{ 
      fontSize: fontSize * scale,
      padding: `${padding * scale}px`,
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`
    }}>
      {/* Component content */}
    </div>
  )
}

export const ResponsiveComponent = withResponsive(ResponsiveComponentBase)
```

---

## Part C: Specific Component Fixes [TACTICAL]

### Priority 1: Fix SwimLaneTimeline Scrollbar Issue

**File:** `src/renderer/components/work-logger/SwimLaneTimeline.tsx`

**Add Responsive Mode:**
```typescript
// Add to component
const { ref: containerRef, width: containerWidth } = useContainerQuery<HTMLDivElement>()
const { breakpoint, isCompact } = useResponsive()

// Calculate responsive dimensions
const timelineMode = containerWidth < 800 ? 'fit' : 'scroll'
const hourWidth = timelineMode === 'fit' 
  ? containerWidth / visibleHours 
  : defaultHourWidth

// Apply responsive styles
const containerStyle = {
  width: '100%',
  '--hour-width': `${hourWidth}px`,
  '--label-width': isCompact ? '60px' : '80px',
  overflowX: timelineMode === 'fit' ? 'hidden' : 'auto',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' }
}
```

### Priority 2: Make CircularClock Responsive

**File:** `src/renderer/components/work-logger/CircularClock.tsx`

**Full Responsive Implementation:**
```typescript
const CircularClock: React.FC = () => {
  const { ref, width, height } = useContainerQuery<HTMLDivElement>()
  const { scale: globalScale } = useResponsive()
  
  // Dynamic sizing based on container
  const size = Math.min(width - 40, height - 40, 400) || 240
  const scale = (size / 240) * globalScale
  
  const dimensions = {
    size,
    outerRadius: 100 * scale,
    innerRadius: 70 * scale,
    fontSize: {
      hours: Math.max(10, 12 * scale),
      labels: Math.max(8, 11 * scale)
    }
  }
  
  return (
    <div ref={ref} className="clock-container">
      <svg width={size} height={size}>
        {/* Use dimensions object for all sizing */}
      </svg>
    </div>
  )
}
```

### Priority 3: Fix EisenhowerMatrix Container Bug

**File:** `src/renderer/components/tasks/EisenhowerMatrix.tsx`

**Add Container Query Support:**
```typescript
// Replace existing size calculation with:
const { ref: scatterRef, width, height, breakpoint } = useContainerQuery<HTMLDivElement>()

// Use container breakpoint for layout decisions
const layout = breakpoint === 'narrow' ? 'vertical' : 'grid'
const taskSize = breakpoint === 'narrow' ? 'small' : 'normal'

// Ensure minimum dimensions
const safeWidth = Math.max(300, width)
const safeHeight = Math.max(300, height)
```

### Priority 4: Update All Arco Grid Components

**Pattern for all Grid updates:**
```typescript
// Before
<Row gutter={16}>
  <Col span={4}>Content</Col>
</Row>

// After
<Row gutter={[16, 16]} wrap>
  <Col xs={24} sm={12} md={8} lg={6} xl={4}>Content</Col>
</Row>
```

---

## Part D: Implementation Roadmap

### Week 1: Foundation
| Day | Task | Deliverables |
|-----|------|--------------|
| 1-2 | Setup testing infrastructure | Playwright config, first E2E test |
| 3 | Create ResponsiveProvider | Provider, context, base hooks |
| 4 | Implement shared utilities | Container query hook, HOC |
| 5 | Setup CSS architecture | Variables, container queries |

### Week 2: Component Migration
| Day | Task | Priority |
|-----|------|----------|
| 6 | Fix SwimLaneTimeline | CRITICAL |
| 7 | Fix CircularClock | HIGH |
| 8 | Fix EisenhowerMatrix | HIGH |
| 9 | Update GanttChart | MEDIUM |
| 10 | Update all Grid components | MEDIUM |

### Week 3: Testing & Polish
- Write comprehensive E2E tests
- Add visual regression testing
- Performance optimization
- Documentation

---

## Part E: Testing Strategy

### Unit Test Requirements
```typescript
// Test responsive hooks
describe('useContainerQuery', () => {
  it('returns correct breakpoint for container size', () => {
    // Test narrow, standard, wide breakpoints
  })
})

// Test HOC
describe('withResponsive', () => {
  it('passes responsive props to component', () => {
    // Verify breakpoint, scale, isCompact
  })
})
```

### E2E Test Suite
```typescript
// Critical responsive tests
test('No horizontal overflow at any screen size', async ({ page, viewport }) => {
  // Test at each breakpoint
})

test('Components scale proportionally', async ({ page }) => {
  // Verify relative sizing works
})

test('Touch interactions work on mobile', async ({ page }) => {
  // Test touch gestures
})
```

### Visual Regression Testing
```bash
# Add Percy or Chromatic for visual testing
npm install -D @percy/playwright

# In tests:
await percySnapshot(page, 'Component at mobile size')
```

---

## Part F: Migration Checklist

### Pre-Migration
- [ ] Backup current code
- [ ] Create feature branch
- [ ] Install testing libraries
- [ ] Setup ResponsiveProvider in App.tsx

### During Migration
- [ ] Wrap App with ResponsiveProvider
- [ ] Update components incrementally
- [ ] Run tests after each component
- [ ] Check all breakpoints

### Post-Migration
- [ ] Full E2E test suite passing
- [ ] Visual regression tests passing
- [ ] Performance benchmarks met
- [ ] Documentation updated

---

## Important Notes

### What NOT to Change
1. DO NOT modify the logging system - already excellent
2. DO NOT remove zoom functionality - enhance with responsive
3. DO NOT change IPC architecture
4. DO NOT break existing tests

### Success Metrics
- Zero horizontal scrollbars at 1366x768
- All components fit on 375x667 (iPhone SE)
- Page load time < 3s on mobile
- Lighthouse score > 90 for mobile

### Modern Best Practices Applied
- Container queries for component isolation
- Fluid typography with clamp()
- CSS custom properties for theming
- ResizeObserver for dynamic sizing
- Touch-first interaction patterns

---

Generated: 2024-12-27
Version: 2.0 - Complete Architecture & Implementation