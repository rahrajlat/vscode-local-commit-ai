import * as vscode from 'vscode';
import axios from 'axios';

type CommitType = 'feat' | 'fix' | 'refactor' | 'chore';

interface CommitResult {
    type: CommitType;
    summary: string;
    details: string[];
}

'TODO: Add config option for model name and Ollama URL'

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        'localCommitAI.generateCommit',
        async () => {
            try {
                const diff = await getGitDiff();
                if (!diff) {
                    return;
                }

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Generating commit message...',
                        cancellable: false
                    },
                    async () => {
                        const message = await generateCommitMessage(diff);
                        await insertIntoSourceControl(message);
                    }
                );
            } catch (err) {
                const errorMessage =
                    err instanceof Error ? err.message : 'Unknown error';
                console.error('localCommitAI.generateCommit failed:', err);
                vscode.window.showErrorMessage(`Error: ${errorMessage}`);
            }
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}

async function getGitDiff(): Promise<string | null> {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;

    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found.');
        return null;
    }

    const git = gitExtension.getAPI(1);

    if (!git || git.repositories.length === 0) {
        vscode.window.showErrorMessage(
            'No Git repositories found. Open the Git repo folder directly.'
        );
        return null;
    }

    const repo = git.repositories[0];
    let useStaged = true;

    if (repo.state.indexChanges.length === 0) {
        const choice = await vscode.window.showQuickPick(
            ['Use unstaged changes', 'Cancel'],
            { placeHolder: 'No staged changes found' }
        );

        if (choice !== 'Use unstaged changes') {
            return null;
        }

        useStaged = false;
    }

    const diff = await repo.diff(useStaged);

    if (!diff || !diff.trim()) {
        vscode.window.showWarningMessage('No changes found.');
        return null;
    }

    if (diff.length > 10000) {
        vscode.window.showInformationMessage(
            'Large diff detected. Truncating before sending to the local model.'
        );
    }

    return diff;
}

async function generateCommitMessage(diff: string): Promise<string> {
    const safeDiff = truncateDiff(diff);

    const prompt = `
You are a senior software engineer writing a git commit message.

Analyze the diff and return ONLY valid JSON in this exact shape:

{
  "type": "feat | fix | refactor | chore",
  "summary": "short summary, max 50 chars",
  "details": ["bullet 1", "bullet 2"]
}

Classification rules:
- feat: new user-visible functionality or new behavior
- fix: bug fix or correction of broken behavior
- refactor: code restructuring without behavior change
- chore: comments, documentation, formatting, config, maintenance, dependency, minor cleanup

Important rules:
- Comments, documentation, or formatting changes must be classified as "chore"
- Never classify comments or docs as "feat"
- Only describe changes clearly visible in the diff
- Do not mention line counts
- Do not mention trivial whitespace-only changes
- Use imperative tone: add, update, remove, fix
- If unsure, choose "chore"
- Keep details high-value and concise
- Return JSON only, no explanation, no markdown

Diff:
${safeDiff}
`;

    try {
        const response = await axios.post(
            'http://localhost:11434/api/chat',
            {
                model: 'llama3.1',
                messages: [{ role: 'user', content: prompt }],
                stream: false
            },
            {
                timeout: 120000
            }
        );

        const rawContent = response?.data?.message?.content;

        if (typeof rawContent !== 'string' || !rawContent.trim()) {
            throw new Error('Empty response from Ollama.');
        }

        const parsed = parseModelResponse(rawContent);
        const normalized = normalizeCommitResult(parsed);

        return formatCommit(normalized);
    } catch (err: unknown) {
        console.error('Ollama generation failed:', err);

        let message = 'Failed to generate commit message.';
        if (axios.isAxiosError(err)) {
            const status = err.response?.status;
            if (status) {
                message = `Failed to generate commit message. Ollama returned ${status}.`;
            } else if (err.code === 'ECONNREFUSED') {
                message = 'Could not connect to Ollama. Make sure Ollama is running.';
            }
        }

        vscode.window.showErrorMessage(message);
        return 'chore: update code';
    }
}

function parseModelResponse(raw: string): CommitResult {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
        throw new Error('Model did not return valid JSON.');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<CommitResult>;

    return {
        type: isCommitType(parsed.type) ? parsed.type : 'chore',
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'update code',
        details: Array.isArray(parsed.details)
            ? parsed.details.filter((item): item is string => typeof item === 'string')
            : []
    };
}

