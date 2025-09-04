import { test, expect } from '@playwright/test'
import { mockElectronAPI } from './fixtures/electron-mock'

test.describe('Sidebar Collapse Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Electron API before navigating
    await mockElectronAPI(page)
    await page.goto('/')
    // Wait for app to load
    await page.waitForSelector('.arco-layout-sider', { timeout: 10000 })
  })

  test('Should have collapse button visible in top-left', async ({ page }) => {
    // Look for the collapse button with menu fold/unfold icon
    const collapseButton = page.locator('button').filter({
      has: page.locator('.arco-icon-menu-fold, .arco-icon-menu-unfold'),
    }).first()

    await expect(collapseButton).toBeVisible()

    // Check it's in the top area of the sidebar
    const buttonBox = await collapseButton.boundingBox()
    expect(buttonBox).toBeTruthy()
    if (buttonBox) {
      expect(buttonBox.y).toBeLessThan(100) // Should be near the top
      expect(buttonBox.x).toBeLessThan(100) // Should be on the left
    }
  })

  test('Should toggle sidebar collapsed state', async ({ page }) => {
    const sidebar = page.locator('.arco-layout-sider').first()
    const collapseButton = page.locator('button').filter({
      has: page.locator('.arco-icon-menu-fold, .arco-icon-menu-unfold'),
    }).first()

    // Check initial state - should be expanded (240px)
    const initialWidth = await sidebar.evaluate(el => el.offsetWidth)
    expect(initialWidth).toBeGreaterThan(200)

    // Click collapse button
    await collapseButton.click()
    await page.waitForTimeout(300) // Wait for animation

    // Check collapsed state (80px)
    const collapsedWidth = await sidebar.evaluate(el => el.offsetWidth)
    expect(collapsedWidth).toBeLessThan(100)
    expect(collapsedWidth).toBeGreaterThan(60)

    // Click again to expand
    await collapseButton.click()
    await page.waitForTimeout(300)

    // Check expanded again
    const expandedWidth = await sidebar.evaluate(el => el.offsetWidth)
    expect(expandedWidth).toBeGreaterThan(200)
  })

  test('Should NOT have horizontal scrollbar when collapsed', async ({ page }) => {
    const sidebar = page.locator('.arco-layout-sider').first()
    const collapseButton = page.locator('button').filter({
      has: page.locator('.arco-icon-menu-fold, .arco-icon-menu-unfold'),
    }).first()

    // Collapse the sidebar
    await collapseButton.click()
    await page.waitForTimeout(300) // Wait for animation

    // Check for horizontal overflow on sidebar
    const hasHorizontalOverflow = await sidebar.evaluate(el => {
      return el.scrollWidth > el.clientWidth
    })
    expect(hasHorizontalOverflow).toBe(false)

    // Also check computed styles
    const overflowX = await sidebar.evaluate(el => {
      return window.getComputedStyle(el).overflowX
    })
    expect(overflowX).toBe('hidden')

    // Check that no child elements are causing overflow
    const childrenOverflowing = await sidebar.evaluate(el => {
      const children = el.querySelectorAll('*')
      for (const child of children) {
        if (child.scrollWidth > el.clientWidth) {
          return true
        }
      }
      return false
    })
    expect(childrenOverflowing).toBe(false)
  })

  test('Should persist collapsed state in localStorage', async ({ page }) => {
    const collapseButton = page.locator('button').filter({
      has: page.locator('.arco-icon-menu-fold, .arco-icon-menu-unfold'),
    }).first()

    // Collapse sidebar
    await collapseButton.click()
    await page.waitForTimeout(300)

    // Check localStorage
    const collapsedState = await page.evaluate(() => {
      return window.localStorage.getItem('sidebarCollapsed')
    })
    expect(collapsedState).toBe('true')

    // Reload page
    await page.reload()
    await page.waitForSelector('.arco-layout-sider', { timeout: 10000 })

    // Check sidebar is still collapsed
    const sidebar = page.locator('.arco-layout-sider').first()
    const width = await sidebar.evaluate(el => el.offsetWidth)
    expect(width).toBeLessThan(100)
  })

  test('Should hide text labels when collapsed', async ({ page }) => {
    const collapseButton = page.locator('button').filter({
      has: page.locator('.arco-icon-menu-fold, .arco-icon-menu-unfold'),
    }).first()

    // Initially should show text
    await expect(page.locator('span:has-text("Task List")')).toBeVisible()
    await expect(page.locator('span:has-text("Eisenhower Matrix")')).toBeVisible()

    // Collapse sidebar
    await collapseButton.click()
    await page.waitForTimeout(300)

    // Text should be hidden
    await expect(page.locator('span:has-text("Task List")')).not.toBeVisible()
    await expect(page.locator('span:has-text("Eisenhower Matrix")')).not.toBeVisible()

    // Icons should still be visible
    await expect(page.locator('.arco-icon-list')).toBeVisible()
    await expect(page.locator('.arco-icon-apps')).toBeVisible()
  })

  test('Tooltips should show on hover when collapsed', async ({ page }) => {
    const collapseButton = page.locator('button').filter({
      has: page.locator('.arco-icon-menu-fold, .arco-icon-menu-unfold'),
    }).first()

    // Collapse sidebar
    await collapseButton.click()
    await page.waitForTimeout(300)

    // Hover over Task List menu item
    const taskMenuItem = page.locator('.arco-menu-item').filter({
      has: page.locator('.arco-icon-list'),
    }).first()

    await taskMenuItem.hover()
    await page.waitForTimeout(500) // Wait for tooltip

    // Check tooltip is visible
    const tooltip = page.locator('.arco-tooltip:has-text("Task List")')
    await expect(tooltip).toBeVisible()
  })

  test('Add Task button should not overlap with collapse trigger', async ({ page }) => {
    // Since we removed the default trigger, the Add Task button should be fully clickable
    const addTaskButton = page.locator('button:has-text("Add Task"), button:has(.arco-icon-plus)')
      .filter({ hasText: /Add Task/ })
      .first()

    // Check button is visible and clickable
    await expect(addTaskButton).toBeVisible()

    const buttonBox = await addTaskButton.boundingBox()
    if (buttonBox) {
      // The entire button area should be clickable
      // Click near the bottom of the button (where default trigger would have been)
      await page.mouse.click(
        buttonBox.x + buttonBox.width / 2,
        buttonBox.y + buttonBox.height - 5,
      )

      // Check that dropdown opened (no error thrown means click worked)
      await expect(page.locator('text="New Task"')).toBeVisible({ timeout: 1000 })
    }
  })
})
