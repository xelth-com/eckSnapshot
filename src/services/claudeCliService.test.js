import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { askClaude } from './claudeCliService.js';

// Mock execa
vi.mock('execa', () => ({
  execa: vi.fn()
}));

// Mock p-retry to control retry behavior in tests
vi.mock('p-retry', () => ({
  default: async (fn, options) => {
    // For tests, we'll execute the function directly without retries
    return await fn();
  }
}));

describe('claudeCliService', () => {
  let mockExeca;

  beforeEach(async () => {
    const { execa } = await import('execa');
    mockExeca = execa;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('askClaude', () => {
    it('should successfully execute gemini-cli claude command', async () => {
      const mockResponse = {
        stdout: '{"result": "test response", "success": true}',
        stderr: '',
        exitCode: 0
      };

      mockExeca.mockResolvedValue(mockResponse);

      const result = await askClaude('test prompt');

      expect(mockExeca).toHaveBeenCalledWith('gemini-cli', ['claude', 'test prompt'], {
        timeout: 120000
      });
      expect(result).toEqual({
        stdout: mockResponse.stdout,
        stderr: mockResponse.stderr,
        success: true,
        mcp_feedback: null
      });
    });

    it('should handle non-transient errors without retry', async () => {
      const mockError = new Error('EACCES: permission denied');
      mockError.code = 'EACCES';
      mockError.stdout = '';
      mockError.stderr = 'permission denied';

      mockExeca.mockRejectedValue(mockError);

      const result = await askClaude('test prompt');

      expect(result).toEqual({
        stdout: '',
        stderr: 'permission denied',
        success: false,
        error: 'EACCES: permission denied'
      });
    });

    it('should identify transient network errors', async () => {
      const mockError = new Error('Connection timeout');
      mockError.stdout = '';
      mockError.stderr = 'network timeout occurred';

      const { isTransientError } = await import('./claudeCliService.js');

      expect(isTransientError(mockError)).toBe(true);
    });


    it('should handle JSON parsing in gemini-cli response', async () => {
      const complexJsonResponse = {
        stdout: JSON.stringify({
          type: 'result',
          data: {
            analysis: 'test analysis',
            metrics: { tokens: 100, cost: 0.05 }
          },
          timestamp: new Date().toISOString()
        }),
        stderr: '',
        exitCode: 0
      };

      mockExeca.mockResolvedValue(complexJsonResponse);

      const result = await askClaude('analyze this code');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('test analysis');
      expect(result.stdout).toContain('tokens');
    });

    it('should handle empty responses gracefully', async () => {
      const mockResponse = {
        stdout: '',
        stderr: '',
        exitCode: 0
      };

      mockExeca.mockResolvedValue(mockResponse);

      const result = await askClaude('test prompt');

      expect(result).toEqual({
        stdout: '',
        stderr: '',
        success: true,
        mcp_feedback: null
      });
    });

    it('should handle stderr warnings without failing', async () => {
      const mockResponse = {
        stdout: '{"result": "success"}',
        stderr: 'Warning: deprecated feature used',
        exitCode: 0
      };

      mockExeca.mockResolvedValue(mockResponse);

      const result = await askClaude('test prompt');

      expect(result.success).toBe(true);
      expect(result.stderr).toContain('deprecated feature');
    });

    it('should respect timeout configuration', async () => {
      mockExeca.mockResolvedValue({
        stdout: 'response',
        stderr: '',
        exitCode: 0
      });

      await askClaude('test prompt');

      expect(mockExeca).toHaveBeenCalledWith(
        'gemini-cli',
        ['claude', 'test prompt'],
        { timeout: 120000 }
      );
    });

    it('should parse mcp_feedback from JSON prompt', async () => {
      const mockResponse = {
        stdout: 'success',
        stderr: '',
        exitCode: 0
      };

      mockExeca.mockResolvedValue(mockResponse);

      const promptWithFeedback = JSON.stringify({
        payload: {
          post_execution_steps: {
            mcp_feedback: {
              success: true,
              errors: [],
              mcp_version: '1.0'
            }
          }
        }
      });

      const result = await askClaude(promptWithFeedback);

      expect(result.mcp_feedback).toEqual({
        success: true,
        errors: [],
        mcp_version: '1.0'
      });
    });

    it('should log warning when mcp_feedback contains errors', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockResponse = {
        stdout: 'success',
        stderr: '',
        exitCode: 0
      };

      mockExeca.mockResolvedValue(mockResponse);

      const promptWithErrors = JSON.stringify({
        payload: {
          post_execution_steps: {
            mcp_feedback: {
              success: false,
              errors: ['Error 1', 'Error 2'],
              mcp_version: '1.0'
            }
          }
        }
      });

      await askClaude(promptWithErrors);

      expect(consoleSpy).toHaveBeenCalledWith('MCP feedback contains errors:', ['Error 1', 'Error 2']);

      consoleSpy.mockRestore();
    });
  });

  describe('transient error detection', () => {
    it('should treat network errors as transient', async () => {
      const { isTransientError } = await import('./claudeCliService.js');

      const networkErrors = [
        'network error',
        'timeout',
        'connection refused',
        'ECONNRESET',
        'ENOTFOUND',
        'socket hang up'
      ];

      networkErrors.forEach(errorMsg => {
        const error = new Error(errorMsg);
        expect(isTransientError(error)).toBe(true);
      });
    });

    it('should treat quota errors as transient', async () => {
      const { isTransientError } = await import('./claudeCliService.js');

      const quotaErrors = [
        'quota exceeded',
        'rate limit',
        'too many requests',
        '429',
        '503'
      ];

      quotaErrors.forEach(errorMsg => {
        const error = new Error(errorMsg);
        expect(isTransientError(error)).toBe(true);
      });
    });

    it('should not treat permission errors as transient', async () => {
      const { isTransientError } = await import('./claudeCliService.js');

      const permanentErrors = [
        'EACCES: permission denied',
        'Invalid API key',
        'Authentication failed'
      ];

      permanentErrors.forEach(errorMsg => {
        const error = new Error(errorMsg);
        expect(isTransientError(error)).toBe(false);
      });
    });
  });
});