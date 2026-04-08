# Tool Proposal: [tool_name]

**Date**: YYYY-MM-DD  
**Blocking task**: [what you were trying to do]  
**Status**: Proposed / Implemented / Rejected

## Purpose

[What this tool does and when you'd use it]

## Input schema

```json
{
  "param_name": {
    "type": "string",
    "description": "..."
  }
}
```

## Output format

```json
{
  "result": "..."
}
```

## Annotations

- `readOnlyHint`: true/false
- `destructiveHint`: true/false
- `idempotentHint`: true/false

## Implementation notes

[Key logic, dependencies, where it fits in the MCP server architecture]

## Why not an existing tool?

[Which existing tools you checked and why they don't cover this]