function isCommitType(value: unknown): value is CommitType {
    return (
        value === 'feat' ||
        value === 'fix' ||
        value === 'refactor' ||
        value === 'chore'
    );
}

function normalizeCommitResult(result: CommitResult): CommitResult {
    const cleanedSummary = cleanText(result.summary);
    const cleanedDetails = dedupeStrings(
        result.details
            .map(cleanText)
            .filter((detail) => isUsefulDetail(detail, cleanedSummary))
    );

    const normalizedType = normalizeType(result.type, cleanedSummary, cleanedDetails);

    return {
        type: normalizedType,
        summary: cleanedSummary || 'update code',
        details: cleanedDetails.slice(0, 5)
    };
}

function normalizeType(
    type: CommitType,
    summary: string,
    details: string[]
): CommitType {
    const text = `${summary} ${details.join(' ')}`.toLowerCase();

    const choreSignals = [
        'comment',
        'comments',
        'documentation',
        'document',
        'docs',
        'doc',
        'readme',
        'format',
        'formatting',
        'whitespace',
        'cleanup',
        'clean up',
        'typo',
        'config',
        'configuration',
        'rename variable',
        'update comment',
        'add comment'
    ];

    const fixSignals = [
        'fix',
        'bug',
        'error',
        'handle null',
        'handle missing',
        'prevent',
        'resolve',
        'correct'
    ];

    const refactorSignals = [
        'refactor',
        'restructure',
        'simplify',
        'extract',
        'reorganize',
        'improve structure',
        'clean up logic'
    ];

    const featSignals = [
        'add command',
        'add support',
        'add feature',
        'introduce',
        'implement',
        'create',
        'enable',
        'register command',
        'new behavior',
        'new functionality'
    ];

    if (choreSignals.some((signal) => text.includes(signal))) {
        return 'chore';
    }

    if (fixSignals.some((signal) => text.includes(signal))) {
        return 'fix';
    }

    if (refactorSignals.some((signal) => text.includes(signal))) {
        return 'refactor';
    }

    if (featSignals.some((signal) => text.includes(signal))) {
        return 'feat';
    }

    return type;
}

function truncateDiff(diff: string, maxChars = 8000): string {
    if (diff.length <= maxChars) {
        return diff;
    }

    return `${diff.slice(0, maxChars)}\n\n... (diff truncated)`;
}

function cleanText(text: string): string {
    return text
        .replace(/^\s*[-*]\s*/, '')
        .replace(/^Added\s+/i, 'add ')
        .replace(/^Updated\s+/i, 'update ')
        .replace(/^Fixed\s+/i, 'fix ')
        .replace(/^Removed\s+/i, 'remove ')
        .replace(/^Refactored\s+/i, 'refactor ')
        .replace(/^Improved\s+/i, 'improve ')
        .replace(/^Introduced\s+/i, 'introduce ')
        .replace(/^Implemented\s+/i, 'implement ')
        .replace(/\.$/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function isUsefulDetail(detail: string, summary: string): boolean {
    if (!detail) {
        return false;
    }

    const lowered = detail.toLowerCase();

    const lowValuePatterns = [
        'add a new line',
        'add two lines',
        'add one line',
        'update comments',
        'minor formatting',
        'format code',
        'whitespace changes'
    ];

    if (lowValuePatterns.some((pattern) => lowered.includes(pattern))) {
        return false;
    }

    if (lowered === summary.toLowerCase()) {
        return false;
    }

    return true;
}

function dedupeStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const key = value.toLowerCase();
        if (!seen.has(key)) {
            seen.add(key);
            result.push(value);
        }
    }

    return result;
}

function formatCommit(result: CommitResult): string {
    const header = `${result.type}: ${result.summary}`;

    if (!result.details.length) {
        return header;
    }

    const body = result.details.map((detail) => `- ${detail}`).join('\n');
    return `${header}\n\n${body}`;
}

async function insertIntoSourceControl(message: string): Promise<void> {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;

    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found.');
        return;
    }

    const git = gitExtension.getAPI(1);

    if (!git || git.repositories.length === 0) {
        vscode.window.showErrorMessage('No Git repository available.');
        return;
    }

    const repo = git.repositories[0];
    repo.inputBox.value = message;
}