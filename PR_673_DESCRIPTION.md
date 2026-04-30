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

Implement comprehensive Windows cmd.exe compatibility through:

1. **Platform Detection**: Detect cmd.exe vs PowerShell/Windows Terminal
2. **Graceful UI Degradation**: Fall back to simple console output when Ink fails
3. **Console Mode Handling**: Properly configure Windows console for ANSI support
4. **Output Flushing**: Ensure all output is flushed immediately in cmd.exe

### Implementation Details

**File:** `v2/src/cli/ui/compatible-ui.ts`

Add platform detection and fallback handling:

```typescript
// Detect if running in cmd.exe
const isCmdExe = process.platform === 'win32' && 
  process.env.COMSPEC?.toLowerCase().includes('cmd.exe') &&
  !process.env.PSModulePath; // PowerShell sets this

const isWindowsTerminal = process.env.WT_SESSION !== undefined;
const isPowerShell = process.env.PSModulePath !== undefined;

// Use simple console output for cmd.exe, Ink for others
if (isCmdExe && !isWindowsTerminal) {
  return useSimpleConsoleUI();
}
```

**Console Mode Configuration:**

```typescript
// Enable ANSI support in cmd.exe
if (process.platform === 'win32') {
  const { stdin, stdout, stderr } = process;
  
  // Force enable ANSI processing
  if (stdout.isTTY) {
    // Set console mode to enable ANSI sequences
    process.stdout.write('\x1b[0m'); // Reset
  }
  
  // Force immediate flush
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: any, ...args: any[]) => {
    const result = originalWrite(chunk, ...args);
    if (typeof chunk === 'string') {
      process.stdout.emit('drain');
    }
    return result;
  };
}
```

**Fallback UI Handler:**

```typescript
function useSimpleConsoleUI() {
  // Replace Ink spinner with simple dots
  const spinner = ['.', '..', '...', ''];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write('\r' + spinner[i % spinner.length]);
    i++;
  }, 250);
  
  return {
    stop: () => clearInterval(interval),
    succeed: (msg: string) => console.log(`\r✓ ${msg}`),
    fail: (msg: string) => console.log(`\r✗ ${msg}`),
  };
}
```

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
