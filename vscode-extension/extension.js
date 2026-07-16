const vscode = require('vscode');

function activate(context) {
    let disposable = vscode.commands.registerCommand('devmind.inlineReview', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active code editor window found.');
            return;
        }

        // 1. Grab the user's highlighted text selection matrix
        const selection = editor.selection;
        const highlightedCode = editor.document.getText(selection);
        if (!highlightedCode || highlightedCode.trim().length === 0) {
            vscode.window.showWarningMessage('Please highlight a block of code to review.');
            return;
        }

        vscode.window.showInformationMessage('DevMind multi-agent engine executing...');

        try {
            // 2. Build multi-part form parameters matching our FastAPI requirements
            const formData = new URLSearchParams();
            formData.append('prompt', highlightedCode);
            formData.append('command', 'review');
            formData.append('workspace_id', 'vscode_desktop');
            formData.append('session_id', 'desktop_session');

            // 3. Dispatch the payload straight to your running FastAPI server
            const response = await fetch('http://localhost:8000/api/agent/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });

            if (!response.ok) {
                throw new Error(`Server returned error code: ${response.status}`);
            }

            // 4. Ingest and parse the incoming Server-Sent Events stream chunk-by-chunk
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let accumulatedArtifact = "";

            // Insert a header block comment directly above the user's current line tracking index
            await editor.edit(editBuilder => {
                editBuilder.insert(selection.start, "\n/* === DEVMIND INLINE REVIEW LOGS ===\n");
            });

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                const textChunk = decoder.decode(value, { stream: true });
                const lines = textChunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataContent = line.replace('data: ', '').trim();
                        if (dataContent === '[DONE]') break;

                        try {
                            const parsed = JSON.parse(dataContent);
                            if (parsed.latest_artifact && parsed.latest_artifact !== accumulatedArtifact) {
                                // Extract the difference updates to print iteratively
                                const incrementalUpdate = parsed.latest_artifact.replace(accumulatedArtifact, "");
                                accumulatedArtifact = parsed.latest_artifact;

                                // Dynamically type the response directly into the active file!
                                await editor.edit(editBuilder => {
                                    editBuilder.insert(editor.selection.start, incrementalUpdate);
                                });
                            }
                        } catch (e) {
                            // Suppress minor intermediate parse exceptions from incomplete SSE text fragments
                        }
                    }
                }
            }

            // Seal off the block comment notation layout cleanly
            await editor.edit(editBuilder => {
                editBuilder.insert(editor.selection.start, "\n==================================== */\n");
            });

            vscode.window.showInformationMessage('DevMind execution cycles finalized!');

        } catch (error) {
            vscode.window.showErrorMessage(`DevMind connection failure: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}