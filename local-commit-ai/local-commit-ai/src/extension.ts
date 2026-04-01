import * as vscode from 'vscode';
import axios from 'axios';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        'localCommitAI.generateCommit',
        async () => {
            try {
                const diff = await getGitDiff();
                if (!diff) return;

                vscode.window.withProgress(
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
// GIT DIFF
// -----------------------------
async function getGitDiff(): Promise<string | null> {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;

    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found');
        return null;
    }

    const git = gitExtension.getAPI(1);

    if (git.repositories.length === 0) {
        vscode.window.showErrorMessage(
            'No Git repositories found. Open the repo folder.'
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

    if (!diff) {
        vscode.window.showWarningMessage('No changes found.');
        return null;
    }

    if (diff.length > 10000) {
        vscode.window.showInformationMessage(
            'Large diff detected. Truncating for AI...'
        );
    }

    return diff;
}


// -----------------------------
// LLM CALL
// -----------------------------
async function generateCommitMessage(diff: string): Promise<string> {
    const safeDiff = truncateDiff(diff);

    const prompt = `
You are a senior software engineer.

Analyze the git diff and classify the change.

Allowed types:
- feat: new feature
- fix: bug fix
- refactor: code improvement without behavior change
- chore: maintenance or minor updates

Rules:
- Choose ONLY one type
- Do NOT hallucinate
- Only describe what is clearly visible in the diff
- If unsure, use "chore"

Return ONLY valid JSON:

{
  "type": "feat | fix | refactor | chore",
  "summary": "short summary (max 50 chars)",
  "details": ["bullet 1", "bullet 2"]
}

Use imperative tone (add, update, fix — NOT added/updated)

Diff:
${safeDiff}
`;

    try {
        const response = await axios.post('http://localhost:11434/api/chat', {
            model: 'llama3',
            messages: [{ role: 'user', content: prompt }],
            stream: false
        });

        const raw = response.data.message.content;

        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Invalid JSON response");

        const parsed = JSON.parse(jsonMatch[0]);

        const type = parsed.type || 'chore';
        const summary = cleanText(parsed.summary || 'update code');
        const details = (parsed.details || []).map((d: string) => cleanText(d));

        return formatCommit(type, summary, details);

    } catch (err: any) {
        console.error(err?.response?.data || err.message);

        vscode.window.showErrorMessage(
            'Failed to generate commit message (Ollama issue?)'
        );

        return "chore: update code";
    }
}


// -----------------------------
// HELPERS
// -----------------------------

function truncateDiff(diff: string, maxChars = 8000): string {
    if (diff.length <= maxChars) return diff;
    return diff.slice(0, maxChars) + "\n\n... (diff truncated)";
}


function cleanText(text: string): string {
    return text
        .replace(/^(Added|Updated|Fixed|Removed)\s/i, (match) =>
            match.toLowerCase()
                .replace('added', 'add')
                .replace('updated', 'update')
                .replace('fixed', 'fix')
                .replace('removed', 'remove')
        )
        .replace(/\.$/, '') // remove trailing period
        .trim();
}


function formatCommit(type: string, summary: string, details: string[]): string {
    const header = `${type}: ${summary}`;

    if (!details.length) return header;

    const body = details.map(d => `- ${d}`).join('\n');

    return `${header}\n\n${body}`;
}


// -----------------------------
// INSERT INTO UI
// -----------------------------
async function insertIntoSourceControl(message: string) {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    const git = gitExtension.getAPI(1);
    const repo = git.repositories[0];

    repo.inputBox.value = message;
}