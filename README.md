
# Local Commit AI

![Banner](demo/logo.png)

Generate meaningful, conventional git commit messages using a **local LLM via [Ollama](https://ollama.com)** — no cloud, no API keys, no data leaving your machine.

## Features

- Analyzes staged/unstaged git diffs and generates structured commit messages
- Follows [Conventional Commits](https://www.conventionalcommits.org/) format
- One-click insertion into VS Code's Source Control input
- Runs entirely locally with Ollama
- Customizable prompt templates
- Works with any Ollama model (default: `llama3.1`)

![Demo](demo/demo.gif)

## Screenshots

| | |
|---|---|
| ![Source Control panel](screenshots/menu1.png) | ![Toolbar button](screenshots/menu2.png) |
| _Staged changes ready_ | _Generate button_ |
| ![Generated message](screenshots/menu3.png) | |
| _Message inserted_ | |

## Requirements

- [Ollama](https://ollama.com) installed and running
- At least one model pulled (e.g., `llama3.1`)
- Git repository in VS Code

## Installation

**VS Code Marketplace:** Search for "Local Commit AI" in Extensions and install.

**From `.vsix`:** Download from [Releases](https://github.com/RahulRajasekharan/local-commit-ai/releases), then Extensions → `...` → Install from VSIX.

## Quick Start

1. Install [Ollama](https://ollama.com) and pull a model: `ollama pull llama3.1`
2. Run `ollama serve` (typically runs automatically at `http://localhost:11434`)
3. Stage changes in VS Code's Source Control panel
4. Click **Generate Commit Message** button
5. Review and commit

## Configuration

| Setting | Default | Description |
|---|---|---|
| `localCommitAI.ollamaHost` | `http://localhost:11434` | Ollama URL |
| `localCommitAI.model` | `llama3.1` | Model to use |
| `localCommitAI.maxFiles` | `20` | Max changed files before blocking |
| `localCommitAI.promptTemplate` | `""` | Custom prompt (use `{{diff}}` placeholder) |

## Commands

| Command | Description |
|---|---|
| **Generate Commit Message** | Generate from diff; prompts if message exists |
| **Regenerate Commit Message** | Always regenerates without prompting |

Access via Source Control toolbar or Command Palette.

## Commit Format

```
<type>: <summary>

- detail 1
- detail 2
```

**Types:** `feat`, `fix`, `refactor`, `chore`

## Troubleshooting

| Issue | Solution |
|---|---|
| "Ollama request failed" | Run `ollama serve`; check settings URL and `ollama list` |
| "No Git repo found" | Open a folder with `.git` directory |
| "No changes found" | Stage files or use unstaged changes |
| "Too many files changed" | Increase `localCommitAI.maxFiles` or stage fewer files |
| Poor quality | Try a larger model or custom `promptTemplate` |

## Privacy

All processing is local. Code and diffs stay on your machine.

## Development

```bash
git clone <repo-url> && cd local-commit-ai
npm install
npm run compile      # TypeScript
npm run watch        # Watch mode
npm run package      # Build .vsix
```

Press `F5` to test in VS Code.

## License

MIT
