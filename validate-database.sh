#!/bin/bash

echo "======================================"
echo "DATABASE VALIDATION CHECK"
echo "======================================"
echo ""

# Check if prisma/dev.db exists
if [ ! -f "prisma/dev.db" ]; then
    echo "❌ ERROR: prisma/dev.db not found!"
    exit 1
fi

# Check for wrong database
if [ -f "dev.db" ]; then
    echo "⚠️  WARNING: Root dev.db exists! This should be deleted!"
    echo "   This is the WRONG database that only has 4 tasks!"
    echo "   Run: rm dev.db"
    echo ""
fi

# Count data in the correct database
echo "Checking prisma/dev.db contents..."
TASKS=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Task" 2>/dev/null || echo "0")
WORKFLOWS=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM SequencedTask" 2>/dev/null || echo "0")
PATTERNS=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM WorkPattern" 2>/dev/null || echo "0")
CONTEXTS=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM JobContext" 2>/dev/null || echo "0")

echo ""
echo "Current Database Contents:"
echo "  Tasks: $TASKS"
echo "  Workflows: $WORKFLOWS"
echo "  Work Patterns: $PATTERNS"
echo "  Job Contexts: $CONTEXTS"
echo ""

# Validate expected counts
if [ "$TASKS" -eq "4" ]; then
    echo "❌ ERROR: Only 4 tasks found! This is the WRONG database!"
    echo "   Expected: 21 tasks"
    echo "   Action: Restore from backups/verified/complete-data-21-tasks-5-workflows.db"
    exit 1
elif [ "$TASKS" -lt "21" ]; then
    echo "⚠️  WARNING: Only $TASKS tasks found (expected 21)"
fi

if [ "$TASKS" -ge "21" ] && [ "$WORKFLOWS" -ge "5" ] && [ "$PATTERNS" -ge "6" ]; then
    echo "✅ Database validation PASSED!"
    echo "   All expected data is present."
else
    echo "⚠️  Database may be incomplete"
    echo "   Expected: 21+ tasks, 5+ workflows, 6+ patterns, 2+ contexts"
fi

echo ""
echo "======================================"