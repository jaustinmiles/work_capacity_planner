#!/bin/bash

# QUICK VERIFICATION SCRIPT
# Fast checks for the most common false completion claims from PR #67
# Usage: ./scripts/verification/quick-verify.sh

echo "⚡ Quick Verification of Common False Claims"
echo "===========================================" 

# Console.log check
console_count=$(grep -r "console\.log" src/ --exclude-dir=__tests__ 2>/dev/null | wc -l)
echo "Console.log statements in src/: $console_count"
if [ "$console_count" -gt 0 ]; then
    echo "❌ CLAIM 'all console.log replaced' is FALSE"
else
    echo "✅ Console.log replacement appears complete"
fi

# Scheduler count check  
scheduler_count=$(find src/ -name "*scheduler*.ts" ! -path "*/test*" ! -name "*.test.ts" 2>/dev/null | wc -l)
echo "Scheduler implementation files: $scheduler_count"
if [ "$scheduler_count" -gt 1 ]; then
    echo "❌ CLAIM 'schedulers unified' is FALSE - $scheduler_count separate files exist"
    find src/ -name "*scheduler*.ts" ! -path "*/test*" ! -name "*.test.ts" 2>/dev/null | sed 's/^/   /'
else
    echo "✅ Scheduler unification appears complete"
fi

# Work session type check
worksession_count=$(grep -r "interface.*WorkSession" src/ 2>/dev/null | wc -l)
echo "WorkSession interface definitions: $worksession_count" 
if [ "$worksession_count" -gt 1 ]; then
    echo "❌ CLAIM 'work sessions consolidated' is FALSE - $worksession_count interfaces exist"
else
    echo "✅ Work session consolidation appears complete"
fi

# Skipped tests check (excluding strategic mobile skips)
skipped_count=$(grep -r "\.skip\|test\.skip\|describe\.skip" src/ 2>/dev/null | grep -v "Mobile" | grep -v "NLP pattern" | wc -l)
echo "Non-strategic skipped tests: $skipped_count"
if [ "$skipped_count" -gt 5 ]; then
    echo "❌ Too many tests skipped - may indicate incomplete work"
else
    echo "✅ Test skip count appears reasonable"
fi

echo
echo "🎯 Quick verification complete. Run full verification with:"
echo "   ./scripts/verification/verify-completion-claims.sh"