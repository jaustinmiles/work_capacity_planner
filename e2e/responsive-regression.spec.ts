import { test, expect } from '@playwright/test'

/**
 * Responsive Design Regression Tests
 * Prevents character-breaking text and grid catastrophes
 * Tests critical development screen sizes: 430px, 768px, 960px, 1024px, 1366px
 */

const CRITICAL_WIDTHS = [
  { width: 430, name: 'Mobile' },
  { width: 768, name: 'Tablet' },
  { width: 960, name: 'Split-screen Dev' },
  { width: 1024, name: 'Small Desktop' },
  { width: 1366, name: 'Standard Desktop' },
]

test.describe('Responsive Design Regression Prevention', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for app to load
    await page.waitForSelector('[data-testid="task-list"], .arco-empty', { timeout: 10000 })
  })

  CRITICAL_WIDTHS.forEach(({ width, name }) => {
    test(`Task Management grid usable at ${width}px (${name})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })

      // Navigate to Task Management
      await page.click('[data-testid="nav-tasks"]')
      await page.waitForSelector('.arco-table, .arco-card', { timeout: 5000 })

      if (width <= 768) {
        // Should use card layout
        await expect(page.locator('.arco-card')).toBeVisible()
        // Task names should be visible and not character-broken
        const taskCards = page.locator('.arco-card .arco-typography')
        const firstCard = taskCards.first()
        if (await firstCard.count() > 0) {
          const text = await firstCard.textContent()
          // Text should not be single characters
          expect(text?.length).toBeGreaterThan(3)
        }
      } else {
        // Should use table layout
        await expect(page.locator('.arco-table')).toBeVisible()
        // All columns should be visible
        await expect(page.locator('.arco-table th')).toHaveCount.greaterThan(5)
      }
    })

    test(`No character-breaking text at ${width}px (${name})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })

      // Check various views for text breaking
      const views = ['tasks', 'workflows', 'matrix']

      for (const view of views) {
        await page.click(`[data-testid="nav-${view}"]`)
        await page.waitForTimeout(500) // Allow view to render

        // Check for single-character text elements (indicates breaking)
        const singleChars = page.locator('h1, h2, h3, h4, h5, .arco-typography-title').filter({
          hasText: /^[A-Za-z]$/,  // Single letter
        })

        const count = await singleChars.count()
        expect(count, `Single character text found in ${view} view at ${width}px`).toBe(0)
      }
    })

    test(`Eisenhower Matrix title displays properly at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })

      await page.click('[data-testid="nav-matrix"]')
      await page.waitForSelector('h5', { timeout: 5000 })

      // Title should not be character-broken
      const title = page.locator('h5').filter({ hasText: /Eisenhower|Matrix|Priority/ }).first()
      const titleText = await title.textContent()

      // Should contain meaningful words, not single characters
      expect(titleText?.includes('Priority') || titleText?.includes('Matrix')).toBe(true)
      // Should not be just single letters
      expect(titleText?.length).toBeGreaterThan(5)
    })
  })

  test('Sidebar text does not fragment at narrow widths', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 })

    // Check sidebar text elements
    const sidebarTexts = [
      'Total Time',
      'Currently in Work Block',
      'Focus Time',
      'Admin Time',
    ]

    for (const textPattern of sidebarTexts) {
      const element = page.locator('text').filter({ hasText: new RegExp(textPattern.split(' ')[0]) }).first()

      if (await element.count() > 0) {
        const fullText = await element.textContent()
        // Text should not be broken into individual characters
        expect(fullText?.length).toBeGreaterThan(2)
      }
    }
  })

  test('Quick Edit modal usable at all screen sizes', async ({ page }) => {
    // Test Quick Edit modal responsiveness
    for (const { width } of CRITICAL_WIDTHS) {
      await page.setViewportSize({ width, height: 800 })

      // Try to open Quick Edit (if tasks exist)
      const quickEditButton = page.locator('button').filter({ hasText: 'Quick Edit' }).first()
      if (await quickEditButton.count() > 0) {
        await quickEditButton.click()

        // Modal should be visible and not overflow
        await expect(page.locator('.arco-modal')).toBeVisible()

        // Duration presets should be clickable
        await expect(page.locator('text=5m')).toBeVisible()
        await expect(page.locator('text=10m')).toBeVisible()

        // Close modal
        await page.keyboard.press('Escape')
      }
    }
  })
})
