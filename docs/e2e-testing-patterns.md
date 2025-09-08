# E2E Testing Patterns & Best Practices

## Overview
This document captures patterns and solutions for E2E testing with Playwright, based on lessons learned from PR #64 and #65 where we fixed 100+ failing tests.

## Common Test Failures and Fixes

### 1. Selector Not Found

#### Problem
```typescript
// Test fails with: locator.toBeVisible: Target closed
await expect(page.locator('h6:has-text("Do First")')).toBeVisible()
```

#### Solution
Use simpler, text-based selectors:
```typescript
// Text content selectors are more resilient
await expect(page.locator('text="Do First"')).toBeVisible()

// For partial matches
await expect(page.locator('text=/Do First/')).toBeVisible()

// When text might be in multiple elements
await expect(page.locator('text="Do First"').first()).toBeVisible()
```

#### Why It Works
- DOM structure changes frequently during development
- Text content visible to users is more stable
- Simpler selectors are easier to debug

### 2. Electron API Undefined

#### Problem
```typescript
// Test fails with: Cannot read properties of undefined (reading 'invoke')
await page.goto('/')
// Test tries to use window.electron which doesn't exist
```

#### Solution
Mock Electron API before navigation:
```typescript
import { mockElectronAPI } from './fixtures/electron-mock'

test.beforeEach(async ({ page }) => {
  // Mock MUST come before navigation
  await mockElectronAPI(page)
  await page.goto('/')
})
```

#### Why It Works
- Browser context doesn't have Electron APIs
- Mock must be injected before page loads
- Page initialization code expects window.electron to exist

### 3. Mobile Viewport Test Complexity

#### Problem
```typescript
// Mobile tests require complex setup
if (viewport.width < 768) {
  // Click hamburger menu
  const hamburger = page.locator('.arco-icon-menu-fold')
  await hamburger.click()
  await page.waitForTimeout(300)
}
// Then navigate to actual feature
```

#### Solution
Skip mobile tests when maintenance cost exceeds value:
```typescript
test('feature test', async ({ page }, testInfo) => {
  // Skip mobile viewports entirely
  if (testInfo.project.name === 'Mobile Small' || 
      testInfo.project.name === 'Mobile Large') {
    test.skip()
    return
  }
  
  // Desktop test logic only
  await page.click('text=Menu Item')
  // ...
})
```

#### Why It Works
- Desktop-first apps may not justify mobile E2E test maintenance
- Unit tests can cover responsive logic
- Visual regression tests better for responsive design

## Arco Design Component Patterns

### Radio Buttons
Arco radio buttons have complex internal structure:

```typescript
// ❌ Doesn't work - too specific
await page.click('.arco-radio-button:has-text("Grid")')

// ✅ Works - filter approach
const gridButton = page.locator('.arco-radio-button')
  .filter({ hasText: 'Grid' })
await gridButton.click()

// ✅ Also works - filter by icon
const scatterButton = page.locator('.arco-radio-button')
  .filter({ has: page.locator('.arco-icon-drag-dot') })
await scatterButton.click()
```

### Sliders
Slider values are stored on the button/handle, not the slider:

```typescript
// ❌ Wrong element
const slider = page.locator('.arco-slider')
const value = await slider.getAttribute('aria-valuenow') // null

// ✅ Correct element
const sliderButton = page.locator('.arco-slider-button').first()
const value = await sliderButton.getAttribute('aria-valuenow') // "50"
```

### Modals
Arco modals render outside the main app container:

```typescript
// Wait for modal wrapper
await page.waitForSelector('.arco-modal-wrapper')

// Content is inside modal-content
const modalContent = page.locator('.arco-modal-content')
await expect(modalContent.locator('text="Title"')).toBeVisible()
```

## Debugging Strategies

### 1. Use Line Reporter
```bash
# ❌ HTML server can hang
npx playwright test --reporter=html

# ✅ Line reporter for debugging
npx playwright test --reporter=line

# ✅ With specific test
npx playwright test responsive.spec.ts --reporter=line --grep="SwimLane"
```

### 2. Get Actual HTML from Page
When selectors fail, inspect the actual DOM:

