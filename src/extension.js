const vscode = require('vscode');
const { ConfigManager } = require('./configManager');
const { JiraClient } = require('./jiraClient');
const { AiService } = require('./aiService');
const { WebviewProvider } = require('./webviewProvider');
const { LocalServer } = require('./localServer');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const configManager = new ConfigManager(context);
  const jiraClient = new JiraClient(configManager);
  const aiService = new AiService(configManager);
  const webviewProvider = new WebviewProvider(context, configManager, jiraClient, aiService);

  // Local HTTP server that receives cookies from the Chrome extension
  const server = new LocalServer(async (cookie) => {
    await configManager.setCredential(cookie);
    webviewProvider.notifyCookieUpdated();
  });

  server.start()
    .then(port => console.log(`Jira Token Relay server listening on http://127.0.0.1:${port}`))
    .catch(err => vscode.window.showWarningMessage(`Jira Token Relay: could not start local server — ${err.message}`));

  context.subscriptions.push(
    { dispose: () => server.stop() },

    vscode.commands.registerCommand('jiraTicketCreator.openPanel', () => {
      webviewProvider.show();
    }),

    vscode.commands.registerCommand('jiraTicketCreator.createFromSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage('No text selected. Select text to create a Jira ticket.');
        return;
      }
      const selectedText = editor.document.getText(editor.selection);
      webviewProvider.show(selectedText);
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
