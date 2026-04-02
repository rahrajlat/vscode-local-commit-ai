<h1 align="center">Local Commit AI</h1>
<h1 align="center">Local Commit AI</h1>

<p align="center">
  AI-powered git commit messages — fully local, fast, and private.<br/>
  No API keys &bull; No cloud &bull; No data leaving your machine
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=rahul-devlocal-commit-ai.local-commit-ai">
    <img src="https://img.shields.io/visual-studio-marketplace/v/rahul-devlocal-commit-ai.local-commit-ai?label=VS%20Marketplace&style=flat&logo=visualstudiocode&color=blue" />
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=rahul-devlocal-commit-ai.local-commit-ai">
    <img src="https://img.shields.io/visual-studio-marketplace/i/rahul-devlocal-commit-ai.local-commit-ai?style=flat&color=brightgreen&label=Installs" />
  </a>
  <img src="https://img.shields.io/badge/Ollama-Local%20LLM-black?style=flat" />
  <img src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white&style=flat" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat" />
  <img src="https://img.shields.io/badge/PRs-Welcome-orange?style=flat" />
</p>

<p align="center">
  <img src="demo/logo.png" alt="Local Commit AI" width="560" />
</p>

---

## Overview

**Local Commit AI** is a VS Code extension that generates [Conventional Commits](https://www.conventionalcommits.org/)-formatted git commit messages using a **local LLM via [Ollama](https://ollama.com)**. Every step — from diff analysis to message generation — runs entirely on your machine. No telemetry, no API keys, no network requests.

![Demo](demo/demo.gif)

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Commands](#commands)
- [PR Description Generation](#pr-description-generation)
- [Commit Format](#commit-format)
- [Troubleshooting](#troubleshooting)
- [About the Author](#about-the-author)
- [Privacy](#privacy)
- [License](#license)

---

## Features

- **Zero cloud dependency** — runs fully offline via Ollama
- **Staged & unstaged diff support** — analyzes staged changes first, falls back to unstaged with confirmation
- **Conventional Commits output** — structured `<type>: <summary>` with optional bullet-point body
- **One-click insertion** into VS Code's Source Control input box
- **Customizable prompt templates** — override the default prompt for domain-specific instructions
- **Any Ollama model** — works with `llama3.1`, `mistral`, `codellama`, and more
- **File-count guard** — blocks generation if too many files are staged, preventing noisy commits
- **Status bar indicator** — shows active model, clickable to open settings
- **PR description generation** — generates a full GitHub-ready pull request description from your branch commits and diff, with one-click copy or open in editor

---

## Architecture

The extension is a focused single-file TypeScript module that wires together VS Code's Git API, the Ollama HTTP API, and the SCM input box.

```mermaid
graph TD
    subgraph VS_Code["VS Code"]
        SCM["Source Control Panel"]
        GitAPI["Built-in Git Extension API"]
        StatusBar["Status Bar Item"]
        CmdPalette["Command Palette"]
        InputBox["SCM Input Box"]
    end

    subgraph Extension["Local Commit AI Extension"]
        Activate["activate()"]
        CmdGenerate["generateCommit command"]
        CmdRegenerate["regenerateCommit command"]
        RunFlow["runCommitFlow()"]
        GetDiff["getGitDiff()"]
        Generate["generateCommitMessage()"]
        Format["formatCommitMessage()"]
        Clean["cleanText()"]
    end

    subgraph Ollama["Ollama (localhost)"]
        OllamaAPI["/api/chat endpoint"]
        LLM["Local LLM Model"]
    end

    SCM -->|"button click"| CmdGenerate
    SCM -->|"button click"| CmdRegenerate
    CmdPalette -->|"command"| CmdGenerate
    CmdPalette -->|"command"| CmdRegenerate

    Activate --> StatusBar
    Activate --> CmdGenerate
    Activate --> CmdRegenerate

    CmdGenerate --> RunFlow
    CmdRegenerate --> RunFlow

    RunFlow --> GitAPI
    GitAPI --> GetDiff
    GetDiff --> Generate
    Generate -->|"HTTP POST"| OllamaAPI
    OllamaAPI --> LLM
    LLM -->|"JSON response"| Generate
    Generate --> Format
    Format --> Clean
    Clean --> InputBox
```

---

## How It Works

The following sequence diagram shows the full request lifecycle from a user click to a commit message appearing in the input box.

```mermaid
sequenceDiagram
    actor User
    participant SCM as VS Code SCM Panel
    participant Ext as Extension
    participant GitAPI as VS Code Git API
    participant Ollama as Ollama (localhost)

    User->>SCM: Click "Generate Commit Message"
    SCM->>Ext: Trigger localCommitAI.generateCommit

    Ext->>GitAPI: Get repositories
    GitAPI-->>Ext: Repository list

    alt No repository found
        Ext-->>User: Error: "No Git repo found"
    end

    Ext->>GitAPI: Get staged diff
    GitAPI-->>Ext: Staged changes

    alt No staged changes
        Ext->>User: Ask: "Use unstaged changes?"
        User-->>Ext: Confirm / Cancel
        Ext->>GitAPI: Get working-tree diff
    end

    alt Too many files (> maxFiles)
        Ext-->>User: Error: "Too many files changed"
    end

    alt Message already exists (generate, not regenerate)
        Ext->>User: Ask: "Overwrite existing message?"
        User-->>Ext: Confirm / Cancel
    end

    Ext->>Ext: Truncate diff to 8 000 chars
    Ext->>Ext: Build prompt (default or custom template)

    Ext->>Ollama: POST /api/chat with diff + prompt
    Ollama-->>Ext: JSON { type, summary, details[] }

    Ext->>Ext: Parse + clean text (imperative mood, strip periods)
    Ext->>Ext: Normalize commit type (keyword matching)
    Ext->>Ext: Format as Conventional Commit string

    Ext->>SCM: Insert message into SCM input box
    SCM-->>User: Commit message ready to review & commit
```

---

## Requirements

- [Ollama](https://ollama.com) installed and running locally
- At least one model pulled — e.g. `ollama pull llama3.1`
- A git repository open in VS Code

---

## Installation

**VS Code Marketplace**

Search for **Local Commit AI** in the Extensions panel, or go directly to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=rahul-devlocal-commit-ai.local-commit-ai).

**Manual install from `.vsix`**

Download the latest `.vsix` from [Releases](https://github.com/RahulRajasekharan/local-commit-ai/releases), then:

```
Extensions panel → ··· menu → Install from VSIX…
```

---

## Quick Start

```bash
# 1. Install and start Ollama
ollama pull llama3.1          # or mistral, codellama, etc.

# 2. Verify Ollama is running
curl http://localhost:11434   # should return "Ollama is running"
```

3. Open a git repository in VS Code and stage your changes.
4. Click the **Generate Commit Message** button (✨) in the Source Control toolbar.
5. Review the generated message and commit.

---

## Screenshots

### Commit Message Generation

| | |
|---|---|
| ![Source Control panel](screenshots/menu1.png) | ![Toolbar button](screenshots/menu2.png) |
| _Staged changes ready_ | _Generate button_ |
| ![Generated message](screenshots/menu3.png) | |
| _Message inserted_ | |

### PR Description Generation

| | |
|---|---|
| ![Command palette showing Generate PR Description](screenshots/pr2.png) | ![Generating PR description loading state](screenshots/pr1.png) |
| _Command palette with "Generate PR Description"_ | _Generating in progress_ |
| ![PR description ready notification](screenshots/pr3.png) | ![Generated PR description in editor](screenshots/pr4.png) |
| _Ready — copy to clipboard or open in editor_ | _Full description in editor_ |
| ![PR description pasted into GitHub](screenshots/pr5.png) | |
| _Result pasted directly into a GitHub PR_ | |

---

## Configuration

All settings live under the `localCommitAI` namespace in VS Code settings (`Cmd+,` / `Ctrl+,`).

| Setting | Type | Default | Description |
|---|---|---|---|
| `localCommitAI.ollamaHost` | `string` | `http://localhost:11434` | Ollama server URL |
| `localCommitAI.model` | `string` | `llama3.1` | Model to use for generation |
| `localCommitAI.maxFiles` | `number` | `20` | Max changed files before generation is blocked |
| `localCommitAI.promptTemplate` | `string` | `""` | Custom prompt template — use `{{diff}}` as the diff placeholder |

**Example `.vscode/settings.json`:**

```json
{
  "localCommitAI.model": "codellama",
  "localCommitAI.maxFiles": 30,
  "localCommitAI.promptTemplate": "You are a senior engineer. Write a commit message for this diff:\n{{diff}}"
}
```

---

## Commands

| Command | ID | Description |
|---|---|---|
| Generate Commit Message | `localCommitAI.generateCommit` | Generates a message from the current diff; prompts for confirmation if a message already exists |
| Regenerate Commit Message | `localCommitAI.regenerateCommit` | Always regenerates, overwriting any existing message without prompting |
| Generate PR Description | `localCommitAI.generatePRDescription` | Generates a GitHub-ready PR description from commits and diff since the main branch |

Access via the **Source Control toolbar** or **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`).

### Tweaking a message

After a message is generated, a **Tweak it** button appears. Clicking it opens a quick-pick menu with preset options:

- Make it shorter
- Add more detail
- Change type to `feat`, `fix`, `refactor`, or `chore`
- Custom — type your own instruction

The message is regenerated based on your feedback, and you can keep tweaking until you're satisfied.

---

## PR Description Generation

The **Generate PR Description** command builds a full pull request description by analyzing all commits and the diff between your current branch and `main`. It constructs a structured markdown description covering what changed, why, and how to test — ready to paste directly into GitHub.

**How to use:**

1. Open the **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run **Generate PR Description**.
2. Wait for the "generating PR description..." indicator to complete.
3. When the "PR description ready" notification appears, choose:
   - **Copy to clipboard** — paste it straight into GitHub's PR body field
   - **Open in editor** — review and edit before copying

The generated description follows a structured format with sections for what changed, a list of specific changes, and testing notes.

---

## Commit Format

Generated messages follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>: <summary in imperative mood>

- detail 1
- detail 2
```

**Supported types:**

| Type | When used |
|---|---|
| `feat` | New feature or capability added |
| `fix` | Bug fix or error correction |
| `refactor` | Code restructuring without behavior change |
| `chore` | Tooling, config, docs, or housekeeping |

---

## Troubleshooting

| Symptom | Solution |
|---|---|
| _"Ollama request failed"_ | Run `ollama serve`; verify `ollamaHost` in settings; run `ollama list` to confirm model exists |
| _"No Git repo found"_ | Open a folder that contains a `.git` directory |
| _"No changes found"_ | Stage files or ensure unstaged changes are present |
| _"Too many files changed"_ | Increase `localCommitAI.maxFiles` or reduce the number of staged files |
| Poor commit message quality | Try a larger/code-focused model (`codellama`, `mistral`) or supply a custom `promptTemplate` |
| Status bar shows wrong model | Change `localCommitAI.model` — the status bar updates live |

---

## About the Author

Built by **Rahul Rajasekharan** — engineer and maker of things.

Check out more projects and writing at [rahulrajasekharan.dev](https://www.rahulrajasekharan.dev/).

If Local Commit AI saves you time, a ⭐ on [GitHub](https://github.com/RahulRajasekharan/local-commit-ai) goes a long way — it helps others find the project too. Thank you!

---

## Privacy

All processing happens locally on your machine. Your code and diffs are **never transmitted to any external service**. The only network traffic is between the extension and your local Ollama instance (`localhost`).

---

## License

[MIT](LICENSE) © [Rahul Rajasekharan](https://github.com/RahulRajasekharan)
