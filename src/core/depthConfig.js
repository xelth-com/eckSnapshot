/**
 * Shared depth configuration for link and scout commands.
 * Scale: 0-9
 *
 * @param {number} depth - Depth level (0-9)
 * @returns {object} Configuration object with mode settings
 */
export function getDepthConfig(depth) {
  const d = Math.max(0, Math.min(9, parseInt(depth, 10) || 0));

  if (d === 0) {
    return { mode: 'tree', skipContent: true };
  }

  if (d >= 1 && d <= 4) {
    const linesMap = { 1: 10, 2: 30, 3: 60, 4: 100 };
    return { mode: 'truncated', maxLinesPerFile: linesMap[d], skeleton: false };
  }

  if (d === 5) {
    return { mode: 'skeleton', skeleton: true, preserveDocs: false, maxLinesPerFile: 0 };
  }

  if (d === 6) {
    return { mode: 'skeleton+docs', skeleton: true, preserveDocs: true, maxLinesPerFile: 0 };
  }

  if (d === 7) {
    return { mode: 'full', skeleton: false, maxLinesPerFile: 500 };
  }

  if (d === 8) {
    return { mode: 'full', skeleton: false, maxLinesPerFile: 1000 };
  }

  // d === 9
  return { mode: 'full', skeleton: false, maxLinesPerFile: 0 };
}

/**
 * Human-readable depth scale table for documentation/headers.
 */
export const DEPTH_SCALE = [
  { depth: 0, mode: 'Tree only',        description: 'Directory structure, no file contents' },
  { depth: 1, mode: 'Truncated 10',     description: '10 lines per file (imports/header)' },
  { depth: 2, mode: 'Truncated 30',     description: '30 lines per file' },
  { depth: 3, mode: 'Truncated 60',     description: '60 lines per file' },
  { depth: 4, mode: 'Truncated 100',    description: '100 lines per file' },
  { depth: 5, mode: 'Skeleton',         description: 'Function/class signatures only' },
  { depth: 6, mode: 'Skeleton + docs',  description: 'Signatures + docstrings/comments' },
  { depth: 7, mode: 'Full (compact)',   description: 'Full content, truncated at 500 lines' },
  { depth: 8, mode: 'Full (standard)',  description: 'Full content, truncated at 1000 lines' },
  { depth: 9, mode: 'Full (unlimited)', description: 'Everything, no limits' },
];
