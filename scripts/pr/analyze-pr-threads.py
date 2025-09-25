#!/usr/bin/env python3
"""
Analyze GitHub PR review threads to show conversation structure

First, fetch the PR data using GitHub's GraphQL API:

gh api graphql -f query='
query {
  repository(owner: "jaustinmiles", name: "work_capacity_planner") {
    pullRequest(number: 76) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isCollapsed
          isOutdated
          comments(first: 20) {
            nodes {
              author {
                login
              }
              body
            }
          }
        }
      }
    }
  }
}' > /tmp/pr-threads.json

Then run this script:
python3 scripts/pr/analyze-pr-threads.py

Replace owner, repo name, and PR number as needed.
"""

import json
import sys
from pathlib import Path

# Default to /tmp/pr-threads.json but allow override
data_file = sys.argv[1] if len(sys.argv) > 1 else '/tmp/pr-threads.json'

if not Path(data_file).exists():
    print(f"Error: {data_file} not found. Run the GraphQL query first (see script header)")
    sys.exit(1)

with open(data_file) as f:
    data = json.load(f)

threads = data['data']['repository']['pullRequest']['reviewThreads']['nodes']

# Separate resolved and unresolved
resolved = [t for t in threads if t['isResolved']]
unresolved = [t for t in threads if not t['isResolved']]

print("═══════════════════════════════════════════")
print("PR REVIEW THREAD ANALYSIS")
print("═══════════════════════════════════════════")
print(f"Total threads: {len(threads)}")
print(f"Resolved: {len(resolved)}")
print(f"Unresolved: {len(unresolved)}")

# Show resolved threads grouped (simulating GitHub's review grouping)
if resolved:
    print("\n═══════════════════════════════════════════")
    print("RESOLVED CONVERSATIONS (collapsed on GitHub)")
    print("═══════════════════════════════════════════")

    for i, thread in enumerate(resolved, 1):
        if thread['comments']['nodes']:
            first = thread['comments']['nodes'][0]
            preview = first['body'][:100].replace('\n', ' ')
            print(f"{i}. {first['author']['login']}: \"{preview}...\"")

# Show unresolved threads with full conversation structure
if unresolved:
    print("\n═══════════════════════════════════════════")
    print("UNRESOLVED CONVERSATIONS (visible on GitHub)")
    print("═══════════════════════════════════════════")

    bot_names = ['wcp-claude-dev-buddy[bot]', 'Claude Code[bot]']
    threads_with_bot = 0
    threads_without_bot = 0

    for i, thread in enumerate(unresolved, 1):
        has_bot = False
        print(f"\n{i}. ", end="")

        for j, comment in enumerate(thread['comments']['nodes']):
            author = comment['author']['login']
            preview = comment['body'][:80].replace('\n', ' ')

            if author in bot_names:
                has_bot = True

            if j == 0:
                print(f"{author}: \"{preview}...\"")
            else:
                print(f"   └─ {author}: \"{preview}...\"")

        if has_bot:
            threads_with_bot += 1
        else:
            threads_without_bot += 1

    print(f"\n═══════════════════════════════════════════")
    print(f"SUMMARY OF UNRESOLVED THREADS")
    print(f"═══════════════════════════════════════════")
    print(f"With bot replies: {threads_with_bot}")
    print(f"Without bot replies (need attention): {threads_without_bot}")