# Windows Setup Guide for Work Capacity Planner

This guide provides comprehensive instructions for setting up and running the Work Capacity Planner on Windows systems.

## Prerequisites

### 1. Node.js and npm
- **Required Version**: Node.js 18.x or higher
- **Download**: https://nodejs.org/
- **Verification**: 
  ```cmd
  node --version
  npm --version
  ```

### 2. Git for Windows
- **Download**: https://git-scm.com/download/win
- **Important**: During installation, select "Use Git from Windows Command Prompt"
- **Verification**:
  ```cmd
  git --version
  ```

### 3. Python (for node-gyp)
- **Required Version**: Python 3.10 or higher
- **Download**: https://www.python.org/downloads/windows/
- **Important**: Check "Add Python to PATH" during installation
- **Verification**:
  ```cmd
  python --version
  ```

### 4. Visual Studio Build Tools 2022
- **Download**: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
- **Installation**:
  1. Run the installer
  2. Select "Desktop development with C++" workload
  3. Ensure these are checked:
     - MSVC v143 - VS 2022 C++ x64/x86 build tools
     - Windows 10/11 SDK
  4. Install (requires ~8GB disk space)
- **Alternative**: If you have Visual Studio 2022 installed, ensure C++ workload is included

## Installation Steps

### Step 1: Clone the Repository
```cmd
git clone https://github.com/yourusername/task_planner.git
cd task_planner
```

### Step 2: Install Dependencies
```cmd
npm install
```

### Step 3: Install electron-rebuild
```cmd
npm install --save-dev electron-rebuild
```

### Step 4: Rebuild Native Modules
```cmd
npx electron-rebuild
```

**Note**: This step is crucial! It rebuilds better-sqlite3 to match Electron's Node.js version.

### Step 5: Set Up Environment Variables
1. Copy the example environment file:
   ```cmd
   copy .env.example .env
   ```

2. Edit `.env` file with your API keys:
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   DATABASE_URL=file:./prisma/dev.db
   ```

   **Important**: Use forward slashes (/) even on Windows for the DATABASE_URL

### Step 6: Generate Prisma Client
```cmd
npx prisma generate
```

### Step 7: Initialize Database
```cmd
npx prisma migrate dev
```

## Running the Application

### Development Mode
```cmd
npm run start
```

**Note**: Some scripts in package.json are Unix-specific. Use these Windows alternatives:

### Windows-Compatible Scripts

Add these to your local package.json scripts section for Windows compatibility:

```json
{
  "scripts": {
    "start:windows": "npm run build:main && npm run build:preload && concurrently -k \"npm run dev\" \"timeout /t 5 /nobreak >nul && npm run electron:dev\"",
    "restart:windows": "taskkill /F /IM electron.exe 2>nul & npm run start:windows",
    "typecheck:count:windows": "npx tsc --noEmit 2>&1 | findstr /C:\"error TS\" | find /c /v \"\"",
    "postinstall:windows": "node scripts/dev/setup-git-hooks.js || echo Git hooks setup failed"
  }
}
```

## Common Issues and Solutions

### Issue 1: Native Module Compilation Errors
**Error**: `Error: The module '\\?\...\better-sqlite3.node' was compiled against a different Node.js version`

**Solution**:
```cmd
npm run postinstall
npx electron-rebuild
```

### Issue 2: Visual Studio Build Tools Not Found
**Error**: `gyp ERR! find VS`

**Solution**:
1. Ensure Visual Studio Build Tools 2022 is installed
2. Set the Visual Studio version explicitly:
   ```cmd
   npm config set msvs_version 2022
   ```
3. If issues persist, install globally:
   ```cmd
   npm install --global node-gyp
   node-gyp configure --msvs_version=2022
   ```

### Issue 3: Python Not Found
**Error**: `gyp ERR! find Python`

**Solution**:
1. Ensure Python is in PATH
2. Or set Python path explicitly:
   ```cmd
   npm config set python "C:\Python310\python.exe"
   ```

### Issue 4: Prisma Database Path Issues
**Error**: `Invalid DATABASE_URL`

**Solution**:
Ensure your `.env` file uses forward slashes:
```
DATABASE_URL=file:./prisma/dev.db
```
NOT: `file:.\prisma\dev.db`

### Issue 5: Shell Scripts Not Working
**Error**: `'./scripts/...' is not recognized`

**Solution**:
Use Windows-specific npm scripts (see Windows-Compatible Scripts section above) or:
1. Install Git Bash and run scripts through it
2. Use WSL (Windows Subsystem for Linux)
3. Convert scripts to Node.js (cross-platform)

### Issue 6: ENOENT Errors During Build
**Error**: `ENOENT: no such file or directory`

**Solution**:
```cmd
mkdir dist
mkdir dist\renderer
npm run build
```

### Issue 7: Permission Errors
**Error**: `EPERM: operation not permitted`

**Solution**:
1. Run Command Prompt as Administrator
2. Or close any applications using the files (especially electron.exe)

## Verification Checklist

After setup, verify everything works:

- [ ] `npm run typecheck` - Should complete with 0 errors
- [ ] `npm run lint` - Should complete with 0 errors  
- [ ] `npm test` - All tests should pass
- [ ] `npm run build` - Should build successfully
- [ ] `npm run start:windows` - Application should launch

## Alternative: Using WSL (Windows Subsystem for Linux)

If you encounter persistent issues, consider using WSL2:

1. Install WSL2: https://docs.microsoft.com/en-us/windows/wsl/install
2. Install Ubuntu from Microsoft Store
3. Follow the Linux setup instructions within WSL

**Benefits**:
- Full compatibility with Unix shell scripts
- No need for Windows-specific modifications
- Easier development experience

**Drawbacks**:
- Additional system overhead
- File system performance may be slower
- Requires Windows 10 version 2004+ or Windows 11

## Alternative: Web-Only Development

For development without Electron (limited functionality):

1. Comment out Electron-specific code in your local files
2. Use mock implementations for window.electronAPI
3. Run only the Vite dev server:
   ```cmd
   npm run dev
   ```
4. Access at http://localhost:5174

**Note**: This disables all database operations, AI features, and voice recording.

## Required VS Code Extensions (Optional but Recommended)

- ESLint
- Prettier
- Prisma
- TypeScript and JavaScript Language Features

## Support

If you encounter issues not covered here:

1. Check the error messages carefully
2. Ensure all prerequisites are installed correctly
3. Try running as Administrator
4. Check GitHub Issues for similar problems
5. Consider using WSL2 as a fallback option

## Quick Start Summary

For experienced developers, here's the minimal setup:

```cmd
# Prerequisites: Node.js 18+, Git, Python 3.10+, VS Build Tools 2022

git clone <repository>
cd task_planner
npm install
npm install --save-dev electron-rebuild
npx electron-rebuild
copy .env.example .env
# Edit .env with your API keys
npx prisma generate
npx prisma migrate dev
npm run start
```

Remember to use forward slashes in DATABASE_URL and run as Administrator if you encounter permission issues.