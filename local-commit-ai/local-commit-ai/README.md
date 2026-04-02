<h1 align="center">Local Commit AI</h1>

<p align="center">
  AI-powered git commit messages — fully local, fast, and private.<br/>
  No API keys &bull; No cloud &bull; No data leaving your machine
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=rahul-devlocal-commit-ai.local-commit-ai">
    <img src="https://img.shields.io/visual-studio-marketplace/v/rahul-devlocal-commit-ai.local-commit-ai?style=flat&label=VS%20Marketplace&logo=visualstudiocode&color=blue" />
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=rahul-devlocal-commit-ai.local-commit-ai">
    <img src="https://img.shields.io/visual-studio-marketplace/d/rahul-devlocal-commit-ai.local-commit-ai?style=flat&label=Installs&color=brightgreen" />
  </a>
  <img src="https://img.shields.io/badge/Ollama-Local%20LLM-black?style=flat" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/demo/logo.png" alt="Local Commit AI" width="600" />
</p>

---

## Overview

Local Commit AI generates meaningful, [Conventional Commits](https://www.conventionalcommits.org/)-formatted git commit messages using a **local LLM via [Ollama](https://ollama.com)**. Everything runs on your machine — no network requests, no API keys, no telemetry.

![Demo](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/demo/demo.gif)

---

## Features

- Analyzes staged and unstaged git diffs to generate structured commit messages
- Follows the [Conventional Commits](https://www.conventionalcommits.org/) specification
- One-click insertion into VS Code's Source Control input
- **Tweak it** — refine the generated message with quick options or a custom instruction
- **Generate PR Description** — creates a structured pull request description from your branch's commits and diff against `main`
- Runs entirely locally via Ollama — works offline
- Customizable prompt templates
- Compatible with any Ollama model (default: `llama3.1`)

---

## Screenshots

### Commit Message Generation

| | |
|---|---|
| ![Source Control panel](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/screenshots/menu1.png) | ![Toolbar button](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/screenshots/menu2.png) |
| _Staged changes ready_ | _Generate button_ |
| ![Generated message](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/screenshots/menu3.png) | |
| _Message inserted_ | |

### PR Description Generation

| | |
|---|---|
| ![PR command](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/screenshots/pr1.png) | ![Generating PR description](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/screenshots/pr2.png) |
| _Run "Generate PR Description" from the Command Palette_ | _Ollama processes commits and diff locally_ |
| ![PR description ready](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/screenshots/pr3.png) | ![Copy or open in editor](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/screenshots/pr4.png) |
| _Description generated — choose to copy or open_ | _Open as a Markdown document in the editor_ |
| ![PR description in editor](https://raw.githubusercontent.com/rahrajlat/vscode-local-commit-ai/main/local-commit-ai/local-commit-ai/screenshots/pr5.png) | |
| _Structured PR description ready to paste_ | |

---

## Download

https://marketplace.visualstudio.com/items?itemName=rahul-devlocal-commit-ai.local-commit-ai

---

## Requirements

- [Ollama](https://ollama.com) installed and running locally
- At least one model pulled (e.g., `ollama pull llama3.1`)
- A git repository open in VS Code

---

## Installation

**VS Code Marketplace**

Search for **Local Commit AI** in the Extensions panel, or install directly from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rahul-devlocal-commit-ai.local-commit-ai&ssr=false#overview).

**Manual install from `.vsix`**

Download the latest release from [Releases](https://github.com/RahulRajasekharan/local-commit-ai/releases), then go to Extensions → `...` → **Install from VSIX**.

---

## Quick Start

1. Install [Ollama](https://ollama.com) and pull a model:
   ```
   ollama pull llama3.1
   ```
2. Ensure Ollama is running (typically starts automatically at `http://localhost:11434`).
3. Open a git repository in VS Code and stage your changes.
4. Click the **Generate Commit Message** button in the Source Control toolbar.
5. Review the generated message and commit.

---

## Configuration

| Setting | Default | Description |
|---|---|---|
| `localCommitAI.ollamaHost` | `http://localhost:11434` | Ollama server URL |
| `localCommitAI.model` | `llama3.1` | Model to use for generation |
| `localCommitAI.maxFiles` | `20` | Maximum number of changed files before generation is blocked |
| `localCommitAI.promptTemplate` | `""` | Custom prompt template (use `{{diff}}` as the diff placeholder) |

---

## Commands

| Command | Description |
|---|---|
| **Generate Commit Message** | Generates a message from the current diff; prompts for confirmation if a message already exists |
| **Regenerate Commit Message** | Always regenerates, overwriting any existing message without prompting |
| **Generate PR Description** | Generates a structured PR description from all commits and the diff between your branch and `main` |

Commands are accessible from the Source Control toolbar or the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).

### Generate PR Description

Run **Generate PR Description** from the Command Palette to automatically create a pull request description based on your branch's commit history and full diff against `main`. The generated description follows this structure:

- **What changed** — a concise summary of what was modified
- **Why** — the motivation or context behind the change
- **Changes** — a bullet list of specific changes made
- **Testing** — how the changes were tested

Once generated, you can **Copy to clipboard** to paste directly into GitHub/GitLab, or **Open in editor** to view and edit the Markdown before using it.

### Tweaking a message

After a message is generated, a **Tweak it** button appears. Clicking it opens a quick-pick menu with preset options:

- Make it shorter
- Add more detail
- Change type to `feat`, `fix`, `refactor`, or `chore`
- Custom — type your own instruction

The message is regenerated based on your feedback, and you can keep tweaking until you're satisfied.

---

## Commit Format

Generated messages follow this structure:

```
<type>: <summary>

- detail 1
- detail 2
```

**Supported types:** `feat`, `fix`, `refactor`, `chore`

---

## Troubleshooting

| Issue | Solution |
|---|---|
| "Ollama request failed" | Ensure `ollama serve` is running; verify the host URL in settings and run `ollama list` |
| "No Git repo found" | Open a folder that contains a `.git` directory |
| "No changes found" | Stage files or ensure unstaged changes are present |
| "Too many files changed" | Increase `localCommitAI.maxFiles` or reduce the number of staged files |
| Poor commit quality | Try a larger model or provide a custom `promptTemplate` |

---

## Privacy

All processing happens locally on your machine. Your code and diffs are never transmitted to any external service.

---

## License

[MIT](LICENSE)
