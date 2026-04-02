import * as vscode from 'vscode';
import axios from 'axios';
import { execSync } from 'child_process';

// Supported conventional commit types
type CommitType = 'feat' | 'fix' | 'refactor' | 'chore';

// Persistent status bar item showing the active Ollama model
let statusBar: vscode.StatusBarItem;

// ─────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = {
        command: 'workbench.action.openSettings',
        title: 'Open Local Commit AI Settings',
        arguments: ['localCommitAI']
    };
    updateStatusBar();
    statusBar.show();

    const generate = vscode.commands.registerCommand(
        'localCommitAI.generateCommit',
        () => runCommitFlow({ force: false })
    );

    const regenerate = vscode.commands.registerCommand(
        'localCommitAI.regenerateCommit',
        () => runCommitFlow({ force: true })
    );

    const onConfigChange = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('localCommitAI.model')) {
            updateStatusBar();
        }
    });

    const generatePR = vscode.commands.registerCommand(
        'localCommitAI.generatePRDescription',
        () => runPRDescriptionFlow()
    );

    context.subscriptions.push(generate, regenerate, generatePR, statusBar, onConfigChange);
}

export function deactivate() {}

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
 * Streams the Ollama response live into the status bar, then offers
 * a "Tweak it" button for iterative refinement.
 */
async function runCommitFlow({ force }: { force: boolean }) {
    try {
        const gitApi = getGitApi();
        if (!gitApi) return;

        const repo = gitApi.repositories[0];

        if (!force && repo?.inputBox.value) {
            const choice = await vscode.window.showQuickPick(
                ['Replace existing message', 'Cancel'],
                { placeHolder: 'A commit message already exists. Replace it?' }
            );
            if (choice !== 'Replace existing message') return;
        }

        const diff = await getGitDiff(gitApi);
        if (!diff) return;

        const message = await generateCommitMessage(diff);
        repo.inputBox.value = message;

        const action = await vscode.window.showInformationMessage(
            'Commit message generated',
            'Tweak it'
        );

        if (action === 'Tweak it') {
            await tweakCommitMessage(diff, message, repo);
        }

    } catch (err: any) {
        updateStatusBar();
        console.error(err);
        vscode.window.showErrorMessage(`Error: ${err.message}`);
    }
}

/**
 * Ask the user how to change the message, re-generate with feedback,
 * and offer another round of tweaking until they're satisfied.
 */
async function tweakCommitMessage(diff: string, currentMessage: string, repo: any) {
    const QUICK_OPTIONS = [
        'Make it shorter',
        'Add more detail',
        'Change type to feat',
        'Change type to fix',
        'Change type to refactor',
        'Change type to chore',
        'Custom...'
    ];

    const choice = await vscode.window.showQuickPick(QUICK_OPTIONS, {
        placeHolder: 'How should I change the commit message?'
    });
    if (!choice) return;

    let feedback: string;
    if (choice === 'Custom...') {
        const custom = await vscode.window.showInputBox({
            prompt: 'Describe how to change the commit message',
            placeHolder: 'e.g. "mention the file that was changed"'
        });
        if (!custom) return;
        feedback = custom;
    } else {
        feedback = choice;
    }

    const newMessage = await generateCommitMessage(diff, feedback, currentMessage);
    repo.inputBox.value = newMessage;

    const action = await vscode.window.showInformationMessage(
        'Commit message updated',
        'Tweak it again'
    );

    if (action === 'Tweak it again') {
        await tweakCommitMessage(diff, newMessage, repo);
    }
}


// ─────────────────────────────────────────────
// PR DESCRIPTION FLOW
// ─────────────────────────────────────────────

async function runPRDescriptionFlow() {
    try {
        const gitApi = getGitApi();
        if (!gitApi) return;

        const workspacePath = gitApi.repositories[0].rootUri.fsPath;

        let commitLog: string;
        let diff: string;
        try {
            commitLog = execSync('git log main..HEAD --oneline', { cwd: workspacePath }).toString().trim();
            diff = execSync('git diff main...HEAD', { cwd: workspacePath }).toString();
        } catch {
            commitLog = execSync('git log master..HEAD --oneline', { cwd: workspacePath }).toString().trim();
            diff = execSync('git diff master...HEAD', { cwd: workspacePath }).toString();
        }

        if (!commitLog) {
            vscode.window.showWarningMessage('No commits ahead of main found');
            return;
        }

        statusBar.text = `$(loading~spin) generating PR description...`;

        const { host, model } = getConfig();
        const safeDiff = truncateDiff(diff, 12000);
        const prompt = buildPRPrompt(commitLog, safeDiff);

        const response = await axios.post(
            `${host}/api/chat`,
            { model, messages: [{ role: 'user', content: prompt }], stream: false }
        );

        updateStatusBar();

        const description: string = response.data?.message?.content?.trim() ?? '';
        if (!description) throw new Error('Empty response from model');

        const action = await vscode.window.showInformationMessage(
            'PR description ready',
            'Copy to clipboard',
            'Open in editor'
        );

        if (action === 'Copy to clipboard') {
            await vscode.env.clipboard.writeText(description);
            vscode.window.showInformationMessage('PR description copied to clipboard');
        } else if (action === 'Open in editor') {
            const doc = await vscode.workspace.openTextDocument({ content: description, language: 'markdown' });
            await vscode.window.showTextDocument(doc);
        }

    } catch (err: any) {
        updateStatusBar();
        console.error(err);
        vscode.window.showErrorMessage(`PR Description Error: ${err.message}`);
    }
}

