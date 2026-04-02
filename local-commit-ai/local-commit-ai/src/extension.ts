import * as vscode from 'vscode';
import axios from 'axios';

// Supported conventional commit types
type CommitType = 'feat' | 'fix' | 'refactor' | 'chore';

// Persistent status bar item showing the active Ollama model
let statusBar: vscode.StatusBarItem;

// ─────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────

// On extension activation, set up commands and the status bar button

export function activate(context: vscode.ExtensionContext) {
    // Create a right-aligned status bar button that opens extension settings on click
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = {
        command: 'workbench.action.openSettings',
        title: 'Open Local Commit AI Settings',
        arguments: ['localCommitAI']
    };
    updateStatusBar();
    statusBar.show();

    // Generate: prompts before overwriting an existing message
    const generate = vscode.commands.registerCommand(
        'localCommitAI.generateCommit',
        () => runCommitFlow({ force: false })
    );

    // Regenerate: silently overwrites any existing message
    const regenerate = vscode.commands.registerCommand(
        'localCommitAI.regenerateCommit',
        () => runCommitFlow({ force: true })
    );

    // Keep the status bar model label in sync when settings change
    const onConfigChange = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('localCommitAI.model')) {
            updateStatusBar();
        }
    });

    context.subscriptions.push(generate, regenerate, statusBar, onConfigChange);
}

export function deactivate() {}

// Refresh the status bar label with the currently configured model name
function updateStatusBar() {
    const { model } = getConfig();
    statusBar.text = `$(sparkle) ${model}`;
    statusBar.tooltip = `Local Commit AI — model: ${model}\nClick to open settings`;
}


// ─────────────────────────────────────────────
// COMMIT FLOW
// ─────────────────────────────────────────────

/**
 * Main entry point for both "generate" and "regenerate" commands.
 * - Reads the staged (or unstaged) diff
 * - Sends it to the local Ollama model
 * - Writes the result into the SCM input box
 */
async function runCommitFlow({ force }: { force: boolean }) {
    try {
        const gitApi = getGitApi();
        if (!gitApi) return;

        const repo = gitApi.repositories[0];

        // When not force-regenerating, warn the user if a message already exists
        if (!force && repo?.inputBox.value) {
            const choice = await vscode.window.showQuickPick(
                ['Replace existing message', 'Cancel'],
                { placeHolder: 'A commit message already exists. Replace it?' }
            );
            if (choice !== 'Replace existing message') return;
        }

        const diff = await getGitDiff(gitApi);
        if (!diff) return;

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: force ? 'Regenerating commit message...' : 'Generating commit message...',
                cancellable: false
            },
            async () => {
                const message = await generateCommitMessage(diff);
                repo.inputBox.value = message;
                vscode.window.showInformationMessage('Commit message generated');
            }
        );
    } catch (err: any) {
        console.error(err);
        vscode.window.showErrorMessage(`Error: ${err.message}`);
    }
}


// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

/** Read all extension settings with safe defaults. */
function getConfig() {
    const config = vscode.workspace.getConfiguration('localCommitAI');

    return {
        host: config.get<string>('ollamaHost') || 'http://localhost:11434',
        model: config.get<string>('model') || 'llama3',
        promptTemplate: config.get<string>('promptTemplate') || '',
        maxFiles: config.get<number>('maxFiles') ?? 20
    };
}


// ─────────────────────────────────────────────
// GIT
// ─────────────────────────────────────────────

/**
 * Retrieve the built-in VS Code Git extension API (v1).
 * Returns null and shows an error if Git is unavailable or no repo is open.
 */
function getGitApi() {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found');
        return null;
    }

    const git = gitExtension.getAPI(1);
    if (git.repositories.length === 0) {
        vscode.window.showErrorMessage('No Git repo found');
        return null;
    }

    return git;
}

/**
 * Retrieve the diff for the first repository.
 * Prefers staged changes; falls back to working-tree changes with user confirmation.
 * Throws if the number of changed files exceeds the configured limit.
 */
async function getGitDiff(git: any): Promise<string | null> {
    const repo = git.repositories[0];
    let useStaged = true;

    // If nothing is staged, offer to use unstaged changes instead
    if (repo.state.indexChanges.length === 0) {
        const choice = await vscode.window.showQuickPick(
            ['Use unstaged changes', 'Cancel'],
            { placeHolder: 'No staged changes found' }
        );
        if (choice !== 'Use unstaged changes') return null;
        useStaged = false;
    }

    // Guard against accidentally committing massive changesets
    const changedFiles = useStaged
        ? repo.state.indexChanges.length
        : repo.state.workingTreeChanges.length;

    const { maxFiles } = getConfig();
    if (changedFiles > maxFiles) {
        throw new Error(
            `Too many files changed (${changedFiles}). ` +
            `Stage a focused set of changes (max ${maxFiles} files) before generating a commit message.`
        );
    }

    const diff = await repo.diff(useStaged);
    if (!diff) {
        vscode.window.showWarningMessage('No changes found');
        return null;
    }

    return diff;
}


