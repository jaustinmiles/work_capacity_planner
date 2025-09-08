import { test, expect } from '@playwright/test'
import { mockElectronAPI } from './fixtures/electron-mock'

test('diagonal scan displays fake tasks', async ({ page }, testInfo) => {
  // Skip mobile viewports as the UI differs significantly
  if (testInfo.project.name === 'Mobile Small' || testInfo.project.name === 'Mobile Large') {
    test.skip()
    return
  }
  // Setup - MUST mock API before navigation
  await mockElectronAPI(page)
  await page.goto('/')

  // Wait for app to load and verify no Electron API error
  await page.waitForSelector('.arco-layout', { timeout: 10000 })

  // Ensure the Electron API error is not present
  const errorMessage = page.locator('text=Electron API not available')
  await expect(errorMessage).not.toBeVisible({ timeout: 5000 })

  // Click on Eisenhower Matrix in sidebar
  await page.click('[data-testid="nav-matrix"]')

  // Wait for matrix to load
  await page.waitForSelector('.arco-radio-group', { timeout: 5000 })

  // Switch to scatter view
  await page.getByText('Scatter').click()

  // Start the scan
  await page.click('button:has-text("Scan")')

  // Wait for scan to complete (4 seconds)
  await page.waitForTimeout(4500)

  // Verify that tasks were detected and displayed
  const scannedTasksCard = page.locator('text=/Scanned Tasks \\(\\d+\\)/')
  await expect(scannedTasksCard).toBeVisible({ timeout: 1000 })

  // Get the number of scanned tasks from the card text
  const cardText = await scannedTasksCard.textContent()
  const match = cardText?.match(/Scanned Tasks \((\d+)\)/)
  const taskCount = match ? parseInt(match[1]) : 0

  // Verify at least 2 tasks were scanned (Test Task 1 and Test Task 2)
  expect(taskCount).toBeGreaterThanOrEqual(2)
})
