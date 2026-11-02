const vscode = require('vscode');

const SECRET_KEY = 'jiraTicketCreator.cookie';

class ConfigManager {
  /** @param {vscode.ExtensionContext} context */
  constructor(context) {
    this._context = context;
    this._secrets = context.secrets;
  }

  /** Get a configuration value */
  get(key) {
    return vscode.workspace.getConfiguration('jiraTicketCreator').get(key);
  }

  get baseUrl() {
    return (this.get('baseUrl') || '').replace(/\/+$/, '');
  }

  get projectKey() {
    return this.get('projectKey') || '';
  }

  get defaultIssueType() {
    return this.get('defaultIssueType') || 'Bug';
  }

  get issueTypes() {
    return this.get('issueTypes') || ['Bug', 'Story', 'Task', 'Sub-task'];
  }

  get customFields() {
    return this.get('customFields') || {};
  }

  get promptTemplate() {
    return this.get('promptTemplate') || '';
  }

  get defaultLabels() {
    return this.get('defaultLabels') || [];
  }

  get defaultComponents() {
    return this.get('defaultComponents') || [];
  }

  /** Check if Jira is a Cloud instance */
  get isCloud() {
    return this.baseUrl.includes('.atlassian.net');
  }

  /** Get the Jira REST API version path */
  get apiBase() {
    return this.isCloud ? '/rest/api/3' : '/rest/api/2';
  }

  /** Validate that required settings are present */
  validate() {
    const missing = [];
    if (!this.baseUrl) missing.push('baseUrl');
    if (!this.projectKey) missing.push('projectKey');
    return missing;
  }

  /** Retrieve the stored Jira session cookie. */
  async getCredential() {
    return await this._secrets.get(SECRET_KEY);
  }

  /** Persist the Jira session cookie received from the Chrome extension. */
  async setCredential(value) {
    await this._secrets.store(SECRET_KEY, value);
  }

  /** Clear stored cookie. */
  async clearCredential() {
    await this._secrets.delete(SECRET_KEY);
  }

  /**
   * Build auth headers using the stored session cookie.
   * @returns {Promise<{cookieHeader: string} | null>}
   */
  async getAuthHeaders() {
    const cookie = await this.getCredential();
    if (!cookie) return null;
    return { cookieHeader: cookie };
  }

  /** Open the extension settings UI */
  async openSettings() {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      'jiraTicketCreator'
    );
  }
}

module.exports = { ConfigManager };