// ─────────────────────────────────────────────
// LLM
// ─────────────────────────────────────────────

/**
 * Send the diff to Ollama and parse the structured JSON response into a
 * conventional commit message string.
 *
 * Falls back to "chore: update code" if the model returns unparseable output.
 */
async function generateCommitMessage(diff: string): Promise<string> {
    const safeDiff = truncateDiff(diff);
    const { host, model, promptTemplate } = getConfig();

    // Default prompt — instructs the model to return strict JSON only
    const defaultPrompt = `
You are a senior software engineer reviewing a git diff.

Your task is to classify and summarize the change.

Return ONLY valid JSON in the following format:

{
  "type": "feat | fix | refactor | chore",
  "summary": "concise, one-line summary in imperative tense",
  "details": ["key change 1", "key change 2"]
}

Rules:
- "feat": introduces new functionality
- "fix": resolves a bug or incorrect behavior
- "refactor": improves structure without changing behavior
- "chore": non-functional changes (comments, docs, formatting, renaming, config)

Strict guidelines:
- Do NOT include any text outside the JSON
- Do NOT hallucinate missing context
- Base your answer ONLY on the provided diff
- Prefer correctness over guessing
- Keep the summary under 12 words
- Use imperative tone (e.g., "Add validation", not "Added validation")
- Focus on intent and impact, not implementation details
- Ignore trivial changes unless they affect behavior
- If multiple types apply, choose the dominant intent

Edge cases:
- Only comments/docs → "chore"
- Pure renaming/formatting → "chore"
- Mixed changes → pick the primary purpose

Diff:
${safeDiff}
`;

    // Allow users to override the prompt via settings; {{diff}} is the placeholder
    const prompt = promptTemplate
        ? promptTemplate.replace('{{diff}}', safeDiff)
        : defaultPrompt;

    try {
        const response = await axios.post(`${host}/api/chat`, {
            model,
            messages: [{ role: 'user', content: prompt }],
            stream: false
        });

        const raw = response.data.message.content;

        // Extract the JSON block even if the model wraps it in extra prose
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Invalid JSON');

        const parsed = JSON.parse(jsonMatch[0]);

        const type    = normalizeType(parsed.type, parsed.summary);
        const summary = cleanText(parsed.summary);
        const details = (parsed.details || []).map((d: string) => cleanText(d));

        return formatCommit(type, summary, details);

    } catch (err: any) {
        console.error(err);
        vscode.window.showErrorMessage('Ollama request failed');
        return 'chore: update code';
    }
}


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/** Cap the diff at `max` characters to stay within model context limits. */
function truncateDiff(diff: string, max = 8000): string {
    return diff.length > max ? diff.slice(0, max) + '\n...(truncated)' : diff;
}

/**
 * Normalise commit summary text to imperative mood and strip trailing periods.
 * e.g. "Added validation." → "add validation"
 */
function cleanText(text: string): string {
    return text
        .replace(/^Added\s+/i,   'add ')
        .replace(/^Updated\s+/i, 'update ')
        .replace(/^Fixed\s+/i,   'fix ')
        .replace(/^Removed\s+/i, 'remove ')
        .replace(/\.$/, '')
        .trim();
}

/**
 * Override the model-assigned type when the summary wording makes the intent
 * unambiguous (e.g. a summary mentioning "fix" should always map to "fix").
 */
function normalizeType(type: string, summary: string): CommitType {
    const text = (summary || '').toLowerCase();

    if (text.includes('comment') || text.includes('doc'))    return 'chore';
    if (text.includes('fix')     || text.includes('error'))  return 'fix';
    if (text.includes('refactor'))                           return 'refactor';
    if (text.includes('add')     || text.includes('create')) return 'feat';

    return (type as CommitType) || 'chore';
}

/**
 * Assemble the final conventional commit string.
 * If details are present they are appended as a bullet-point body.
 *
 * Example output:
 *   feat: add user authentication
 *
 *   - add JWT token validation
 *   - expose /login endpoint
 */
function formatCommit(type: string, summary: string, details: string[]): string {
    const header = `${type}: ${summary}`;
    if (!details.length) return header;

    const body = details.map(d => `- ${d}`).join('\n');
    return `${header}\n\n${body}`;
}
