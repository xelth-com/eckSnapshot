import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mkdirMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const loadProjectEckManifestMock = vi.fn();

const actualFsPromises = await vi.importActual('fs/promises');
const fsModule = { ...actualFsPromises };

vi.mock('fs/promises', () => ({
  ...fsModule,
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeFileMock,
  default: {
    ...fsModule,
    mkdir: mkdirMock,
    readFile: readFileMock,
    writeFile: writeFileMock
  }
}));

vi.mock('../utils/fileUtils.js', () => ({
  loadProjectEckManifest: loadProjectEckManifestMock
}));

vi.mock('execa', () => ({
  execa: vi.fn()
}));

describe('gptService', () => {
  let ask;
  let execaMock;
  let consoleLogSpy;
  let consoleWarnSpy;

  beforeEach(async () => {
    vi.clearAllMocks();
    mkdirMock.mockResolvedValue();
    readFileMock.mockResolvedValue('');
    writeFileMock.mockResolvedValue();
    loadProjectEckManifestMock.mockResolvedValue({
      context: 'Project context',
      operations: 'Operations guide',
      journal: 'Existing journal',
      environment: { NODE_ENV: 'test' }
    });

    process.env.OPENAI_MODEL = 'test-model';
    process.env.CHATGPT_SESSION_PATH = '/tmp/session.json';

    ({ execa: execaMock } = await import('execa'));
    ({ ask } = await import('./gptService.js'));

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.OPENAI_MODEL;
    delete process.env.CHATGPT_SESSION_PATH;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('delegates payload to chatgpt CLI and parses JSON response', async () => {
    const cliResponse = { success: true, changes: [], errors: [] };
    execaMock.mockResolvedValueOnce({ stdout: JSON.stringify(cliResponse) });

    const payload = { task_id: 'task-1', payload: { objective: 'Test' } };
    const result = await ask(JSON.stringify(payload));

    expect(result).toEqual(cliResponse);
    expect(execaMock).toHaveBeenCalledTimes(1);
    const callArgs = execaMock.mock.calls[0];
    expect(callArgs[0]).toBe('npx');
    expect(callArgs[1]).toContain('--model');
    expect(callArgs[1]).toContain('test-model');
    expect(callArgs[1]).toContain('--stream');
    const prompt = callArgs[1][callArgs[1].length - 1];
    expect(prompt).toContain('"objective":"Test"');
    expect(prompt).toContain('# Project Context');
    expect(loadProjectEckManifestMock).toHaveBeenCalledTimes(1);
  });

  it('applies journal entry and handles mcp feedback in post steps', async () => {
    readFileMock.mockResolvedValue('Previous entries');

    const postSteps = {
      journal_entry: {
        type: 'feat',
        scope: 'services',
        summary: 'Implement GPT delegation',
        details: '- Added GPT service\n- Wired CLI'
      },
      mcp_feedback: {
        success: true,
        errors: [],
        mcp_version: '1.0'
      }
    };

    execaMock
      .mockResolvedValueOnce({ stdout: JSON.stringify({ success: true, post_steps: postSteps }) })
      .mockResolvedValueOnce({ stdout: '' })
      .mockResolvedValueOnce({ stdout: '' });

    const payload = { task_id: 'task-2' };
    const result = await ask(JSON.stringify(payload));

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [journalPath, content] = writeFileMock.mock.calls[0];
    const normalizedPath = journalPath.replace(/\\/g, '/');
    expect(normalizedPath).toContain('/.eck/JOURNAL.md');
    expect(content).toContain('task_id: task-2');
    expect(content).toContain('## Implement GPT delegation');
    expect(content).toContain('- Added GPT service');
    expect(execaMock).toHaveBeenNthCalledWith(2, 'git', ['add', '.eck/JOURNAL.md'], expect.objectContaining({ cwd: process.cwd() }));
    expect(execaMock).toHaveBeenNthCalledWith(3, 'git', ['commit', '-m', 'feat(services): Implement GPT delegation'], expect.objectContaining({ cwd: process.cwd() }));
    expect(result.mcp_feedback).toEqual(postSteps.mcp_feedback);
    expect(consoleLogSpy).toHaveBeenCalledWith('MCP feedback:', postSteps.mcp_feedback);
  });

  it('throws when chatgpt responds with invalid JSON', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'not-json' });

    await expect(ask('{}')).rejects.toThrow('Failed to parse chatgpt JSON response');
  });

  it('throws helpful error when chatgpt session is missing', async () => {
    const error = new Error('Login required');
    error.stderr = 'session expired';
    execaMock.mockRejectedValueOnce(error);

    await expect(ask('{}')).rejects.toThrow('ChatGPT session expired or missing');
  });
});
