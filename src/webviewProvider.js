const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class WebviewProvider {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {import('./configManager').ConfigManager} config
   * @param {import('./jiraClient').JiraClient} jiraClient
   * @param {import('./aiService').AiService} aiService
   */
  constructor(context, config, jiraClient, aiService) {
    this._context = context;
    this._config = config;
    this._jiraClient = jiraClient;
    this._aiService = aiService;
    /** @type {vscode.WebviewPanel | undefined} */
    this._panel = undefined;
  }

  /**
   * Show the webview panel (or reveal if already open).
   * @param {string} [initialText] - optional text to pre-fill the prompt area
   */
  show(initialText) {
    if (this._panel) {
      this._panel.reveal(vscode.ViewColumn.One);
      if (initialText) {
        this._panel.webview.postMessage({ command: 'setPrompt', text: initialText });
      }
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'jiraTicketCreator',
      'Jira Ticket Creator',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this._context.extensionPath, 'media')),
        ],
      }
    );

    this._panel.webview.html = this._getHtml(this._panel.webview);

    // Send initial config to webview
    this._panel.webview.postMessage({
      command: 'init',
      config: {
        projectKey: this._config.projectKey,
        issueTypes: this._config.issueTypes,
        defaultIssueType: this._config.defaultIssueType,
      },
    });

    if (initialText) {
      // Small delay to ensure webview has loaded
      setTimeout(() => {
        this._panel.webview.postMessage({ command: 'setPrompt', text: initialText });
      }, 300);
    }

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      msg => this._handleMessage(msg),
      undefined,
      this._context.subscriptions
    );

    // When the user switches back to this panel, re-verify connection
    // (e.g. after logging in via Simple Browser)
    this._panel.onDidChangeViewState(
      e => {
        if (e.webviewPanel.active) {
          this._panel.webview.postMessage({ command: 'reverify' });
        }
      },
      undefined,
      this._context.subscriptions
    );

    this._panel.onDidDispose(() => {
      this._panel = undefined;
    });
  }

  /** Handle messages sent from the webview */
  async _handleMessage(msg) {
    switch (msg.command) {
      case 'generate':
        await this._handleGenerate(msg.prompts);
        break;
      case 'create':
        await this._handleCreate(msg.tickets);
        break;
      case 'testConnection':
        await this._handleTestConnection();
        break;
      case 'loadFile':
        await this._handleLoadFile();
        break;
      case 'openSettings':
        await this._config.openSettings();
        break;
    }
  }

  /** Generate ticket fields from AI */
  async _handleGenerate(prompts) {
    // Validate config first
    const missing = this._config.validate();
    if (missing.length > 0) {
      this._postMessage('error', {
        message: `Missing settings: ${missing.join(', ')}. Click "Settings" to configure.`,
      });
      return;
    }

    const credential = await this._config.getCredential();
    if (!credential) {
      this._postMessage('error', {
        message: 'No Jira session found. Install the Jira Token Relay Chrome extension, log in to Jira in Chrome, then click Sync Now in the extension popup.',
      });
      return;
    }

    this._postMessage('status', { message: 'Generating ticket fields with AI...', loading: true });

    try {
      const filteredPrompts = prompts.filter(p => p.trim().length > 0);
      if (filteredPrompts.length === 0) {
        this._postMessage('error', { message: 'No issue descriptions provided.' });
        return;
      }

      const tickets = await this._aiService.generateBulkTicketFields(filteredPrompts);
      this._postMessage('preview', { tickets });
    } catch (err) {
      this._postMessage('error', { message: `AI generation failed: ${err.message}` });
    }
  }

  /** Create tickets in Jira */
  async _handleCreate(tickets) {
    this._postMessage('status', { message: 'Creating tickets in Jira...', loading: true });

    try {
      const results = await this._jiraClient.bulkCreateIssues(tickets);
      this._postMessage('results', { results });

      // Show summary notification
      const created = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      if (failed === 0) {
        vscode.window.showInformationMessage(`Successfully created ${created} Jira ticket(s).`);
      } else {
        vscode.window.showWarningMessage(
          `Created ${created} ticket(s), ${failed} failed. Check the panel for details.`
        );
      }
    } catch (err) {
      this._postMessage('error', { message: `Ticket creation failed: ${err.message}` });
    }
  }

  /** Test Jira connection and push status to webview. */
  async _handleTestConnection() {
    this._postMessage('connStatus', { text: 'Verifying…', statusType: 'loading' });
    const credential = await this._config.getCredential();
    if (!credential) {
      this._postMessage('connStatus', {
        text: 'No cookie yet — install the Jira Token Relay Chrome extension, log in to Jira, and click Sync Now.',
        statusType: 'warning',
      });
      return;
    }
    const result = await this._jiraClient.testConnection();
    if (result.success) {
      this._postMessage('connStatus', { text: `✓ Connected as ${result.user}`, statusType: 'success' });
    } else {
      this._postMessage('connStatus', {
        text: `Not connected: ${result.error} — re-sync cookies via the Chrome extension.`,
        statusType: 'error',
      });
    }
  }

  /**
   * Called by the local server when a fresh cookie arrives from Chrome.
   * Updates stored credential and re-tests the connection.
   */
  notifyCookieUpdated() {
    if (this._panel) {
      this._handleTestConnection();
    }
  }

  /** Load prompts from a file */
  async _handleLoadFile() {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'Text Files': ['txt', 'csv', 'md'], 'All Files': ['*'] },
    });
    if (uris && uris.length > 0) {
      const content = fs.readFileSync(uris[0].fsPath, 'utf-8');
      this._postMessage('setPrompt', { text: content });
    }
  }

  /** Send a message to the webview */
  _postMessage(command, data) {
    if (this._panel) {
      this._panel.webview.postMessage({ command, ...data });
    }
  }

  /** Build the webview HTML */
  _getHtml(webview) {
    const mediaPath = path.join(this._context.extensionPath, 'media');
    const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'styles.css')));
    const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(mediaPath, 'main.js')));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Jira Ticket Creator</title>
