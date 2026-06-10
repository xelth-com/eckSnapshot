/**
 * Eck-Protocol Parser
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
 * Parses Eck-Protocol response from an agent.
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
 * Parses XML-like tag attributes in any order.
 * Explains WHY it exists: the previous <file> regex required path-then-action in that
 * exact order, so `<file action="..." path="...">` silently failed to parse and the
 * agent's payload was treated as plain text.
 * @param {string} attrStr - The raw attribute portion of an opening tag
 * @returns {Object<string, string>} Attribute name → value map
 */
function parseTagAttributes(attrStr) {
  const attrs = {};
  const re = /(\w+)\s*=\s*["']([^"']*)["']/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

/**
 * Extracts file changes from <file> tags.
 * Tags are anchored to line starts so a literal `</file>` appearing inside file
 * content (e.g. files documenting the protocol itself) no longer terminates the
 * block early. Attributes may appear in any order; `action` defaults to "replace".
 * Fence stripping honors the protocol's quadruple-backtick convention via a
 * backreference, so ````-wrapped code keeps embedded ``` fences intact.
 * @param {string} text - Raw text
 * @returns {Array<{path: string, action: string, content: string}>}
 */
function extractFiles(text) {
  const files = [];

  // Multiline blocks: opening and closing tags each on their own line
  const fileRegex = /^[ \t]*<file\b([^>]*)>[ \t]*\r?\n([\s\S]*?)^[ \t]*<\/file>[ \t]*$/gim;
  // Single-line empty blocks: <file ... ></file> (e.g. delete actions)
  const emptyRegex = /^[ \t]*<file\b([^>]*)><\/file>[ \t]*$/gim;

  const collect = (attrStr, rawContent) => {
    const attrs = parseTagAttributes(attrStr);
    if (!attrs.path) return;

    let content = rawContent.trim();
    // Strip markdown code fences if present; \1 backreference keeps 3- and 4-backtick
    // fences symmetric (protocol uses ```` to wrap code containing ```)
    const fenceMatch = content.match(/^(`{3,4})[\w-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*\1$/);
    if (fenceMatch) {
      content = fenceMatch[2];
    }

    content = content.replace(/\r\n/g, '\n');
    files.push({ path: attrs.path, action: attrs.action || 'replace', content });
  };

  let match;
  while ((match = fileRegex.exec(text)) !== null) {
    collect(match[1], match[2]);
  }
  while ((match = emptyRegex.exec(text)) !== null) {
    collect(match[1], '');
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
  const fileIndex = text.search(/^[ \t]*<file\b/im);

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
 * Parses Eck-Protocol (Profile Variant) <profile> tags into a profiles.json-shaped object.
 * WHY: `generate-profile-guide` instructs external LLMs to answer with <profile> markup
 * instead of raw JSON (avoids escaping issues, consistent with the house protocol). This
 * parser is the receiving end: it converts that markup back into the exact structure
 * stored in `.eck/profiles.json`, closing the guide → LLM → import round-trip.
 * @param {string} text - Raw LLM response containing <profile name="..."> blocks
 * @returns {Object<string, {description: string, include: string[], exclude?: string[]}>}
 */
export function parseProfileTags(text) {
  const profiles = {};
  if (!text || typeof text !== 'string') {
    return profiles;
  }

  const profileRegex = /<profile\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/profile>/gi;
  let match;
  while ((match = profileRegex.exec(text)) !== null) {
    const name = match[1].trim();
    const body = match[2];

    const description = extractSectionText(body, 'Description');
    const include = extractSectionList(body, 'Include');
    const exclude = extractSectionList(body, 'Exclude');

    const profile = { description, include };
    if (exclude.length > 0) {
      profile.exclude = exclude;
    }
    profiles[name] = profile;
  }

  return profiles;
}

/**
 * Extracts the text under a markdown heading inside a profile body.
 * The section terminator is restricted to the protocol's KNOWN headings
 * (Description/Include/Exclude) so a stray `#`-prefixed line inside a
 * description no longer truncates the section.
 * @param {string} body - Profile tag inner content
 * @param {string} heading - Heading name (e.g. "Description")
 * @returns {string} Trimmed section text, or '' if the section is absent
 */
function extractSectionText(body, heading) {
  const m = body.match(new RegExp(
    `#{1,3}\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s*(?:Description|Include|Exclude)\\b|$)`,
    'i'
  ));
  return m ? m[1].trim() : '';
}

/**
 * Extracts a bullet list under a markdown heading as an array of patterns.
 * Lenient: accepts "-" or "*" bullets as well as bare lines.
 * @param {string} body - Profile tag inner content
 * @param {string} heading - Heading name (e.g. "Include")
 * @returns {string[]} List entries with bullet markers stripped
 */
function extractSectionList(body, heading) {
  const raw = extractSectionText(body, heading);
  if (!raw) return [];
  return raw
    .split('\n')
    .map(line => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter(line => line && !line.startsWith('#'));
}

/**
 * Validates if a response contains valid Eck-Protocol structure.
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

  // Line-anchored counting: protocol examples quoted INSIDE file content used to
  // inflate the counts and produce bogus "mismatched tags" errors.
  const openTags = (text.match(/^[ \t]*<file\b/gim) || []).length;
  const closeTags = (text.match(/^[ \t]*<\/file>|<file\b[^>]*><\/file>[ \t]*$/gim) || []).length;
  if (openTags > 0) {
    result.hasFiles = true;
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
  parseProfileTags,
  validateEckResponse,
  parseWithFallback
};
