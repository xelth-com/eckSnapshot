# Release v5.0.3 - Major Feature Update

## 🎯 Highlights

This release introduces powerful incremental update capabilities and discontinues npm publishing in favor of GitHub-only distribution.

---

## 🆕 New Features

### 1. **Incremental Updates with `update` Command**

The most significant addition - create delta snapshots containing only changed files since your last full snapshot.

**How it works:**
- Automatically tracks git anchor point from your last snapshot
- Detects all modified, added, or deleted files
- Generates compact update snapshots with full git diff
- Perfect for iterative AI-assisted development workflows

**Usage:**
```bash
# Create a full snapshot first
eck-snapshot

# Make changes to your code...

# Generate update with only changes
eck-snapshot update
```

**Benefits:**
- 📉 Drastically smaller snapshot sizes for active development
- 🔄 Keep AI synchronized with latest code without re-uploading everything
- ⚡ Essential for large projects where full snapshots are huge
- 🎯 AI gets clear merge instructions automatically

### 2. **Complete AI Development Cycle**

Full workflow support from initial analysis to iterative development:

**Step 1: Initial Snapshot**
```bash
eck-snapshot --skeleton
```
Creates compressed overview of entire project.

**Step 2: Lazy Loading**
```bash
eck-snapshot show src/auth.js src/utils/hash.js
```
Load specific implementation details on-demand.

**Step 3: Incremental Updates**
```bash
eck-snapshot update
```
Send only what changed after each development iteration.

**Step 4: Repeat**
Continue the cycle - modify code, generate updates, sync with AI.

### 3. **MiniMax M2.1 Integration**

Two integration modes for cost-effective AI assistance:

**Supervisor-Worker Mode (Hybrid):**
- Claude Code supervises, MiniMax handles heavy lifting
- [Setup Guide](./MINIMAX_INTEGRATION.md#method-1-supervisor-worker-mode-hybrid-architecture)

**Standalone Mode:**
- Direct MiniMax usage for batch processing
- [Setup Guide](./MINIMAX_INTEGRATION.md#method-2-standalone-mode-direct-minimax-usage)

Complete documentation:
- [`MINIMAX_INTEGRATION.md`](./MINIMAX_INTEGRATION.md) - Full integration guide
- [`docs/minimax-quickref.md`](./docs/minimax-quickref.md) - Quick reference
- [`docs/minimax-change-api-key.md`](./docs/minimax-change-api-key.md) - API key management
- [`test-minimax.sh`](./test-minimax.sh) - Integration test script

---

## 📦 Distribution Changes

### ⚠️ NPM Publishing Discontinued

We've stopped publishing to npm due to excessive security requirements (constant token revocations, forced 2FA, 90-day token limits).

**All future updates will be released exclusively on GitHub.**

### New Installation Method

**Install from GitHub:**
```bash
npm install -g github:xelth-com/eckSnapshot
```

**Or clone and link:**
```bash
git clone https://github.com/xelth-com/eckSnapshot.git
cd eckSnapshot
npm install
npm link
```

---

## 🔧 Improvements

- `.eck` directory now visible in tree output with controlled recursion
- Fixed agent filtering logic for Senior Architect snapshots
- Restored full content for JAS/JAO snapshots
- Fixed header interpolation in snapshot generation
- Package.json corrections applied

---

## 📚 Documentation

- Updated README with GitHub-only installation instructions
- Added bilingual notice (EN/RU) about npm discontinuation
- Comprehensive MiniMax integration guides
- Quick reference cards for common workflows

---

## 🔗 Links

- **GitHub Repository:** https://github.com/xelth-com/eckSnapshot
- **Installation:** `npm install -g github:xelth-com/eckSnapshot`
- **Full Documentation:** [README.md](./README.md)
- **MiniMax Guide:** [MINIMAX_INTEGRATION.md](./MINIMAX_INTEGRATION.md)

---

## 📈 Upgrade Path

If you previously installed from npm:

```bash
# Uninstall old npm version
npm uninstall -g @xelth/eck-snapshot

# Install from GitHub
npm install -g github:xelth-com/eckSnapshot
```

---

## 🙏 Thank You

Thank you for using eckSnapshot! All future updates and support will continue through GitHub.

For issues, feature requests, or contributions, please visit:
https://github.com/xelth-com/eckSnapshot/issues
