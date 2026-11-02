const vscode = require('vscode');

class JiraClient {
  /** @param {import('./configManager').ConfigManager} config */
  constructor(config) {
    this._config = config;
  }

  /**
   * Make an authenticated request to the Jira REST API.
   * @param {string} path - API path (e.g., /rest/api/2/issue)
   * @param {object} options - fetch options
   * @returns {Promise<{ok: boolean, status: number, data: any}>}
   */
  async _request(path, options = {}) {
    const auth = await this._config.getAuthHeaders();
    if (!auth) {
      throw new Error('No Jira credentials configured. Run "Jira: Configure Authentication" first.');
    }

    const url = `${this._config.baseUrl}${path}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    };

    if (auth.authHeader) {
      headers['Authorization'] = auth.authHeader;
    }
    if (auth.cookieHeader) {
      headers['Cookie'] = auth.cookieHeader;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data;
    const text = await response.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return { ok: response.ok, status: response.status, data };
  }

  /** Test connection to Jira */
  async testConnection() {
    try {
      const result = await this._request(`${this._config.apiBase}/myself`);
      if (result.ok) {
        return { success: true, user: result.data.displayName || result.data.name };
      }
      return { success: false, error: `HTTP ${result.status}: ${JSON.stringify(result.data)}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /** Fetch available projects */
  async getProjects() {
    const result = await this._request(`${this._config.apiBase}/project`);
    if (!result.ok) {
      throw new Error(`Failed to fetch projects: ${result.status}`);
    }
    return result.data.map(p => ({ key: p.key, name: p.name }));
  }

  /** Fetch issue types for a project */
  async getIssueTypes(projectKey) {
    const result = await this._request(
      `${this._config.apiBase}/project/${projectKey}`
    );
    if (!result.ok) {
      throw new Error(`Failed to fetch issue types: ${result.status}`);
    }
    return result.data.issueTypes.map(t => ({ id: t.id, name: t.name }));
  }

  /**
   * Create a single Jira issue.
   * @param {object} ticketFields - { summary, description, issueType, priority, labels, components }
   * @returns {Promise<{success: boolean, key?: string, url?: string, error?: string}>}
   */
  async createIssue(ticketFields) {
    const config = this._config;
    const fields = {
      project: { key: ticketFields.projectKey || config.projectKey },
      summary: ticketFields.summary,
      issuetype: { name: ticketFields.issueType || config.defaultIssueType },
    };

    // Description: Cloud uses ADF, Server uses plain text/wiki
    if (ticketFields.description) {
      if (config.isCloud) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: ticketFields.description }],
            },
          ],
        };
      } else {
        fields.description = ticketFields.description;
      }
    }

    // Parent issue — required for Sub-task issue type
    if (ticketFields.parent) {
      fields.parent = { key: ticketFields.parent };
    }

    // Only send priority if the Jira screen allows it
    if (ticketFields.priority && config.get('sendPriority')) {
      fields.priority = { name: ticketFields.priority };
    }

    // Merge default + AI-generated labels
    const labels = [
      ...(config.defaultLabels || []),
      ...(ticketFields.labels || []),
    ];
    if (labels.length > 0) {
      fields.labels = [...new Set(labels)];
    }

    // Merge default + AI-generated components
    const components = [
      ...(config.defaultComponents || []).map(c => ({ name: c })),
      ...(ticketFields.components || []).map(c => typeof c === 'string' ? { name: c } : c),
    ];
    if (components.length > 0) {
      fields.components = components;
    }

    // Apply custom fields
    const customFields = config.customFields;
    for (const [fieldId, value] of Object.entries(customFields)) {
      if (!(fieldId in fields)) {
        fields[fieldId] = value;
      }
    }

    try {
      const result = await this._request(`${config.apiBase}/issue`, {
        method: 'POST',
        body: JSON.stringify({ fields }),
      });

      if (result.ok) {
        const key = result.data.key;
        const url = `${config.baseUrl}/browse/${key}`;
        return { success: true, key, url };
      }

      // Extract Jira error messages
      const errors = result.data.errors
        ? Object.values(result.data.errors).join('; ')
        : result.data.errorMessages
          ? result.data.errorMessages.join('; ')
          : `HTTP ${result.status}`;
      return { success: false, error: errors };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Create multiple Jira issues.
   * @param {object[]} ticketsArray - array of ticket field objects
   * @returns {Promise<Array<{success: boolean, key?: string, url?: string, error?: string, summary: string}>>}
   */
  async bulkCreateIssues(ticketsArray) {
    const results = [];
    for (const ticket of ticketsArray) {
      const result = await this.createIssue(ticket);
      results.push({ ...result, summary: ticket.summary });
    }
    return results;
  }
}

module.exports = { JiraClient };
