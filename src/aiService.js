const vscode = require('vscode');

const DEFAULT_SYSTEM_PROMPT = `You are a Jira ticket creation assistant. Given a free-text issue description, extract and return a JSON object with these fields:

- summary: concise ticket title (max 100 characters)
- description: detailed description with reproduction steps if applicable
- issueType: one of [{issueTypes}] — infer from context (default to "Bug" if unclear)
- priority: one of ["Highest", "High", "Medium", "Low", "Lowest"] — infer from severity cues
- labels: array of relevant short labels (e.g., ["auth", "ui", "performance"])
- parent: if a parent issue key is mentioned (e.g. "parent is PROJ-123", "sub-task of PROJ-456"), set this to that key string. Otherwise omit this field entirely.

Return ONLY a valid JSON object. No markdown fences, no explanation, no extra text.

Example input: "Login page crashes on Safari when using SSO with special characters in password"
Example output: {"summary":"Login page crashes on Safari with SSO special character password","description":"The login page crashes on the Safari browser when a user attempts to log in via SSO (Single Sign-On) and their password contains special characters.\\n\\nSteps to Reproduce:\\n1. Open the login page in Safari\\n2. Select SSO login\\n3. Enter credentials with special characters in the password (e.g., p@ss!w#rd)\\n4. Click Sign In\\n5. Page crashes\\n\\nExpected: User should be logged in successfully.\\nActual: Page crashes with no error message.","issueType":"Bug","priority":"High","labels":["auth","sso","safari","login"]}

Example input: "4 core traffic test - parent task is UCSPLATFORM-5734"
Example output: {"summary":"4 Core Traffic Test","description":"Implement and run 4 core traffic tests as a sub-task.","issueType":"Sub-task","priority":"Medium","labels":["traffic","testing"],"parent":"UCSPLATFORM-5734"}`;

class AiService {
  /** @param {import('./configManager').ConfigManager} config */
  constructor(config) {
    this._config = config;
  }

  /** Build the system prompt, substituting issue types */
  _buildSystemPrompt() {
    const custom = this._config.promptTemplate;
    const issueTypes = this._config.issueTypes.join(', ');

    if (custom) {
      return custom
        .replace(/\{issueTypes\}/g, issueTypes)
        .replace(/\{description\}/g, '');
    }
    return DEFAULT_SYSTEM_PROMPT.replace(/\{issueTypes\}/g, issueTypes);
  }

  /**
   * Select an available Copilot language model.
   * Prefers GPT-4o, falls back to any available model.
   */
  async _getModel() {
    // Try to get any available chat model
    let models = await vscode.lm.selectChatModels();

    if (!models || models.length === 0) {
      throw new Error(
        'No language models available. Ensure GitHub Copilot is installed and active.'
      );
    }

    // Prefer a GPT-4o family model if available, otherwise take the first
    const preferred = models.find(
      m => m.family && (m.family.includes('gpt-4o') || m.family.includes('copilot'))
    );
    return preferred || models[0];
  }

  /**
   * Generate structured ticket fields from a free-text prompt.
   * @param {string} promptText - free-text issue description
   * @returns {Promise<object>} - parsed ticket fields
   */
  async generateTicketFields(promptText) {
    const model = await this._getModel();
    const systemPrompt = this._buildSystemPrompt();

    const messages = [
      vscode.LanguageModelChatMessage.User(
        `${systemPrompt}\n\n---\n\nIssue description:\n${promptText}`
      ),
    ];

    const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

    // Collect streamed response
    let fullText = '';
    for await (const chunk of response.text) {
      fullText += chunk;
    }

    // Parse JSON from response (handle possible markdown fences)
    const jsonText = fullText.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    try {
      return JSON.parse(jsonText);
    } catch {
      throw new Error(`AI returned invalid JSON: ${fullText.substring(0, 200)}`);
    }
  }

  /**
   * Generate ticket fields for multiple prompts.
   * @param {string[]} prompts - array of free-text issue descriptions
   * @returns {Promise<object[]>} - array of parsed ticket fields
   */
  async generateBulkTicketFields(prompts) {
    const results = [];
    for (const prompt of prompts) {
      try {
        const fields = await this.generateTicketFields(prompt);
        results.push({ ...fields, _status: 'ok', _originalPrompt: prompt });
      } catch (err) {
        results.push({
          summary: prompt.substring(0, 100),
          description: prompt,
          issueType: this._config.defaultIssueType,
          priority: 'Medium',
          labels: [],
          _status: 'error',
          _error: err.message,
          _originalPrompt: prompt,
        });
      }
    }
    return results;
  }
}

module.exports = { AiService };
