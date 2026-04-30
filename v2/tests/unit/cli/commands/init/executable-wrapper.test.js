import { describe, it, expect } from '@jest/globals';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

import { createLocalExecutable } from '../../../../../src/cli/simple-commands/init/executable-wrapper.js';

describe('createLocalExecutable', () => {
  it('creates a Windows wrapper that skips self when resolving global claude-flow', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'claude-flow-wrapper-test-'));
    try {
      await createLocalExecutable(tempDir, false, 'win32');
      const wrapperPath = path.join(tempDir, 'claude-flow.cmd');
      const content = await readFile(wrapperPath, 'utf8');

      expect(content).toContain('set "_SELF=%~f0"');
      expect(content).toContain('where claude-flow.cmd');
      expect(content).toContain('if /I not "%%~fI"=="%_SELF%"');
      expect(content).toContain('"%_GLOBAL_CLAUDE_FLOW%" %*');
      expect(content).not.toContain('\n  claude-flow %*\n');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
