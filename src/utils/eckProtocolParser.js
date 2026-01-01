/**
 * Eck-Protocol v2 Parser
 *
 * Parses hybrid Markdown/XML/JSON format for agent communication.
 * This is a pure text parser - no shell commands are involved.
 *
 * Format specification:
 * - Markdown for human-readable analysis/thinking
 * - XML-like <file> tags for code changes (with code in standard fences)
 * - JSON in fenced blocks for structured metadata
 */

/**
 * Parses Eck-Protocol v2 response from an agent.
 * @param {string} text - Raw text response from the agent
 * @returns {object} Parsed structure with thought, files, and metadata
 */
export function parseEckResponse(text) {
  const result = {
    thought: '',
    files: [],
    metadata: {},
    raw: text
  };

  if (!text || typeof text !== 'string') {
    return result;
  }

  result.files = extractFiles(text);
  result.metadata = extractMetadata(text);
  result.thought = extractThought(text);

  return result;
}

/**
 * Extracts file changes from <file> tags.
 * @param {string} text - Raw text
 * @returns {Array<{path: string, action: string, content: string}>}
 */
function extractFiles(text) {
  const files = [];

  // Pattern: <file path="..." action="..."> content </file>
  const fileRegex = /<file\s+path=["']([^"']+)["']\s+action=["']([^"']+)["']>\s*([\s\S]*?)\s*<\/file>/gi;

  let match;
  while ((match = fileRegex.exec(text)) !== null) {
    const path = match[1];
    const action = match[2];
    let content = match[3].trim();

    // Strip markdown code fences if present
    const fenceMatch = content.match(/^```[\w]*\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) {
      content = fenceMatch[1];
    }

    content = content.replace(/\r\n/g, '\n');
    files.push({ path, action, content });
  }

  return files;
}

/**
 * Extracts metadata from JSON fenced blocks.
 * @param {string} text - Raw text
 * @returns {object} Parsed metadata object
 */
function extractMetadata(text) {
  let metadata = {};

  // Try: ## Metadata section with JSON block
  const metadataSectionMatch = text.match(/##\s*Metadata\s*\n+```json\s*\n([\s\S]*?)\n```/i);
  if (metadataSectionMatch) {
    try {
      metadata = JSON.parse(metadataSectionMatch[1].trim());
      return metadata;
    } catch (e) {
      console.warn('Failed to parse Metadata JSON:', e.message);
    }
  }

  // Try: <journal> tag with JSON
  const journalMatch = text.match(/<journal>\s*```json\s*\n?([\s\S]*?)\n?\s*```\s*<\/journal>/i);
  if (journalMatch) {
    try {
      metadata.journal = JSON.parse(journalMatch[1].trim());
      return metadata;
    } catch (e) {
      console.warn('Failed to parse journal JSON:', e.message);
    }
  }

  // Try: simple <journal type="..." scope="...">summary</journal>
  const simpleJournalMatch = text.match(/<journal\s+type=["']([^"']+)["']\s+scope=["']([^"']+)["']>([^<]+)<\/journal>/i);
  if (simpleJournalMatch) {
    metadata.journal = {
      type: simpleJournalMatch[1],
      scope: simpleJournalMatch[2],
      summary: simpleJournalMatch[3].trim()
    };
  }

  return metadata;
}

/**
 * Extracts the thought/analysis section.
 * @param {string} text - Raw text
 * @returns {string} The thought/analysis content
 */
function extractThought(text) {
  const changesIndex = text.search(/##\s*Changes/i);
  const fileIndex = text.search(/<file\s+path=/i);

  let endIndex = text.length;
  if (changesIndex !== -1 && fileIndex !== -1) {
    endIndex = Math.min(changesIndex, fileIndex);
  } else if (changesIndex !== -1) {
    endIndex = changesIndex;
  } else if (fileIndex !== -1) {
    endIndex = fileIndex;
  }

  let thought = text.substring(0, endIndex).trim();
  thought = thought.replace(/^#\s*(Analysis|Thinking|Plan)\s*\n*/i, '').trim();
  return thought;
}

/**
 * Validates if a response contains valid Eck-Protocol v2 structure.
 * @param {string} text - Raw text to validate
 * @returns {{valid: boolean, hasFiles: boolean, hasMetadata: boolean, errors: string[]}}
 */
export function validateEckResponse(text) {
  const result = {
    valid: true,
    hasFiles: false,
    hasMetadata: false,
    errors: []
  };

  if (!text || typeof text !== 'string') {
    result.valid = false;
    result.errors.push('Response is empty or not a string');
    return result;
  }

  const hasFileTags = /<file\s+path=/.test(text);
  if (hasFileTags) {
    result.hasFiles = true;
    const openTags = (text.match(/<file\s+/g) || []).length;
    const closeTags = (text.match(/<\/file>/g) || []).length;
    if (openTags !== closeTags) {
      result.valid = false;
      result.errors.push(`Mismatched file tags: ${openTags} opening, ${closeTags} closing`);
    }
  }

  const hasMetadata = /##\s*Metadata|<journal/i.test(text);
  if (hasMetadata) {
    result.hasMetadata = true;
  }

  return result;
}

/**
 * Parses response with fallback to legacy JSON format.
 * @param {string} text - Raw response text
 * @returns {object} Parsed result with format indicator
 */
export function parseWithFallback(text) {
  const validation = validateEckResponse(text);

  if (validation.hasFiles || validation.hasMetadata) {
    const parsed = parseEckResponse(text);
    return { format: 'eck-v2', ...parsed };
  }

  // Fallback: try to parse as JSON
  try {
    const jsonMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[1]);
      return {
        format: 'legacy-json',
        thought: text.split('```json')[0].trim(),
        data: jsonData,
        files: [],
        metadata: {}
      };
    }

    const jsonData = JSON.parse(text.trim());
    return {
      format: 'pure-json',
      thought: '',
      data: jsonData,
      files: [],
      metadata: {}
    };
  } catch (e) {
    return {
      format: 'plain-text',
      thought: text,
      files: [],
      metadata: {},
      raw: text
    };
  }
}

export default {
  parseEckResponse,
  validateEckResponse,
  parseWithFallback
};
