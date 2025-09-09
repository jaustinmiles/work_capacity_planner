#!/bin/bash

# VERIFICATION SCRIPT - Completion Claims Checker
# 
# This script was created during PR #67 cleanup to prevent false completion claims.
# It verifies common completion claims that have been falsely made in the past.
#
# Usage: ./scripts/verification/verify-completion-claims.sh

echo "🔍 VERIFICATION SCRIPT - Checking Completion Claims"
echo "Created during PR #67 cleanup to prevent future false claims"
echo "=================================================="

# Function to check and report results
check_claim() {
    local claim="$1"
    local command="$2"
    local expected_count="$3"
    
    echo
    echo "🔎 Checking: $claim"
    echo "Command: $command"
    
    result=$(eval "$command")
    count=$(echo "$result" | wc -l)
    
    if [[ "$count" -eq 0 || (-n "$expected_count" && "$count" -le "$expected_count") ]]; then
        echo "✅ PASS: $claim appears to be true"
        if [[ "$count" -gt 0 ]]; then
            echo "   Found $count instances (within acceptable range)"
        fi
    else
        echo "❌ FAIL: $claim is FALSE"
        echo "   Found $count instances:"
        echo "$result" | head -10
        if [[ "$count" -gt 10 ]]; then
            echo "   ... and $(($count - 10)) more"
        fi
    fi
}

# 1. Check console.log replacement claim
check_claim \
    "All console.log statements replaced in src/" \
    "grep -r 'console\\.log' src/ --exclude-dir=__tests__ || echo 'No matches found'" \
    0

# 2. Check scheduler unification claim  
check_claim \
    "Schedulers have been unified (should find 3 or fewer scheduler files)" \
    "find src/ -name '*scheduler*.ts' ! -path '*/test*' ! -name '*.test.ts' | grep -v __tests__" \
    3

# 3. Check work session consolidation claim
check_claim \
    "Work session types have been unified (should find minimal WorkSession interfaces)" \
    "grep -r 'interface.*WorkSession' src/ || echo 'No matches found'" \
    2

# 4. Check skipped tests claim
check_claim \
    "No tests are inappropriately skipped (ignoring mobile E2E strategic skips)" \
    "grep -r '\\.skip\\|test\\.skip\\|describe\\.skip' src/ | grep -v 'Mobile' | grep -v 'NLP pattern matching not used' || echo 'No matches found'" \
    5

# 5. Check TypeScript errors claim
echo
echo "🔎 Checking: TypeScript compilation has no errors"
echo "Command: npm run typecheck"
if npm run typecheck > /dev/null 2>&1; then
    echo "✅ PASS: TypeScript compilation successful"
else
    echo "❌ FAIL: TypeScript compilation has errors"
    echo "Run 'npm run typecheck' to see details"
fi

# 6. Check ESLint errors claim  
echo
echo "🔎 Checking: ESLint has no errors (warnings are acceptable)"
echo "Command: npm run lint -- --max-warnings=1000"
if npm run lint -- --max-warnings=1000 > /dev/null 2>&1; then
    echo "✅ PASS: ESLint check successful (warnings allowed)"
else
    echo "❌ FAIL: ESLint has errors"
    echo "Run 'npm run lint' to see details"
fi

# 7. Check test pass rate claim
echo
echo "🔎 Checking: All non-skipped tests are passing"
echo "Command: npm test -- --run"
if npm test -- --run > /dev/null 2>&1; then
    echo "✅ PASS: All non-skipped tests are passing"
else
    echo "❌ FAIL: Some tests are failing"
    echo "Run 'npm test -- --run' to see details"
fi

echo
echo "=================================================="
echo "🎯 VERIFICATION COMPLETE"
echo
echo "This script helps prevent false completion claims like those made in PR #67."
echo "Always run verification commands before claiming work is 'complete'."
echo
echo "Before claiming completion, remember to:"
echo "1. Actually run the verification commands shown above"
echo "2. Check that your changes work in production, not just tests"
echo "3. Update documentation to reflect the actual current state"
echo "4. Ask the user to verify if you're uncertain about anything"