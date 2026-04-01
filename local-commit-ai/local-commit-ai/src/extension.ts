import * as vscode from 'vscode';
import axios from 'axios';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        'localCommitAI.generateCommit',
        async () => {
            try {
                const diff = await getGitDiff();

                if (!diff) {
                    vscode.window.showWarningMessage('No staged changes found.');
                    return;
                }

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
                vscode.window.showErrorMessage(`Error: ${err.message}`);
            }
        }
    );

    context.subscriptions.push(disposable);
}

async function getGitDiff(): Promise<string | null> {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;

    if (!gitExtension) {
        vscode.window.showErrorMessage('Git extension not found');
        return null;
    }

    const git = gitExtension.getAPI(1);
    const repo = git.repositories[0];

    if (!repo) {
        vscode.window.showErrorMessage('No Git repository found');
        return null;
    }

    // Get staged diff
    const diff = await repo.diff(true);

    return diff || null;
}

async function generateCommitMessage(diff: string): Promise<string> {
    const prompt = `
You are an expert developer.

Write a detailed git commit message based on the following diff.

Rules:
- First line: concise summary (max 60 chars)
- Then a blank line
- Then bullet points explaining changes
- Use clear technical language
- No emojis

Diff:
${diff}
`;

    const response = await axios.post('http://localhost:11434/api/generate', {
        model: 'llama3.1',
        prompt,
        stream: false
    });

    return response.data.response.trim();
}

async function insertIntoSourceControl(message: string) {
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    const git = gitExtension.getAPI(1);
    const repo = git.repositories[0];

    repo.inputBox.value = message;
}

export function deactivate() {}