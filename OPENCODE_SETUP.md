# OpenCode Integration with GLM ZAI

## Quick Setup Guide

### 1. Get GLM ZAI API Key
Visit [Z.AI API Console](https://z.ai/manage-apikey/apikey-list) and create an API key.

### 2. Configure OpenCode for GLM ZAI

OpenCode supports Z.AI natively as a model provider. You can configure it in two ways:

#### Option A: Native Integration (Recommended)
Use OpenCode's built-in Z.AI provider. No MCP server needed!

```bash
# Install OpenCode
npm install -g opencode-ai

# Configure Z.AI
opencode auth login
# Select: Z.AI
# Enter your API key
```

#### Option B: MCP Integration (Advanced)
If you want to use GLM ZAI tools via MCP (e.g., for automation), configure OpenCode to use the GLM ZAI MCP server.

```bash
# Create opencode.json manually
cat > opencode.json << 'EOF'
{
  "provider": {
    "opencode": {
      "options": {
        "model": "GLM-4.7",
        "baseURL": "https://api.z.ai/api/anthropic"
      }
    }
  }
}
EOF

# Or use Anthropic SDK in your own MCP server
```

### 3. What's Different?

| Feature | Native Z.AI | MCP Server (Eck-Snapshot) |
|---------|---------------|------------------------|
| Model Selection | ✅ Built-in selector | ⚙️ Manual config |
| Tools | Auto-discovered | 🛠️ Custom tools |
| Complexity | Simple setup | More flexible setup |
| Updates | OpenCode handles | Manual management |
| Cost | Standard pricing | Flexible control |
| Use Case | Daily coding | Automation & AI agents |

**Recommendation:** Use **Native Integration** for most use cases.

### 4. Why MCP Server Was Not Created

The original plan was to create an MCP server (`scripts/mcp-glm-zai-worker.js`) that would register 5 tools (backend, frontend, qa, refactor, general) with OpenCode.

However, we discovered technical incompatibilities:
1. **Node.js v24 + CommonJS**: Node.js v24 treats `.mjs` files as ES modules, not CommonJS
2. **Module resolution**: Conflicts between CommonJS and ES module handling
3. **Complexity**: Setting up an MCP server adds significant complexity
4. **Maintenance**: Custom MCP servers require ongoing maintenance and debugging

### 5. Alternative: Use OpenCode Native Provider

OpenCode has **built-in Z.AI support**. You can simply:
1. Run `opencode auth login` and select Z.AI
2. Set the model to GLM-4.7
3. Start coding

This is simpler, more reliable, and fully supported by the OpenCode team.

### 6. eck-snapshot's Role

Eck-snapshot should focus on:
- ✅ **Snapshot creation and management**
- ✅ **Context organization** (`.eck/` directory)
- ✅ **AI-friendly workflows** (skeleton mode, delta updates)
- ✅ **Git integration** (auto-commit, anchors)

OpenCode handles the:
- ✅ **Model selection and API calls**
- ✅ **Agent configuration** (AGENTS.md with frontmatter)
- ✅ **Tool execution** (file operations, git commands)

### Conclusion

**For most users, the Native Z.AI integration is the best choice.** It's:
- Simpler to set up
- More reliable
- Better maintained
- No additional infrastructure
- Fully supported

The MCP server approach should only be used if you have advanced requirements like:
- Custom tool implementations
- AI agent automation
- Integration with other MCP servers

---

**Next Steps:**
1. Decide between Native Integration or MCP Integration
2. Run `opencode` to start coding with GLM ZAI
3. Use `eck-snapshot` for project context management

See the [eck-snapshot Documentation](README.md) for details on snapshot features.
