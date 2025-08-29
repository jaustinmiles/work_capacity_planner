#!/bin/bash

# Script to set up git hooks for the project
# This ensures all developers have the same quality checks

echo "Setting up git hooks..."

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Create pre-push hook
cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh

# Pre-push hook to prevent pushing code with quality issues
# Runs: ESLint, TypeScript check, and Tests

echo "🔍 Running pre-push quality checks..."
echo "================================="

# Run ESLint
echo ""
echo "1️⃣  ESLint Check"
echo "-----------------"
npm run lint 2>&1

LINT_EXIT_CODE=$?

if [ $LINT_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ ESLint check failed! Push blocked."
    echo ""
    echo "To fix automatically fixable issues:"
    echo "  npm run lint:fix"
    echo ""
    echo "To see all issues:"
    echo "  npm run lint"
    echo ""
    exit 1
fi

echo "✅ ESLint check passed!"

# Run TypeScript check
echo ""
echo "2️⃣  TypeScript Check"
echo "--------------------"
npm run typecheck 2>&1

TS_EXIT_CODE=$?

if [ $TS_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ TypeScript check failed! Push blocked."
    echo ""
    echo "To see all issues:"
    echo "  npm run typecheck"
    echo ""
    exit 1
fi

echo "✅ TypeScript check passed!"

# Run tests
echo ""
echo "3️⃣  Test Suite"
echo "--------------"
npm test -- --run 2>&1

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ Tests failed! Push blocked."
    echo ""
    echo "To run tests:"
    echo "  npm test -- --run"
    echo ""
    echo "To run tests with UI:"
    echo "  npm run test:ui"
    echo ""
    exit 1
fi

echo "✅ All tests passed!"

echo ""
echo "================================="
echo "✅ All quality checks passed! Proceeding with push..."
echo ""

exit 0
EOF

# Make the hook executable
chmod +x .git/hooks/pre-push

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-push hook will now run automatically before each push and will:"
echo "  • Check for ESLint errors"
echo "  • Check for TypeScript errors"
echo "  • Run all tests"
echo ""
echo "If any check fails, the push will be blocked."