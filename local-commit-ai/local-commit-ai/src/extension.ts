import * as vscode from 'vscode';
import axios from 'axios';

type CommitType = 'feat' | 'fix' | 'refactor' | 'chore';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        'localCommitAI.generateCommit',
        async () => {
            try {
                const diff = await getGitDiff();
                if (!diff) return;

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: 'Generating commit message...',
                        cancellable: false
                    },
                    async () => {
                        const message = await generateCommitMessage(diff);

                        // ✅ NO PROMPT → direct insert
                        await insertIntoSourceControl(message);

                        vscode.window.showInformationMessage(
                            'Commit message generated'
                        );
                    }
                );
            } catch (err: any) {
                console.error(err);
                vscode.window.showErrorMessage(`Error: ${err.message}`);
            }
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {}


// -----------------------------
// CONFIG
// -----------------------------
function getConfig() {
    const config = vscode.workspace.getConfiguration('localCommitAI');

    return {
        host: config.get<string>('ollamaHost') || 'http://localhost:11434',
        model: config.get<string>('model') || 'llama3',
        promptTemplate: config.get<string>('promptTemplate') || ''
    };
}


// -----------------------------
// GIT
// -----------------------------
async function getGitDiff(): Promise<string | null> {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (!gitExtension) return null;

    const git = gitExtension.getAPI(1);
    if (git.repositories.length === 0) {
        vscode.window.showErrorMessage('No Git repo found');
        return null;
    }

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

    const diff = await repo.diff(useStaged);

    if (!diff) {
        vscode.window.showWarningMessage('No changes found');
        return null;
    }

    return diff;
}


// -----------------------------
// LLM
// -----------------------------
async function generateCommitMessage(diff: string): Promise<string> {
    const safeDiff = truncateDiff(diff);
    const { host, model, promptTemplate } = getConfig();

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

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('Invalid JSON');

        const parsed = JSON.parse(jsonMatch[0]);

        const type = normalizeType(parsed.type, parsed.summary);
        const summary = cleanText(parsed.summary);
        const details = (parsed.details || []).map((d: string) => cleanText(d));

        return formatCommit(type, summary, details);

    } catch (err: any) {
        console.error(err);
        vscode.window.showErrorMessage('Ollama request failed');
        return 'chore: update code';
    }
}


// -----------------------------
// HELPERS
// -----------------------------
function truncateDiff(diff: string, max = 8000) {
    return diff.length > max ? diff.slice(0, max) + '\n...(truncated)' : diff;
}

function cleanText(text: string): string {
    return text
        .replace(/^Added\s+/i, 'add ')
        .replace(/^Updated\s+/i, 'update ')
        .replace(/^Fixed\s+/i, 'fix ')
        .replace(/^Removed\s+/i, 'remove ')
        .replace(/\.$/, '')
        .trim();
}

function normalizeType(type: string, summary: string): CommitType {
    const text = (summary || '').toLowerCase();

    if (text.includes('comment') || text.includes('doc')) return 'chore';
    if (text.includes('fix') || text.includes('error')) return 'fix';
    if (text.includes('refactor')) return 'refactor';
    if (text.includes('add') || text.includes('create')) return 'feat';

    return (type as CommitType) || 'chore';
}

function formatCommit(type: string, summary: string, details: string[]) {
    const header = `${type}: ${summary}`;

    if (!details.length) return header;

    const body = details.map(d => `- ${d}`).join('\n');
    return `${header}\n\n${body}`;
}


// -----------------------------
// INSERT
// -----------------------------
async function insertIntoSourceControl(message: string) {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    const git = gitExtension.getAPI(1);
    const repo = git.repositories[0];

    repo.inputBox.value = message;
}