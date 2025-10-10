import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock execa and which
vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('which', () => ({ default: vi.fn() }));

// Mock fs/promises for journal entries
const mkdirMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const loadProjectEckManifestMock = vi.fn();
vi.mock('fs/promises', () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock
}));
vi.mock('../utils/fileUtils.js', () => ({
  loadProjectEckManifest: loadProjectEckManifestMock
}));

// Mock p-retry to control retry behavior in tests
vi.mock('p-retry', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: vi.fn(async (fn, options) => {
      try {
        return await fn();
      } catch (error) {
        if (options.onFailedAttempt) {
          await options.onFailedAttempt(error);
          // In a real scenario, p-retry would re-run fn. For testing, we simulate one retry.
          if (error.name === 'AuthError') {
             return await fn();
          }
        }
        throw error;
      }
    })
  };
});

// Mock the authService
vi.mock('./authService.js', () => ({
  initiateLogin: vi.fn()
}));

describe('gptService with codex CLI', () => {
  let ask;
  let execaMock;
  let whichMock;
  let initiateLoginMock;

  beforeEach(async () => {
    vi.clearAllMocks();

    ({ execa: execaMock } = await import('execa'));
    const which = (await import('which')).default;
    whichMock = which;
    ({ initiateLogin: initiateLoginMock } = await import('./authService.js'));
    ({ ask } = await import('./gptService.js'));

    whichMock.mockResolvedValue('/usr/bin/codex');
    loadProjectEckManifestMock.mockResolvedValue(null);
  });

  it('should call codex CLI with correct arguments and parse final JSON from noisy output', async () => {
    const codexLogs = '[2025-10-06 20:04:22] OpenAI Codex v0.42.0\nSome setup log...\n\n{"success": true, "changes": ["change1"], "errors": []}';
    execaMock.mockResolvedValue({ stdout: codexLogs });

    const payload = { objective: 'Test' };
    const result = await ask(payload);

    expect(result).toEqual({ success: true, changes: ['change1'], errors: [] });
    expect(execaMock).toHaveBeenCalledWith('codex', expect.arrayContaining(['exec', '--full-auto', '--model']), expect.any(Object));
    const [, , options] = execaMock.mock.calls[0];
    expect(options.input).toContain(JSON.stringify(payload));
  });

  it('should trigger login flow on authentication error and retry', async () => {
    const authError = new Error('Authentication is required. Please run `codex login`.');
    authError.name = 'AuthError'; // Custom error name to trigger retry
    authError.stderr = 'Authentication is required. Please run `codex login`.';

    const successResponse = {
      id: 'task2',
      msg: {
        type: 'task_complete',
        last_agent_message: '{"success": true}'
      }
    };

    // First call fails, second call (retry) succeeds
    execaMock
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce({ stdout: JSON.stringify(successResponse) });

    initiateLoginMock.mockResolvedValue();

    const result = await ask({ objective: 'Retry test' });

    expect(result).toEqual({ success: true });
    expect(initiateLoginMock).toHaveBeenCalledTimes(1);
    expect(execaMock).toHaveBeenCalledTimes(2); // Initial call + retry
  });

  it('should throw if codex CLI is not found', async () => {
    whichMock.mockRejectedValue(new Error('not found'));
    await expect(ask({})).rejects.toThrow('The `codex` CLI tool is not installed');
  });

  it('should throw non-auth errors immediately without retry', async () => {
    const otherError = new Error('Some other CLI error');
    otherError.stderr = 'Something else went wrong';
    execaMock.mockRejectedValueOnce(otherError);

    await expect(ask({})).rejects.toThrow('codex CLI failed: Something else went wrong');
    expect(initiateLoginMock).not.toHaveBeenCalled();
  });
});
