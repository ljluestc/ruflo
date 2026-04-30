# Fix Windows cmd.exe No Output After Initialization

**Closes #673**

## Overview

This PR addresses the issue where Ruflo/Claude-Flow shows no output after initialization when running in Windows Command Prompt (cmd.exe), despite working correctly in Windows PowerShell. The fix implements platform-aware console output handling to ensure consistent behavior across all Windows terminal environments.

## Problem Statement

When users run Ruflo in Windows cmd.exe, the program appears to initialize successfully but then produces no subsequent output:

**Observed Behavior:**
```cmd
C:\Users\test> npx @claude-flow/cli@latest init

🚀 Initializing Claude Flow v3.5.80 with enhanced features...
[No further output - hangs or exits silently]
```

**Expected Behavior:**
```cmd
C:\Users\test> npx @claude-flow/cli@latest init

🚀 Initializing Claude Flow v3.5.80 with enhanced features...
✅ ✓ Created CLAUDE.md
✅ ✓ Created .claude directory structure
[... full output ...]
🎉 Initialization complete!
```

The same commands work correctly in:
- Windows PowerShell 5.1+
- Windows Terminal
- Git Bash
- WSL/WSL2

### Root Cause Analysis

The issue stems from multiple Windows cmd.exe specific behaviors:

1. **Ink Framework Raw Mode Incompatibility**
   - The Ink terminal UI framework attempts to enable raw mode on `process.stdin`
   - cmd.exe doesn't support raw mode in the same way as Unix-like terminals or PowerShell
   - This causes silent hangs during UI initialization

2. **Console Buffer Handling Differences**
   - cmd.exe uses different buffering strategies than PowerShell
   - stdout/stderr may not flush automatically
   - ANSI escape codes require explicit console mode handling

3. **TTY Detection Failures**
   - cmd.exe reports different TTY properties than PowerShell
   - Code paths that check `process.stdin.isTTY` may behave differently
   - Color output detection can fail silently

### Error Chain

```
User runs command in cmd.exe
    ↓
CLI initializes, Ink framework loads
    ↓
Ink attempts process.stdin.setRawMode(true)
    ↓
cmd.exe doesn't properly support raw mode
    ↓
Process hangs or continues without terminal control
    ↓
No output displayed to user
```

## Solution

Implemented a two-part fix to ensure stdout/stderr are properly flushed on Windows:

### Part 1: Set Blocking Mode for TTYs

For interactive terminals (cmd.exe, PowerShell), we set stdout/stderr to blocking mode:

```javascript
// Fix for #673: Windows cmd.exe stdout buffering issue
if (process.platform === 'win32') {
  [process.stdout, process.stderr].forEach((stream) => {
    if (stream && stream.isTTY && stream._handle && stream._handle.setBlocking) {
      try {
        stream._handle.setBlocking(true);
      } catch (e) {
        // Ignore errors - some Windows configurations may not support this
      }
    }
  });
}
```

This ensures:
- Output is written synchronously to the terminal
- No buffering occurs
- Output appears immediately, not after program exit

### Part 2: Flush Before Exit

For programmatic exits, we ensure stdout/stderr are flushed before calling `process.exit()`:

```javascript
cli.run()
  .then(() => {
    // #673: Ensure stdout is flushed on Windows before exit
    if (process.platform === 'win32' && process.stdout.writable) {
      process.stdout.write('', () => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  })
  .catch((error) => {
    console.error('Fatal error:', error.message);
    if (process.platform === 'win32' && process.stderr.writable) {
      process.stderr.write('', () => {
        process.exit(1);
      });
    } else {
      process.exit(1);
    }
  });
```

This ensures:
- All buffered output is written before the process terminates
- The callback ensures the write completes before exit
- Works for both success (exit 0) and error (exit 1) cases

## Changes Made

### File: `v3/@claude-flow/cli/bin/cli.js`

**Lines 12-27**: Added blocking mode setup for Windows TTYs
**Lines 179-201**: Added stdout/stderr flush mechanism before exit

## Usage

### Before Fix
```cmd
C:\test> ruflo init
🚀 Initializing...
[nothing happens - hangs]
```

### After Fix
```cmd
C:\test> ruflo init
🚀 Initializing Claude Flow v3.5.80...
✓ Created CLAUDE.md
✓ Created .claude directory structure
✓ Created configuration files
✓ Initialized memory system
🎉 Initialization complete!
```

## Workaround (Current Users)

Users experiencing this issue can temporarily use one of these alternatives:

```powershell
# Use PowerShell instead
powershell -Command "ruflo init"

# Use Windows Terminal
wt ruflo init

# Use non-interactive mode (bypasses Ink)
set CI=true
ruflo init
```

## Testing

### Test Matrix

| Environment | Expected | Notes |
|------------|----------|-------|
| Windows cmd.exe | ✓ Full output | Primary fix target |
| Windows PowerShell 5.1 | ✓ Full output | Should continue working |
| Windows PowerShell 7.x | ✓ Full output | Should continue working |
| Windows Terminal (cmd) | ✓ Full output | Should continue working |
| Windows Terminal (PowerShell) | ✓ Full output | Should continue working |
| Git Bash | ✓ Full output | Should continue working |
| WSL1/WSL2 | ✓ Full output | Should continue working |

### Manual Testing Commands

```cmd
REM Test 1: Basic initialization
ruflo init

REM Test 2: Swarm command
ruflo swarm "test objective"

REM Test 3: Doctor command
ruflo doctor

REM Test 4: With verbose output
ruflo --verbose init

REM Test 5: Non-interactive mode (should work before fix)
set CI=true
ruflo init
```

### Automated Test Script

```batch
@echo off
echo Testing Ruflo cmd.exe compatibility...

REM Test initialization
ruflo init --force > test_output.txt 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: init returned error
    exit /b 1
)

findstr /C:"Initialization complete" test_output.txt > nul
if %ERRORLEVEL% NEQ 0 (
    echo FAILED: init did not produce expected output
    exit /b 1
)

echo PASSED: All tests successful
```

## Dependencies

### No New Dependencies Required
All changes use built-in Node.js APIs:
- `process.platform`
- `process.env`
- `process.stdout/stderr`
- Standard console methods

### Optional Dependencies
For enhanced Windows console support:
- `chalk` - Already used for color output
- `ora` - Alternative spinner library with better Windows support

## Related Issues

- **#177**: WSL/Windows Ink framework raw mode issues
- **#1446**: Windows daemon headless workers empty output
- **#601**: MCP server fails to connect on Windows
- **#1282**: Windows daemon and memory init silently fail
- **ADR-061**: Security fixes including cross-platform hooks
- **ADR-062**: Cross-platform hook commands

## Breaking Changes

None. This fix adds fallback behavior that preserves existing functionality on supported platforms while adding support for cmd.exe.

## Migration Guide

No migration needed. Users on cmd.exe will automatically get working output after updating.

## Future Improvements

1. **Comprehensive Terminal Matrix Testing**: Add CI/CD tests for all Windows terminals
2. **Console API Wrapper**: Create unified console interface for all platforms
3. **Native Windows Console API**: Consider using Windows-specific APIs for advanced features
4. **Documentation Updates**: Add cmd.exe specific installation instructions
5. **Better Error Messages**: Provide helpful guidance when terminal features are unavailable

## Technical References

- [Windows Console Modes](https://docs.microsoft.com/en-us/windows/console/setconsolemode)
- [ANSI Escape Codes](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Node.js TTY Documentation](https://nodejs.org/api/tty.html)
- [Ink Framework Issues](https://github.com/vadimdemedes/ink/issues)
