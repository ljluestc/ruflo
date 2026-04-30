# Title
fix(windows): prevent claude-flow.cmd self-recursion in Command Prompt (#673)

## Related Issue
- https://github.com/ruvnet/ruflo/issues/673

## Problem
On Windows Command Prompt (`cmd.exe`), users can see no usable command output after running initialization and then invoking `claude-flow`.
The same workflow works in PowerShell.

## Root Cause
The generated local wrapper (`claude-flow.cmd`) used this global fallback path:

1. run `where claude-flow`
2. execute `claude-flow %*`

In `cmd.exe`, command resolution can pick the current-directory wrapper itself first, which causes recursive self-invocation. That recursion manifests as hangs/no meaningful output after initialization.

## Fix
Updated Windows wrapper generation to explicitly skip self-path recursion:

- Capture wrapper path as `_SELF` (`%~f0`)
- Iterate `where claude-flow.cmd` results
- Select the first candidate path that is not `_SELF`
- Execute that resolved non-self path
- Fall back to `npx claude-flow@latest` if no non-self global path is found

Also made wrapper generation testable by adding an optional platform override argument in `createLocalExecutable(...)`.

## Files Changed
- `v2/src/cli/simple-commands/init/executable-wrapper.js`
  - Added recursion-safe global path resolution for generated Windows wrapper
  - Added `detectedPlatform` parameter for deterministic unit testing
- `v2/bin/init/executable-wrapper.js`
  - Mirrored the same fix for parity with generated/bin command path
- `v2/tests/unit/cli/commands/init/executable-wrapper.test.js` (new)
  - Added regression test for generated `.cmd` content:
    - contains self-skip logic
    - resolves non-self global executable path
    - does not use old direct recursive `claude-flow %*` fallback

## Validation
### Targeted test command
```bash
npm --prefix /home/calelin/dev/ruflo/v2 run test:unit -- tests/unit/cli/commands/init/executable-wrapper.test.js
```

### Current local result
- Test execution is currently blocked locally because `jest` is unavailable in this environment.
- Dependency install attempts (`npm install` and `npm ci`) both fail with npm `ERESOLVE` peer conflict (`typescript-eslint` vs `typescript` range).

### Outcome
- Code fix and regression test are implemented.
- Full local test execution remains blocked by existing dependency resolution issues unrelated to this patch.

## Risk Assessment
- **Low risk**
  - Change is scoped to generated Windows wrapper logic
  - Linux/macOS wrappers are unchanged
  - Windows behavior is improved by removing recursion risk without removing existing fallback behavior

## User Impact
- Windows Command Prompt users should no longer hit silent wrapper recursion/no-output behavior after initialization.
- PowerShell behavior remains unchanged.
