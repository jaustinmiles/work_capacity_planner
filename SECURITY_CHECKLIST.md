# Security Checklist

## Pre-Commit Security Verification

This checklist verifies that no sensitive information is committed to the repository.

### ✅ Verified Security Items

#### 1. Environment Variables
- [x] `.env` file is gitignored
- [x] No hardcoded API keys in source code
- [x] All API keys accessed via `process.env`
- [x] Verified patterns checked:
  - `ANTHROPIC_API_KEY`
  - `OPENAI_API_KEY`
  - `sk-*` (API key patterns)
  - `Bearer` tokens

#### 2. Database Files
- [x] All `.db` files are gitignored
- [x] `prisma/dev.db` (contains user data) is ignored
- [x] Test databases are ignored
- [x] Database backups are ignored

#### 3. Personal Information
- [x] No personal names in code
- [x] No email addresses in code
- [x] No phone numbers or addresses
- [x] Test data uses generic names only

#### 4. Security Vulnerabilities
- [x] `npm audit` shows 0 vulnerabilities
- [x] Dependencies are up to date
- [x] No known security issues in packages

#### 5. Electron Security
- [x] Context isolation enabled
- [x] Node integration disabled in renderer
- [x] All IPC communication via preload script
- [x] No remote module usage

### Files Verified Safe for Commit

Modified files checked:
- `CLAUDE.md` - Documentation only
- `prisma/schema.prisma` - Schema definition, no data
- `src/main/database.ts` - Database service, no credentials
- `src/main/index.ts` - IPC handlers, no secrets
- `src/preload/index.ts` - IPC bridge, no secrets
- `src/renderer/App.tsx` - UI component, no secrets
- Component files - UI logic only
- Test files - Generic test data only

### Commands for Future Security Checks

```bash
# Check for API keys or tokens
grep -r "API_KEY\|SECRET\|TOKEN\|Bearer\|sk-" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules src/

# Check for personal information
grep -r "@.*\.com\|phone:\|address:" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules src/

# Run security audit
npm audit

# Check what files will be committed
git status --porcelain

# Verify database files are ignored
git check-ignore prisma/*.db

# Check for large files that might contain data
find . -type f -size +1M ! -path "./node_modules/*" ! -path "./.git/*"
```

### Before Pushing

1. Run `npm audit` to check for vulnerabilities
2. Verify `.env` is not staged
3. Confirm all `.db` files are ignored
4. Review changes for any personal information
5. Check that no API keys are hardcoded

### Additional Security Tools

For comprehensive security scanning, consider:
- `npm install --save-dev eslint-plugin-security` - ESLint security rules
- `npx snyk test` - Vulnerability scanning
- `gitleaks detect` - Secret detection in git history

---

Last verified: 2025-08-14