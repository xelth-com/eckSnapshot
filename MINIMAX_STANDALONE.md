# MiniMax Standalone Setup

**For those who want to use MiniMax directly, without Claude Code**

## Why Use This?

If you don't have a Claude Pro subscription, or you want to use only MiniMax for coding tasks, this guide is for you.

## Installation

### 1. Get a MiniMax API Key
1. Register at [MiniMax Platform](https://platform.minimax.io/)
2. Obtain your API key
3. Add to your `.bashrc` or `.zshrc`:
   ```bash
   export MINIMAX_API_KEY="sk-..."
   ```
4. Reload your terminal or run:
   ```bash
   source ~/.bashrc
   ```

### 2. Install the Anthropic SDK

MiniMax is compatible with the Anthropic API, so we use the official SDK:

```bash
npm install -g @anthropic-ai/sdk
```

### 3. Create the `minimax-cli.js` Script

Create a file in a convenient location (e.g., `~/bin/minimax-cli.js`):

```javascript
#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/anthropic'
});

const prompt = process.argv.slice(2).join(' ');

if (!prompt) {
  console.error('Usage: minimax-cli <your prompt>');
  process.exit(1);
}

async function chat() {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  console.log(message.content[0].text);
}

chat().catch(console.error);
```

### 4. Make the Script Executable

```bash
chmod +x ~/bin/minimax-cli.js
```

### 5. Add an Alias (Optional)

Add to your `.bashrc` or `.zshrc`:

```bash
alias minimax="node ~/bin/minimax-cli.js"
```

## Usage

### Simple Query
```bash
minimax "Explain what a Promise is in JavaScript"
```

### For Coding Tasks
```bash
minimax "Write a function for email validation"
```

### With Project Context (using eck-snapshot)
```bash
# 1. Create a snapshot
eck-snapshot --skeleton > snapshot.md

# 2. Send the snapshot to MiniMax (via web interface or extended script)
```

## Advanced Version with File Input

Create `minimax-with-file.js`:

```javascript
#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';

const client = new Anthropic({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/anthropic'
});

const args = process.argv.slice(2);
let prompt = '';

// Если передан флаг --file, читаем файл
const fileIndex = args.indexOf('--file');
if (fileIndex !== -1 && args[fileIndex + 1]) {
  const fileContent = await fs.readFile(args[fileIndex + 1], 'utf-8');
  prompt = fileContent + '\n\n' + args.filter((_, i) => i !== fileIndex && i !== fileIndex + 1).join(' ');
} else {
  prompt = args.join(' ');
}

if (!prompt) {
  console.error('Usage: minimax-with-file [--file snapshot.md] <your prompt>');
  process.exit(1);
}

async function chat() {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: prompt
    }]
  });

  console.log(message.content[0].text);
}

chat().catch(console.error);
```

### Using with Files:
```bash
eck-snapshot --skeleton -o snapshot.md
minimax-with-file --file snapshot.md "Analyze the architecture and suggest improvements"
```

## Limitations

- No interactive mode (each request is a separate call)
- No session history
- For complex tasks, the Supervisor-Worker mode with Claude Code is recommended

## Advantages

✅ No Claude Pro subscription required
✅ Cheaper than Claude API
✅ Large context window (200K tokens)
✅ Fast responses

## Cost Comparison

| Model | Price (input) | Price (output) |
|-------|---------------|----------------|
| MiniMax M2.1 | $0.15/1M tokens | $0.60/1M tokens |
| Claude Sonnet 4 | $3.00/1M tokens | $15.00/1M tokens |

**Savings: up to 20x cheaper!**
