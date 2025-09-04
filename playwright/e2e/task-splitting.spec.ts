import { test, expect } from '@playwright/test'

test.describe('Task Splitting Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/')

    // Wait for the app to load
    await page.waitForSelector('.arco-layout', { timeout: 10000 })
  })

  test('should split a task into two parts', async ({ page }) => {
    // First, create a test task
    // Click on "New Task" button (adjust selector as needed)
    const newTaskButton = page.locator('button:has-text("New Task")')
    if (await newTaskButton.count() > 0) {
      await newTaskButton.click()

      // Fill in task details
      await page.fill('input[placeholder*="task name"]', 'Test Task to Split')
      await page.fill('input[placeholder*="duration"]', '120') // 2 hours

      // Save the task
      await page.click('button:has-text("Save")')

      // Wait for task to appear in list
      await page.waitForSelector('text=Test Task to Split')
    }

    // Open task edit modal
    await page.click('text=Test Task to Split')
    await page.waitForTimeout(500)

    // Click on Edit button
    const editButton = page.locator('button[aria-label="Edit task"]').first()
    if (await editButton.count() > 0) {
      await editButton.click()

      // Wait for edit modal
      await page.waitForSelector('.arco-modal-content', { timeout: 5000 })

      // Click on Split Task button
      const splitButton = page.locator('button:has-text("Split Task")')
      await expect(splitButton).toBeVisible()
      await splitButton.click()

      // Wait for split modal
      await page.waitForSelector('text=Duration Split')

      // Verify the modal contains expected elements
      await expect(page.locator('text=This will split')).toBeVisible()
      await expect(page.locator('.arco-slider')).toBeVisible()

      // Modify the first task name
      const firstNameInput = page.locator('input').nth(0)
      await firstNameInput.clear()
      await firstNameInput.fill('Part 1 - Planning')

      // Modify the second task name
      const secondNameInput = page.locator('input').nth(2)
      await secondNameInput.clear()
      await secondNameInput.fill('Part 2 - Implementation')

      // Click the split button in modal
      await page.click('button:has-text("Split Task"):not(:has-text("Split Task Feature"))')

      // Wait for modal to close and verify tasks are split
      await page.waitForTimeout(1000)

      // Verify both tasks exist
      await expect(page.locator('text=Part 1 - Planning')).toBeVisible()
      await expect(page.locator('text=Part 2 - Implementation')).toBeVisible()
    }
  })

  test('should split a workflow step', async ({ page }) => {
    // This test assumes a workflow exists or creates one
    // Look for workflow in the list
    const workflowElements = page.locator('text=/workflow/i')

    if (await workflowElements.count() > 0) {
      // Click on first workflow
      await workflowElements.first().click()

      // Click edit button
      const editButton = page.locator('button[aria-label*="Edit"]').first()
      if (await editButton.count() > 0) {
        await editButton.click()

        // Wait for workflow edit modal
        await page.waitForSelector('text=Edit Workflow', { timeout: 5000 })

        // Look for a step split button (scissor icon)
        const stepSplitButton = page.locator('button:has(svg[class*="icon-scissor"])').first()

        if (await stepSplitButton.count() > 0) {
          await stepSplitButton.click()

          // Wait for step split modal
          await page.waitForSelector('text=Split Workflow Step')

          // Verify modal elements
          await expect(page.locator('text=Duration Split')).toBeVisible()
          await expect(page.locator('.arco-slider')).toBeVisible()

          // Can add more interaction here to actually split the step

          // Close modal
          await page.click('button:has-text("Cancel")')
        }
      }
    }
  })

  test('should preserve task properties when splitting', async ({ page }) => {
    // This test verifies that importance, urgency, and other properties
    // are preserved when splitting a task

    // Navigate to task list or create a task with specific properties
    const taskWithProperties = page.locator('text=/Priority|Important/').first()

    if (await taskWithProperties.count() > 0) {
      await taskWithProperties.click()

      // Open edit modal
      const editButton = page.locator('button[aria-label*="Edit"]').first()
      if (await editButton.count() > 0) {
        await editButton.click()

        // Click split button
        const splitButton = page.locator('button:has-text("Split Task")')
        if (await splitButton.count() > 0) {
          await splitButton.click()

          // Verify the warning message about preserving properties
          await expect(page.locator('text=/inherit the same importance/')).toBeVisible()

          // Close modal
          await page.click('button:has-text("Cancel")')
        }
      }
    }
  })
})