function buildPRPrompt(commitLog: string, diff: string): string {
    return `
You are a senior software engineer writing a pull request description.

Here are the commits included in this PR:
${commitLog}

Here is the full diff:
${diff}

Output ONLY the following markdown, with no text before or after it:

## What changed
One or two sentences summarizing the change.

## Why
The motivation or context behind this change.

## Changes
A bullet list of the commits or key changes.

## Testing
A markdown checklist of things to verify.
`;
}


// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

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

async function getGitDiff(git: any): Promise<string | null> {
    const repo = git.repositories[0];
    let useStaged = true;

    if (repo.state.indexChanges.length === 0) {
        const choice = await vscode.window.showQuickPick(
            ['Use unstaged changes', 'Cancel'],
            { placeHolder: 'No staged changes found' }
        );
        if (choice !== 'Use unstaged changes') return null;
        useStaged = false;
    }

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
 * Generate a commit message from Ollama.
 * Accepts optional feedback + currentMessage for the "Tweak it" flow.
 */
async function generateCommitMessage(
    diff: string,
    feedback?: string,
    currentMessage?: string
): Promise<string> {
    const safeDiff = truncateDiff(diff);
    const { host, model, promptTemplate } = getConfig();

    let prompt: string;
    if (feedback && currentMessage) {
        prompt = buildTweakPrompt(safeDiff, currentMessage, feedback);
    } else if (promptTemplate) {
        prompt = promptTemplate.replace('{{diff}}', safeDiff);
    } else {
        prompt = buildDefaultPrompt(safeDiff);
    }

    statusBar.text = `$(loading~spin) generating...`;

    try {
        const response = await axios.post(
            `${host}/api/chat`,
            { model, messages: [{ role: 'user', content: prompt }], stream: false }
        );

        updateStatusBar();

        const fullText: string = response.data?.message?.content ?? '';

        const jsonMatch = fullText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found in model response');

        const parsed = JSON.parse(jsonMatch[0]);
        const type    = normalizeType(parsed.type, parsed.summary);
        const summary = cleanText(parsed.summary);
        const details = (parsed.details || []).map((d: string) => cleanText(d));

        return formatCommit(type, summary, details);

    } catch (err: any) {
        updateStatusBar();
        console.error(err);
        vscode.window.showErrorMessage('Ollama request failed');
        return 'chore: update code';
    }
}

/** Prompt for the initial generation from a raw diff. */
function buildDefaultPrompt(diff: string): string {
    return `
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
${diff}
`;
}

/** Prompt used when the user asks to refine an existing message with feedback. */
function buildTweakPrompt(diff: string, currentMessage: string, feedback: string): string {
    return `
You are a senior software engineer. You previously generated this git commit message:

"${currentMessage}"

The user wants you to: ${feedback}

Using the same diff below, generate a revised commit message that addresses the feedback.
Return ONLY valid JSON in the following format:

{
  "type": "feat | fix | refactor | chore",
  "summary": "concise, one-line summary in imperative tense",
  "details": ["key change 1", "key change 2"]
}

Guidelines:
- If the feedback asks for a shorter message, use an empty "details" array
- Use imperative tone (e.g., "Add validation", not "Added validation")
- Keep the summary under 12 words
- Do NOT include any text outside the JSON

Diff:
${diff}
`;
}


// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function truncateDiff(diff: string, max = 8000): string {
    return diff.length > max ? diff.slice(0, max) + '\n...(truncated)' : diff;
}

function cleanText(text: string): string {
    return text
        .replace(/^Added\s+/i,   'add ')
        .replace(/^Updated\s+/i, 'update ')
        .replace(/^Fixed\s+/i,   'fix ')
        .replace(/^Removed\s+/i, 'remove ')
        .replace(/\.$/, '')
        .trim();
}

function normalizeType(type: string, summary: string): CommitType {
    const text = (summary || '').toLowerCase();

    if (text.includes('comment') || text.includes('doc'))    return 'chore';
    if (text.includes('fix')     || text.includes('error'))  return 'fix';
    if (text.includes('refactor'))                           return 'refactor';
    if (text.includes('add')     || text.includes('create')) return 'feat';

    return (type as CommitType) || 'chore';
}

function formatCommit(type: string, summary: string, details: string[]): string {
    const header = `${type}: ${summary}`;
    if (!details.length) return header;

    const body = details.map(d => `- ${d}`).join('\n');
    return `${header}\n\n${body}`;
}
