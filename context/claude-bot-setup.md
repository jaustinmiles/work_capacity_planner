# Claude Code Bot Authentication Setup

This document explains how to configure Claude Code to create PRs, commits, and comments as the Claude Code[bot] GitHub App rather than as your personal user.

## Problem

By default:
- Git commits can be configured to use bot identity (via git config)
- But `gh` CLI uses your personal authentication
- This causes PRs to appear as created by you, not the bot

## Solution

Use GitHub App authentication for both git and gh CLI operations.

## Prerequisites

1. **GitHub App Created**: "WCP Claude Dev Buddy" (App ID: 1888380)
2. **Private Key**: Store at `~/.claude-code/wcp-claude-dev-buddy.2025-09-02.private-key.pem`
3. **App Installed**: On the repository where you want bot actions
4. **Tools Required**: 
   - `jq` (install with `brew install jq`)
   - `openssl` (usually pre-installed)
   - `gh` CLI (install with `brew install gh`)

## Setup Script

Create `~/.claude-code/scripts/setup-claude-bot.sh`:

```bash
#!/bin/bash

# GitHub App Configuration
APP_ID="1888380"
PRIVATE_KEY_PATH="$HOME/.claude-code/wcp-claude-dev-buddy.2025-09-02.private-key.pem"

# Check prerequisites
if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo "Error: Private key not found at $PRIVATE_KEY_PATH"
    echo "Download from: https://github.com/settings/apps/wcp-claude-dev-buddy/permissions"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Error: jq is required. Install with: brew install jq"
    exit 1
fi

# Generate JWT token for GitHub App authentication
generate_jwt() {
    local now=$(date +%s)
    local iat=$((now - 60))  # Issued 60 seconds ago
    local exp=$((now + 600)) # Expires in 10 minutes
    
    # Create header and payload
    local header=$(echo -n '{"alg":"RS256","typ":"JWT"}' | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n')
    local payload=$(echo -n "{\"iat\":$iat,\"exp\":$exp,\"iss\":\"$APP_ID\"}" | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n')
    
    # Sign and create token
    local signature=$(echo -n "$header.$payload" | openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n')
    
    echo "$header.$payload.$signature"
}

echo "🤖 Setting up Claude Code[bot] authentication..."

# Generate JWT
JWT=$(generate_jwt)

# Get installation ID
echo "📍 Getting installation ID..."
INSTALLATION_ID=$(curl -s -H "Authorization: Bearer $JWT" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/app/installations" | jq '.[0].id')

if [ "$INSTALLATION_ID" = "null" ] || [ -z "$INSTALLATION_ID" ]; then
    echo "❌ Error: Could not get installation ID"
    echo "Make sure the app is installed on your repository"
    exit 1
fi

# Get installation access token
echo "🔑 Getting access token..."
RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $JWT" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/app/installations/$INSTALLATION_ID/access_tokens")

TOKEN=$(echo "$RESPONSE" | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Error: Could not get access token"
    exit 1
fi

# Configure gh CLI
echo "⚙️  Configuring gh CLI..."
echo "$TOKEN" | gh auth login --with-token

# Configure git for bot commits
echo "⚙️  Configuring git..."
git config user.name "Claude Code[bot]"
git config user.email "${APP_ID}+claude-code[bot]@users.noreply.github.com"

echo "✅ Authentication configured successfully!"
echo ""
echo "Now all operations will be performed as Claude Code[bot]:"
echo "  • Git commits will show as bot"
echo "  • PRs created with 'gh pr create' will show as bot"
echo "  • Comments with 'gh pr comment' will show as bot"
echo ""
echo "⚠️  Note: Token expires in ~1 hour. Re-run this script as needed."
```

## Usage

### Initial Setup (Once)

1. Download private key from GitHub App settings
2. Save to `~/.claude-code/wcp-claude-dev-buddy.2025-09-02.private-key.pem`
3. Make script executable: `chmod +x context/setup-claude-bot.sh`

### Before Each Claude Code Session

Run the setup script:
```bash
~/.claude-code/scripts/setup-claude-bot.sh
```

This configures both git and gh CLI to use bot identity.

### Verification

After setup, verify with:
```bash
# Check git config
git config user.name  # Should show: Claude Code[bot]

# Check gh auth
gh auth status  # Should show: Logged in as app (GitHub App)
```

## How It Works

1. **JWT Generation**: Creates a JSON Web Token signed with the app's private key
2. **Installation Token**: Exchanges JWT for an installation access token
3. **gh CLI Auth**: Configures gh to use the installation token
4. **Git Config**: Sets git user to bot identity for commits

## Important Notes

- Installation tokens expire after ~1 hour
- Re-run the script when you get authentication errors
- The bot can only access repositories where the app is installed
- All actions will show as "Claude Code[bot]" in GitHub UI

## Troubleshooting

### "Could not get installation ID"
- Ensure the GitHub App is installed on your repository
- Check at: https://github.com/settings/installations

### "Authentication failed"
- Token may have expired - re-run the setup script
- Check private key file exists and has correct permissions

### PRs still showing as personal user
- Make sure to run setup script BEFORE creating PRs
- Verify with `gh auth status` that you're logged in as app

## Benefits

- Clear attribution: All automated actions show as bot
- Better audit trail: Distinguishes human vs AI actions
- Professional appearance: PRs and commits clearly marked as automated
- Compliance: Follows GitHub's guidelines for apps and bots