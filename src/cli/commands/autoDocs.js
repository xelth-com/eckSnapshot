import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Auto-generate documentation from gemini-extension.json files
 */
export async function generateAutoDocs() {
  try {
    const projectRoot = path.resolve(__dirname, '../../../');
    const extensionsDir = path.join(projectRoot, 'packages/cli/src/commands/extensions');
    const referenceFile = path.join(projectRoot, 'COMMANDS_REFERENCE.md');

    // Check if extensions directory exists
    try {
      await fs.access(extensionsDir);
    } catch (error) {
      console.log(`Extensions directory not found at: ${extensionsDir}`);
      console.log('Creating example structure...');

      // Create the directory structure
      await fs.mkdir(extensionsDir, { recursive: true });

      // Create a sample gemini-extension.json file for demonstration
      const sampleExtension = {
        name: "sample-extension",
        description: "Sample Gemini extension for demonstration",
        commands: [
          {
            name: "sample-command",
            description: "A sample command for testing auto-docs",
            usage: "sample-command [options]",
            examples: ["sample-command --help"]
          }
        ],
        tools: [
          {
            name: "sample-tool",
            description: "A sample tool for testing auto-docs",
            usage: "Use this tool for sample operations"
          }
        ]
      };

      await fs.writeFile(
        path.join(extensionsDir, 'sample-extension.json'),
        JSON.stringify(sampleExtension, null, 2)
      );

      console.log('Created sample extension at:', path.join(extensionsDir, 'sample-extension.json'));
    }

    // Read all JSON files in the extensions directory
    const files = await fs.readdir(extensionsDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('No JSON files found in extensions directory');
      return;
    }

    console.log(`Found ${jsonFiles.length} extension file(s): ${jsonFiles.join(', ')}`);

    // Parse each JSON file and extract command/tool information
    const extensions = [];

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(extensionsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const extension = JSON.parse(content);
        extensions.push({ filename: file, ...extension });
        console.log(`Parsed extension: ${extension.name || file}`);
      } catch (error) {
        console.warn(`Failed to parse ${file}:`, error.message);
      }
    }

    if (extensions.length === 0) {
      console.log('No valid extension files found');
      return;
    }

    // Generate markdown content
    let markdownContent = '\n## Auto-Generated Gemini Extensions\n\n';
    markdownContent += '*This section is automatically generated. Run `npm run docs:auto` to update.*\n\n';

    for (const extension of extensions) {
      markdownContent += `### ${extension.name || extension.filename}\n\n`;

      if (extension.description) {
        markdownContent += `${extension.description}\n\n`;
      }

      // Add commands section
      if (extension.commands && extension.commands.length > 0) {
        markdownContent += '**Commands:**\n\n';
        for (const command of extension.commands) {
          markdownContent += `- **${command.name}**: ${command.description || 'No description'}\n`;
          if (command.usage) {
            markdownContent += `  - Usage: \`${command.usage}\`\n`;
          }
          if (command.examples && command.examples.length > 0) {
            markdownContent += `  - Examples: ${command.examples.map(ex => `\`${ex}\``).join(', ')}\n`;
          }
        }
        markdownContent += '\n';
      }

      // Add tools section
      if (extension.tools && extension.tools.length > 0) {
        markdownContent += '**Tools:**\n\n';
        for (const tool of extension.tools) {
          markdownContent += `- **${tool.name}**: ${tool.description || 'No description'}\n`;
          if (tool.usage) {
            markdownContent += `  - Usage: ${tool.usage}\n`;
          }
        }
        markdownContent += '\n';
      }
    }

    // Read the current COMMANDS_REFERENCE.md
    let currentContent;
    try {
      currentContent = await fs.readFile(referenceFile, 'utf-8');
    } catch (error) {
      console.warn('COMMANDS_REFERENCE.md not found, creating new file');
      currentContent = '# Commands Reference\n\n';
    }

    // Remove existing auto-generated section if it exists
    const autoGenRegex = /\n## Auto-Generated Gemini Extensions[\s\S]*?(?=\n## |\n# |$)/;
    const updatedContent = currentContent.replace(autoGenRegex, '') + markdownContent;

    // Write the updated content back to the file
    await fs.writeFile(referenceFile, updatedContent);

    console.log('\n✅ Auto-documentation generated successfully!');
    console.log(`📝 Updated: ${referenceFile}`);
    console.log(`📦 Processed ${extensions.length} extension(s)`);

  } catch (error) {
    console.error('Failed to generate auto-docs:', error.message);
    process.exit(1);
  }
}