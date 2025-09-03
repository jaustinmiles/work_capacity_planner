#!/bin/bash

# Claude Code Bot Authentication Setup Script
# This script configures both git and gh CLI to use the Claude Code[bot] GitHub App
# Run this before starting a Claude Code session to ensure all actions are attributed to the bot

# GitHub App Configuration
APP_ID="1888380"
PRIVATE_KEY_PATH="$HOME/.claude-code/wcp-claude-dev-buddy.2025-09-02.private-key.pem"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🤖 Claude Code Bot Authentication Setup"
echo "========================================"
echo ""

# Check prerequisites
if [ ! -f "$PRIVATE_KEY_PATH" ]; then
    echo -e "${RED}❌ Error: Private key not found${NC}"
    echo "  Location: $PRIVATE_KEY_PATH"
    echo ""
    echo "To fix:"
    echo "1. Go to: https://github.com/settings/apps/wcp-claude-dev-buddy/permissions"
    echo "2. Generate and download a private key"
    echo "3. Save it to: $PRIVATE_KEY_PATH"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}❌ Error: jq is required but not installed${NC}"
    echo "To fix: brew install jq"
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ Error: gh CLI is required but not installed${NC}"
    echo "To fix: brew install gh"
    exit 1
fi

# Function to generate JWT token for GitHub App authentication
generate_jwt() {
    local now=$(date +%s)
    local iat=$((now - 60))  # Issued 60 seconds ago
    local exp=$((now + 600)) # Expires in 10 minutes
    
    # Create JWT header
    local header=$(echo -n '{"alg":"RS256","typ":"JWT"}' | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n')
    
    # Create JWT payload
    local payload=$(echo -n "{\"iat\":$iat,\"exp\":$exp,\"iss\":\"$APP_ID\"}" | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n')
    
    # Create signature
    local signature=$(echo -n "$header.$payload" | openssl dgst -sha256 -sign "$PRIVATE_KEY_PATH" | base64 | tr '+/' '-_' | tr -d '=' | tr -d '\n')
    
    echo "$header.$payload.$signature"
}

echo "🔑 Generating JWT token..."
JWT=$(generate_jwt)

if [ -z "$JWT" ]; then
    echo -e "${RED}❌ Error: Failed to generate JWT token${NC}"
    exit 1
fi

# Get installation ID for the repository
echo "📍 Getting GitHub App installation ID..."
INSTALLATION_RESPONSE=$(curl -s -H "Authorization: Bearer $JWT" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/app/installations")

INSTALLATION_ID=$(echo "$INSTALLATION_RESPONSE" | jq '.[0].id')

if [ "$INSTALLATION_ID" = "null" ] || [ -z "$INSTALLATION_ID" ]; then
    echo -e "${RED}❌ Error: Could not get installation ID${NC}"
    echo "  Make sure the GitHub App is installed on your repository"
    echo "  Check at: https://github.com/settings/installations"
    echo ""
    echo "Debug info:"
    echo "$INSTALLATION_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}✓${NC} Installation ID: $INSTALLATION_ID"

# Get installation access token
echo "🔐 Getting installation access token..."
TOKEN_RESPONSE=$(curl -s -X POST \
    -H "Authorization: Bearer $JWT" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/app/installations/$INSTALLATION_ID/access_tokens")

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token')
EXPIRES_AT=$(echo "$TOKEN_RESPONSE" | jq -r '.expires_at')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ Error: Could not get access token${NC}"
    echo "Debug info:"
    echo "$TOKEN_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}✓${NC} Access token obtained (expires: $EXPIRES_AT)"

# Configure gh CLI to use the token
echo "⚙️  Configuring gh CLI with bot token..."
echo "$TOKEN" | gh auth login --with-token --hostname github.com

# Verify gh auth
GH_STATUS=$(gh auth status 2>&1)
if echo "$GH_STATUS" | grep -q "Logged in"; then
    echo -e "${GREEN}✓${NC} gh CLI configured successfully"
else
    echo -e "${YELLOW}⚠️  Warning: gh CLI configuration may have issues${NC}"
    echo "$GH_STATUS"
fi

# Configure git for bot commits
echo "⚙️  Configuring git for bot commits..."
git config --global user.name "Claude Code[bot]"
git config --global user.email "${APP_ID}+claude-code[bot]@users.noreply.github.com"

# Verify git config
GIT_NAME=$(git config --global user.name)
GIT_EMAIL=$(git config --global user.email)

if [ "$GIT_NAME" = "Claude Code[bot]" ]; then
    echo -e "${GREEN}✓${NC} Git user name: $GIT_NAME"
else
    echo -e "${YELLOW}⚠️  Warning: Git user name not set correctly${NC}"
fi

if [ "$GIT_EMAIL" = "${APP_ID}+claude-code[bot]@users.noreply.github.com" ]; then
    echo -e "${GREEN}✓${NC} Git user email: $GIT_EMAIL"
else
    echo -e "${YELLOW}⚠️  Warning: Git user email not set correctly${NC}"
fi

echo ""
echo "========================================"
echo -e "${GREEN}✅ Bot authentication setup complete!${NC}"
echo ""
echo "All operations will now be performed as: Claude Code[bot]"
echo "  • Git commits will show as bot"
echo "  • PRs created with 'gh pr create' will show as bot"
echo "  • PR comments with 'gh pr comment' will show as bot"
echo "  • Issue operations will show as bot"
echo ""
echo -e "${YELLOW}⚠️  Note:${NC} Token expires at $EXPIRES_AT"
echo "  Re-run this script when authentication fails"
echo ""
echo "To verify setup:"
echo "  git config user.name    # Should show: Claude Code[bot]"
echo "  gh auth status          # Should show: Logged in as app"