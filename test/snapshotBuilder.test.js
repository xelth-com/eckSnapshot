import { describe, it, expect } from 'vitest';
import { isMlModelFile, computeArtifactMetrics, ML_EXTENSIONS, resolveEffectiveConfig } from '../src/core/snapshotBuilder.js';

/**
 * SnapshotBuilder Core Verification Suite.
 * Explains WHY it exists: Enforces core file classification, machine learning signature peeking
 * eligibility, and artifact metadata estimation properties to uphold strict Zero-Broken-Windows
 * regression criteria. ML_EXTENSIONS was previously duplicated in 6 literals across the codebase —
 * these tests pin the single canonical export.
 */
describe('SnapshotBuilder Engine Utilities', () => {
  it('should correctly cross-check machine learning extension tokens', () => {
    expect(isMlModelFile('test_model.safetensors')).toBe(true);
    expect(isMlModelFile('weights.bin')).toBe(true);
    expect(isMlModelFile('index.js')).toBe(false);
    expect(isMlModelFile('styles.css')).toBe(false);
  });

  it('should match extensions case-insensitively and cover the full canonical list', () => {
    expect(isMlModelFile('MODEL.GGUF')).toBe(true);
    expect(isMlModelFile('nested/dir/model.onnx')).toBe(true);
    for (const ext of ML_EXTENSIONS) {
      expect(isMlModelFile(`some/model${ext}`)).toBe(true);
    }
  });

  it('should compute artifact structural metrics accurately', () => {
    const rawContent = 'const a = 42;\nconsole.log(a);';
    const metrics = computeArtifactMetrics(rawContent);

    expect(metrics.sizeBytes).toBeGreaterThan(0);
    expect(metrics.approxTokens).toBe(Math.round(rawContent.length / 4));
    expect(typeof metrics.sizeStr).toBe('string');
    expect(typeof metrics.tokensStr).toBe('string');
  });

  it('should format token counts with k-suffix above 1000', () => {
    const big = 'x'.repeat(8000); // ~2000 tokens
    const metrics = computeArtifactMetrics(big);
    expect(metrics.tokensStr).toMatch(/^\d+(\.\d+)?k$/);

    const small = 'tiny';
    expect(computeArtifactMetrics(small).tokensStr).toMatch(/^\d+$/);
  });

  it('should count multi-byte UTF-8 size in bytes, not chars', () => {
    const cyrillic = 'привет'; // 6 chars, 12 bytes in UTF-8
    const metrics = computeArtifactMetrics(cyrillic);
    expect(metrics.sizeBytes).toBe(12);
  });

  it('should return base config untouched when no project types are detected', async () => {
    const base = { dirsToIgnore: ['node_modules'], filesToIgnore: ['*.log'], extensionsToIgnore: ['.tmp'] };
    const merged = await resolveEffectiveConfig(process.cwd(), base, []);
    expect(merged).toEqual(base);
    expect(merged).not.toBe(base); // must be a copy, not the same reference
  });
});