```typescript
// Debug helper to print HTML
const html = await page.locator('.container').innerHTML()
console.log(html)

// Or use page.pause() to inspect in browser
await page.pause()
```

### 3. Fix Tests One by One
Don't try to fix all tests at once:

```bash
# Run single test
npx playwright test -g "should display EisenhowerMatrix"

# Fix it completely
# Then move to next test
npx playwright test -g "should switch between views"
```

### 4. Check Existing Patterns
Before writing new selectors, check working tests:

```bash
# Find similar working tests
grep -r "arco-radio" e2e/*.spec.ts

# See how they handle the component
cat e2e/working-test.spec.ts
```

## Test Organization Patterns

### Viewport-Specific Tests
```typescript
test.describe('Desktop Tests', () => {
  test.use({ viewport: { width: 1366, height: 768 } })
  
  test('desktop-specific feature', async ({ page }) => {
    // Desktop-only test logic
  })
})

test.describe('Mobile Tests', () => {
  test.use({ viewport: { width: 375, height: 667 } })
  
  test.skip('skipped on mobile', async () => {
    // This won't run
  })
})
```

### Shared Setup
```typescript
// fixtures/test-helpers.ts
export async function setupTest(page: Page) {
  await mockElectronAPI(page)
  await page.goto('/')
  await page.waitForSelector('.app-loaded')
}

// In tests
import { setupTest } from './fixtures/test-helpers'

test.beforeEach(async ({ page }) => {
  await setupTest(page)
})
```

## Performance Considerations

### Wait Strategies
```typescript
// ❌ Fixed waits are brittle
await page.waitForTimeout(1000)

// ✅ Wait for specific conditions
await page.waitForSelector('.loaded')
await page.waitForLoadState('networkidle')
await page.waitForFunction(() => document.readyState === 'complete')
```

### Parallel Execution
```typescript
// playwright.config.ts
export default {
  workers: 4, // Run tests in parallel
  fullyParallel: true,
  
  projects: [
    { name: 'Desktop', use: { ...devices['Desktop Chrome'] } },
    // Don't include mobile if not testing
  ]
}
```

## Common Pitfalls to Avoid

### 1. Over-Specific Selectors
- Don't rely on DOM structure
- Don't use generated class names
- Don't chain too many selectors

### 2. Race Conditions
- Always wait for elements before interacting
- Use proper wait conditions, not timeouts
- Account for animations and transitions

### 3. Test Interdependence
- Each test should be independent
- Don't rely on test execution order
- Clean up state in afterEach if needed

### 4. Ignoring Warnings
- "Target closed" means navigation happened unexpectedly
- "Element not visible" might mean wrong selector
- Check console for application errors

## Maintenance Tips

### 1. Add data-testid Attributes
```typescript
// In component
<button data-testid="submit-button">Submit</button>

// In test
await page.click('[data-testid="submit-button"]')
```

### 2. Create Page Object Models
```typescript
class EisenhowerPage {
  constructor(private page: Page) {}
  
  async switchToScatter() {
    await this.page.locator('.arco-radio-button')
      .filter({ hasText: 'Scatter' })
      .click()
  }
  
  async getQuadrantText() {
    return this.page.locator('text="Do First"').textContent()
  }
}
```

### 3. Regular Test Audits
- Remove obsolete tests
- Update selectors proactively
- Consolidate similar tests
- Keep test/code ratio reasonable

## Decision Matrix

| Scenario | Approach |
|----------|----------|
| Simple UI test | Use text selectors |
| Complex component | Check existing patterns |
| Mobile-specific | Consider skipping |
| Flaky test | Add better waits |
| Slow test | Check for unnecessary waits |
| Many similar tests | Create shared helpers |

## Conclusion

E2E tests provide valuable confidence but require maintenance. Follow these patterns to minimize brittleness and maximize value. When in doubt:

1. Keep selectors simple
2. Mock external dependencies
3. Skip tests that don't provide value
4. Fix tests incrementally
5. Learn from existing patterns

Remember: The goal is confidence in the application, not 100% E2E coverage. Use the right tool for each testing need - unit tests for logic, E2E for critical paths, visual regression for UI.