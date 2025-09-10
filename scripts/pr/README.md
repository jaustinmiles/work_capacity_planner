# PR Scripts

Scripts for managing pull requests and their CI/CD results.

## 🚨 MANDATORY USAGE

**⚠️ CRITICAL: These scripts MUST be used for all PR review interactions after the PR #67 disaster.**

### Required Workflow:
1. **ALWAYS** use `pr-review-tracker.ts` FIRST to see all unresolved comments
2. **ALWAYS** use `pr-comment-reply.ts` for ALL review replies  
3. **NEVER** use `gh api` directly for PR comment operations
4. **VERIFY** each fix before posting reply

### Why This Is Mandatory:
- **PR #67 Disaster**: Manual gh api usage led to missed comments and false claims
- **Verification Requirements**: Scripts enforce proper verification workflow
- **User Expectations**: User expects consistent script usage, not manual commands

### Troubleshooting:
If scripts fail:
1. Check `gh auth status` - ensure you're authenticated as Claude Code[bot]
2. Run `./context/setup-claude-bot.sh` to fix authentication
3. Check PR number is correct and exists
4. Ask user for help rather than falling back to manual commands

## pr-review-tracker.ts

Track and manage PR review comments:
```bash
npx tsx scripts/pr/pr-review-tracker.ts [pr-number] [options]
```

Options:
- `--show-resolved` - Include resolved comments
- `--all` - Show all comments including resolved and collapsed
- `--no-reviews` - Hide review summaries (only show inline comments)
- `--verbose` - Show full review bodies without truncation

Features:
- Automatically hides resolved and collapsed comments
- Filters out hidden/minimized reviews (e.g., long CI logs)
- Truncates long review bodies for readability
- Shows statistics on comment status
- Tracks which comments still need addressing

## pr-comment-reply.ts

Reply to PR comments programmatically:
```bash
# Reply to single comment
npx tsx scripts/pr/pr-comment-reply.ts <pr-number> <comment-id> "Your reply"

# Reply to multiple comments  
npx tsx scripts/pr/pr-comment-reply.ts <pr-number> batch
```

## pr-playwright-report.ts

Download and view Playwright test reports from CI:
```bash
# Download and open report from PR
npx tsx scripts/pr/pr-playwright-report.ts 55

# Download and open report from specific run
npx tsx scripts/pr/pr-playwright-report.ts 17459914563

# Just open previously downloaded report
npx tsx scripts/pr/pr-playwright-report.ts 55 --open-only
```

Features:
- Downloads Playwright HTML report artifact from GitHub Actions
- Opens interactive report in browser
- Shows test results, screenshots, and error traces
- Automatically finds latest CI run for a PR

## Installation

These scripts require:
- GitHub CLI (`gh`) installed and authenticated
- Node.js and npm
- Repository access with appropriate permissions

## Notes

- Downloaded Playwright reports are stored in `/playwright-report-from-ci` (gitignored)
- Use Ctrl+C to stop the Playwright report server
- Reports include screenshots of failed tests for debugging