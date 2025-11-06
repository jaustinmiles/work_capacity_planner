# VS Code Debugging Guide

This guide explains how to debug the Task Planner Electron application using VS Code.

## Quick Start

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Set Breakpoints**: Click in the gutter next to line numbers in any TypeScript file

3. **Start Debugging**:
   - Press `F5` or use the Debug panel (Ctrl+Shift+D / Cmd+Shift+D)
   - Select "Debug Electron App" from the dropdown
   - The app will build, start Vite, and launch Electron with debugging enabled

## Available Debug Configurations

### 🚀 Debug Electron App
The main debugging configuration that launches the entire app with debugging enabled.
- **What it does**: Runs `npm run debug` which builds the app, starts Vite, and launches Electron with inspect flags
- **Use when**: You want to debug any part of the application
- **How**: Select "Debug Electron App" and press F5

### 🎯 Attach to Main Process
Attaches to an already running Electron main process.
- **Port**: 9229
- **Use when**: The app is already running with `npm run debug` and you want to debug the main process
- **Files**: `src/main/**`, `dist/main/**`

### 🌐 Attach to Renderer Process
Attaches to the Chrome renderer process for frontend debugging.
- **Port**: 9223
- **Use when**: The app is running and you want to debug React components
- **Files**: `src/renderer/**`

### 🧪 Debug Current Test
Debugs the currently open test file.
- **Use when**: Debugging a specific test
- **How**: Open a test file, select "Debug Current Test", press F5

## How It Works

The debugging setup follows the same pattern as `npm start`:

1. **Build**: Compiles TypeScript files with source maps
2. **Start Vite**: Launches the dev server on port 5174
3. **Launch Electron**: Waits for Vite, then starts Electron with:
   - `--inspect` flag for Node.js debugging on port 9229
   - `--remote-debugging-port=9223` for Chrome DevTools

## Setting Breakpoints

- **Regular Breakpoint**: Click in the gutter next to a line number
- **Conditional Breakpoint**: Right-click → "Add Conditional Breakpoint"
- **Logpoint**: Right-click → "Add Logpoint" (logs without stopping)

## Debugging Different Parts

### Main Process (Backend)
- Set breakpoints in `src/main/index.ts` or `src/main/database.ts`
- Use "Debug Electron App" or "Attach to Main Process"
- Inspect IPC handlers, database operations, file system access

### Renderer Process (Frontend)
- Set breakpoints in React components (`src/renderer/**`)
- Use "Attach to Renderer Process" after starting the app
- Or use Chrome DevTools (Ctrl+Shift+I in the app)

### IPC Communication
1. Set breakpoints in both processes:
   - Main: IPC handlers in `src/main/index.ts`
   - Renderer: `window.api` calls
2. Use "Debug Electron App" to debug both sides

## Troubleshooting

### Breakpoints Not Hit
- Ensure source maps are generated: Check for `.map` files in `dist/`
- Rebuild if needed: `npm run build:main && npm run build:preload`

### Port Already in Use
```bash
# Find process using port (macOS/Linux)
lsof -i :9229
kill -9 <PID>

# Windows
netstat -ano | findstr :9229
taskkill /PID <PID> /F
```

### App Won't Start
- Make sure no other instance is running
- Check that port 5174 is free for Vite
- Try `npm start` first to verify the app works normally

## Alternative Debugging Methods

### Chrome DevTools
When the app is running (even without debug mode):
- Press Ctrl+Shift+I (Cmd+Option+I on Mac) in the app
- Use for quick frontend debugging without VS Code

### Console Logging
The app uses a custom logger. View logs:
- In the app's developer console
- In VS Code's debug console when debugging
- Via the logging utilities in `scripts/dev/`

## Tips

1. **Use npm scripts**: The `npm run debug` script handles all the complexity
2. **Source maps are crucial**: Already configured in build scripts
3. **Debug and regular start are similar**: Both use the same workflow, debug just adds inspect flags
4. **Renderer needs Vite**: The app won't work without the dev server running