</head>
<body>
  <div class="container">
    <header>
      <h1>Jira Ticket Creator</h1>
      <div class="header-actions">
        <span id="conn-status" class="conn-status"></span>
        <button id="btn-settings" class="btn btn-sm">Settings</button>
      </div>
    </header>

    <section class="config-bar">
      <div class="field">
        <label for="project-key">Project</label>
        <input type="text" id="project-key" placeholder="e.g., KODIAK">
      </div>
      <div class="field">
        <label for="issue-type">Default Type</label>
        <select id="issue-type"></select>
      </div>
    </section>

    <section class="prompt-section">
      <label for="prompt-input">Issue Description(s) <span class="hint">— one per line for bulk creation</span></label>
      <textarea id="prompt-input" rows="8" placeholder="Login page crashes on Safari when using SSO with special characters in password&#10;Export PDF button returns 500 error on large reports&#10;Dashboard widgets don't auto-refresh after editing"></textarea>
      <div class="prompt-actions">
        <button id="btn-generate" class="btn btn-primary">Generate with AI</button>
        <button id="btn-load" class="btn btn-secondary">Load from File</button>
      </div>
    </section>

    <section id="status-bar" class="status-bar hidden"></section>

    <section id="preview-section" class="preview-section hidden">
      <h2>Preview <span id="preview-count"></span></h2>
      <div class="table-wrapper">
        <table id="preview-table">
          <thead>
            <tr>
              <th><input type="checkbox" id="select-all" checked></th>
              <th>#</th>
              <th>Summary</th>
              <th>Type</th>
              <th>Priority</th>
              <th>Parent</th>
              <th>Labels</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="preview-body"></tbody>
        </table>
      </div>
      <div class="create-actions">
        <button id="btn-create" class="btn btn-primary">Create Selected</button>
        <button id="btn-create-all" class="btn btn-secondary">Create All</button>
      </div>
    </section>

    <section id="results-section" class="results-section hidden">
      <h2>Results</h2>
      <div id="results-list"></div>
    </section>

    <!-- Edit modal -->
    <div id="edit-modal" class="modal hidden">
      <div class="modal-content">
        <h3>Edit Ticket</h3>
        <input type="hidden" id="edit-index">
        <div class="field">
          <label>Summary</label>
          <input type="text" id="edit-summary">
        </div>
        <div class="field">
          <label>Description</label>
          <textarea id="edit-description" rows="6"></textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Type</label>
            <select id="edit-type"></select>
          </div>
          <div class="field">
            <label>Priority</label>
            <select id="edit-priority">
              <option>Highest</option>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
              <option>Lowest</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Labels <span class="hint">(comma-separated)</span></label>
          <input type="text" id="edit-labels">
        </div>
        <div class="field">
          <label>Parent Issue Key <span class="hint">(required for Sub-task, e.g. PROJ-123)</span></label>
          <input type="text" id="edit-parent" placeholder="e.g. PROJ-123">
        </div>
        <div class="modal-actions">
          <button id="btn-save-edit" class="btn btn-primary">Save</button>
          <button id="btn-cancel-edit" class="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce() {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

module.exports = { WebviewProvider };
