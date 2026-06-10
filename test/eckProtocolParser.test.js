import { describe, it, expect } from 'vitest';
import { parseProfileTags, parseEckResponse, validateEckResponse } from '../src/utils/eckProtocolParser.js';

/**
 * Eck-Protocol Processing Verification Suite.
 * Explains WHY it exists: Protects tag tokenization pipelines, multi-attribute alignment properties,
 * and line-anchored tag termination safety parameters against regression bugs. The defects pinned
 * here (close-tag-in-content truncation, attribute-order rigidity, quad-backtick fences) each
 * silently corrupted agent payloads before the 2026-06-10 parser hardening.
 */
describe('Eck-Protocol Parsing Robustness', () => {
  it('should extract context profiles with line attribute tolerance', () => {
    const responseMarkup = `
<profile name="api-slice">
# Description
Backend context endpoint mapping.

# Include
- src/api/**/*
- core/engine/**/*
</profile>
    `;
    const profiles = parseProfileTags(responseMarkup);
    expect(profiles['api-slice']).toBeDefined();
    expect(profiles['api-slice'].description).toContain('Backend context');
    expect(profiles['api-slice'].include).toContain('src/api/**/*');
    expect(profiles['api-slice'].include).toHaveLength(2);
  });

  it('should not truncate profile descriptions at unknown #-prefixed lines', () => {
    const markup = '<profile name="x">\n# Description\nUses #pragma style lines.\nStill description.\n# Include\n- src/**\n</profile>';
    const profiles = parseProfileTags(markup);
    expect(profiles.x.description).toContain('Still description');
    expect(profiles.x.include).toEqual(['src/**']);
  });

  it('should omit the exclude key when the Exclude section is absent or empty', () => {
    const markup = '<profile name="lean">\n# Description\nd\n# Include\n- a/**\n</profile>';
    const profiles = parseProfileTags(markup);
    expect(profiles.lean.exclude).toBeUndefined();
  });

  it('should cleanly parse file actions regardless of attribute sequence order', () => {
    const payload = `
<file action="modify" path="src/cli.js">
\`\`\`javascript
const test = true;
\`\`\`
</file>
    `;
    const result = parseEckResponse(payload);
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe('src/cli.js');
    expect(result.files[0].action).toBe('modify');
    expect(result.files[0].content).toBe('const test = true;');
  });

  it('should not terminate a file block at a literal </file> inside content', () => {
    const payload = '<file path="doc.md" action="create">\nThe tag </file> appears mid-line here.\nMore content.\n</file>';
    const result = parseEckResponse(payload);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toContain('appears mid-line');
    expect(result.files[0].content).toContain('More content');
  });

  it('should strip quadruple-backtick fences while preserving inner triple fences', () => {
    const payload = '<file path="b.md" action="create">\n````markdown\nUse ```js blocks``` inside.\n````\n</file>';
    const result = parseEckResponse(payload);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toContain('```js');
    expect(result.files[0].content.startsWith('`')).toBe(false);
  });

  it('should default the action to "replace" when the attribute is omitted', () => {
    const result = parseEckResponse('<file path="c.js">\nlet y;\n</file>');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].action).toBe('replace');
  });

  it('should parse single-line empty tags (delete actions)', () => {
    const result = parseEckResponse('<file path="old.js" action="delete"></file>');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].action).toBe('delete');
    expect(result.files[0].content).toBe('');
  });

  it('should keep parsing the legacy canonical format (regression)', () => {
    const result = parseEckResponse('<file path="legacy.js" action="replace">\n```javascript\nconst z = 3;\n```\n</file>');
    expect(result.files).toHaveLength(1);
    expect(result.files[0].content).toBe('const z = 3;');
  });

  it('should extract multiple files from one payload in order', () => {
    const payload = '# Analysis\ntext\n\n<file path="one.js" action="create">\na\n</file>\n\n<file path="two.js" action="modify">\nb\n</file>';
    const result = parseEckResponse(payload);
    expect(result.files).toHaveLength(2);
    expect(result.files.map(f => f.path)).toEqual(['one.js', 'two.js']);
    expect(result.files[1].action).toBe('modify');
  });

  it('should validate line-anchored tag boundaries without quoting false-positives', () => {
    const documentWithExamples = `
Some general introductory statement here.
  <file path="example.js">
  This is an embedded code block snippet layout example.
  </file>
    `;
    const validation = validateEckResponse(documentWithExamples);
    expect(validation.hasFiles).toBe(true);
    expect(validation.valid).toBe(true);
  });

  it('should not count mid-line quoted tag examples as structural tags', () => {
    const doc = '<file path="doc.md" action="create">\nExample: use <file path="x"> tags (quoted mid-line)\n</file>';
    const validation = validateEckResponse(doc);
    expect(validation.valid).toBe(true);
  });
});
