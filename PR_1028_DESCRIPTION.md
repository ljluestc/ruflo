# Fix hive-mind init MCP lookup failure on macOS M4 (#1028)

**Closes #1028**

## Problem

On some environments (reported on macOS M4), running:

```bash
npx claude-flow hive-mind init
```

failed with:

```
[ERROR] Init error: MCP tool not found: hive-mind/init
```

even though the hive-mind init MCP handler exists. The same command worked correctly on macOS M1 and Windows.

## Root Cause

The CLI command path used slash-style tool names (`hive-mind/init`), while the MCP tool registry uses underscore naming for this tool (`hive-mind_init`).

`callMCPTool` only performed exact-name lookup, so slash-form calls failed with a false "tool not found" error.

## Solution

Added a compatibility resolver in the MCP client (`resolveTool` function):

```typescript
function resolveTool(toolName: string): MCPTool | undefined {
  const exactMatch = TOOL_REGISTRY.get(toolName);
  if (exactMatch) {
    return exactMatch;
  }

  // Compatibility fallback for legacy slash-style names like "hive-mind/init"
  // when the registered MCP tool name uses underscore format "hive-mind_init".
  if (toolName.includes('/')) {
    return TOOL_REGISTRY.get(toolName.replace('/', '_'));
  }

  return undefined;
}
```

This approach:
1. Tries exact lookup first (no behavior change for existing calls)
2. Falls back to underscore normalization if not found and name contains `/`
   - `hive-mind/init` -> `hive-mind_init`

## Files Changed

- `v3/@claude-flow/cli/src/mcp-client.ts`
  - Added `resolveTool` helper with slash-to-underscore fallback (lines 74-87)
  - Updated `callMCPTool` to use `resolveTool()` instead of direct registry lookup
  - Updated `hasTool` to use `resolveTool()` for consistent slash-to-underscore handling
  - Updated `getToolMetadata` to use `resolveTool()` for consistent lookups
  - Updated `validateToolInput` to use `resolveTool()` for consistent lookups

- `v3/@claude-flow/cli/__tests__/mcp-client.test.ts`
  - Added mocked `hive-mind_init` tool registration (lines 235-256)
  - Added regression test confirming `callMCPTool('hive-mind/init', ...)` resolves correctly (lines 267-279)

## Validation

Targeted test:

```bash
npm --prefix /home/calelin/dev/ruflo/v3/@claude-flow/cli run test -- __tests__/mcp-client.test.ts
```

Expected result:
- All mcp-client tests pass
- Legacy-name compatibility test passes ("should resolve legacy slash format to underscore tool name")

## Risk Assessment

Low risk:
- Exact-name lookups remain unchanged and still take precedence
- Fallback only applies when exact lookup fails and tool name contains `/`
- Scope is limited to MCP client tool resolution logic
- Backward compatible - existing underscore-format calls work as before

## User Impact

- `hive-mind init` no longer fails due to slash-vs-underscore naming mismatch in MCP tool lookup
- All platforms (macOS M1/M4, Windows) now work consistently
- Existing tool names and modern code paths continue working as before
