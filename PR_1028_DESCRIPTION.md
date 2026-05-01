# Fix hive-mind init MCP lookup failure on macOS M4 (#1028)

**Closes #1028**

## Problem

On some environments (reported on macOS M4), running:

`npx claude-flow hive-mind init`

failed with:

`[ERROR] Init error: MCP tool not found: hive-mind/init`

even though the hive-mind init MCP handler exists.

## Root Cause

The CLI command path used slash-style tool names (`hive-mind/init`), while the MCP tool registry uses underscore naming for this tool (`hive-mind_init`).

`callMCPTool` only performed exact-name lookup, so slash-form calls failed with a false “tool not found” error.

## Solution

Added a compatibility resolver in the MCP client:

1. Try exact lookup first (no behavior change for existing calls)
2. If not found and the input name contains `/`, fallback to underscore normalization:
   - `hive-mind/init` -> `hive-mind_init`

This keeps current behavior intact while allowing legacy slash-form invocations to resolve correctly.

## Files Changed

- `v3/@claude-flow/cli/src/mcp-client.ts`
  - Added `resolveTool` helper with slash-to-underscore fallback
  - Updated `callMCPTool` to use compatibility lookup

- `v3/@claude-flow/cli/__tests__/mcp-client.test.ts`
  - Added mocked `hive-mind_init` tool registration
  - Added regression test confirming `callMCPTool('hive-mind/init', ...)` resolves and executes successfully

## Validation

Targeted test:

```bash
npm --prefix /home/calelin/dev/ruflo/v3/@claude-flow/cli run test -- __tests__/mcp-client.test.ts
```

Expected result:
- mcp-client tests pass
- new legacy-name compatibility test passes

## Risk Assessment

Low risk:
- Exact-name lookups remain unchanged and still take precedence
- Fallback only applies when exact lookup fails and tool name contains `/`
- Scope is limited to MCP client tool resolution logic

## User Impact

- `hive-mind init` no longer fails due to slash-vs-underscore naming mismatch in MCP tool lookup
- Existing tool names and modern code paths continue working as before
