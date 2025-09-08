#!/usr/bin/env node

/**
 * Cross-platform Git hooks setup script
 * Replaces the shell script for Windows compatibility
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Check if we're in a git repository
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore' })
} catch {
  console.log('Not in a git repository, skipping hooks setup')
  process.exit(0)
}

// Check if in CI environment
if (process.env.CI) {
  console.log('CI environment detected, skipping hooks setup')
  process.exit(0)
}

const hookContent = `#!/bin/sh
# Auto-generated git hook

# Run typecheck and lint before commit
echo "Running pre-commit checks..."

# Run typecheck
echo "Running typecheck..."
npm run typecheck
if [ $? -ne 0 ]; then
  echo "❌ TypeScript errors found. Please fix them before committing."
  exit 1
fi

# Run lint
echo "Running lint..."
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Linting errors found. Please fix them before committing."
  exit 1
fi

echo "✅ All pre-commit checks passed!"
`

try {
  const gitDir = execSync('git rev-parse --git-dir', { encoding: 'utf8' }).trim()
  const hooksDir = path.join(gitDir, 'hooks')
  const preCommitPath = path.join(hooksDir, 'pre-commit')

  // Create hooks directory if it doesn't exist
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true })
  }

  // Write the pre-commit hook
  fs.writeFileSync(preCommitPath, hookContent)

  // Make executable on Unix-like systems
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(preCommitPath, '755')
    } catch (error) {
      console.warn('Could not set execute permission on pre-commit hook:', error.message)
    }
  }

  console.log('✅ Git hooks setup successfully')
} catch (error) {
  console.error('Failed to setup git hooks:', error.message)
  process.exit(1)
}
