# Jira Ticket Creator — VS Code Extension

A VS Code extension that creates Jira tickets from free-text issue descriptions using AI. Supports single and bulk ticket creation with AI-powered field extraction via GitHub Copilot's built-in language models.

## Features

- **AI-Powered Field Extraction** — Describe an issue in plain English. The AI extracts summary, description, type, priority, and labels automatically.
- **Bulk Creation** — Enter multiple issue descriptions (one per line) or load from a file. Generate and create all tickets at once.
- **Create from Selection** — Select text in any editor, right-click, and create a Jira ticket directly.
- **Preview & Edit** — Review AI-generated fields in a table before creating. Edit any field inline.
- **Jira Cloud + Server/Data Center** — Works with both Jira Cloud (`*.atlassian.net`) and Jira Server/Data Center instances.
- **Fully Customizable** — Configure project key, issue types, custom fields, labels, components, and even the AI prompt template per team.
- **Secure** — Credentials are stored in VS Code's encrypted SecretStorage. Never written to settings files.
- **Zero Dependencies** — Uses only VS Code built-in APIs. No `node_modules` required.

## Quick Start

### 1. Install

Open the `jira-ticket-creator` folder in VS Code and press **F5** to launch the Extension Development Host.

> To package as a `.vsix` for distribution: `npx @vscode/vsce package`

### 2. Configure

Open VS Code Settings (`Ctrl+,`) and search for **"Jira Ticket Creator"**:

| Setting | Example | Description |
|---|---|---|
| `baseUrl` | `https://jira.example.com` | Your Jira instance URL |
| `projectKey` | `MYPROJECT` | Default project key for new tickets |
| `authType` | `pat` | `pat` (Server/DC), `basic` (legacy), or `apiToken` (Cloud) |
| `username` | `john.doe` | Required for `basic` and `apiToken` auth types |

### 3. Authenticate

Run **"Jira: Configure Jira Authentication"** from the Command Palette (`Ctrl+Shift+P`) and enter your credential:

- **Server/Data Center**: Personal Access Token (PAT) — generate from Jira > Profile > Personal Access Tokens
- **Jira Cloud**: API Token — generate from [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

### 4. Create Tickets

Run **"Jira: Create Jira Ticket(s)"** from the Command Palette, then:

1. Enter one or more issue descriptions in the text area (one per line for bulk)
2. Click **"Generate with AI"** — Copilot extracts structured fields
3. Review the preview table, edit any fields if needed
4. Click **"Create All"** or select specific tickets and click **"Create Selected"**

## Commands

| Command | Description | Access |
|---|---|---|
| `Jira: Create Jira Ticket(s)` | Open the ticket creator panel | Command Palette |
| `Jira: Create Jira Ticket from Selection` | Create a ticket from selected editor text | Right-click menu |
| `Jira: Configure Jira Authentication` | Set up Jira credentials | Command Palette |

## All Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | string | `""` | Jira instance URL |
| `projectKey` | string | `""` | Default project key |
| `authType` | enum | `"pat"` | Auth method: `pat`, `basic`, or `apiToken` |
| `username` | string | `""` | Username or email (for basic/apiToken) |
| `defaultIssueType` | string | `"Bug"` | Default issue type for new tickets |
| `issueTypes` | string[] | `["Bug","Story","Task","Sub-task"]` | Issue types shown in the dropdown |
| `customFields` | object | `{}` | Custom Jira fields (e.g., `{"customfield_10001": "value"}`) |
| `promptTemplate` | string | `""` | Custom AI prompt (use `{issueTypes}` placeholder) |
| `defaultLabels` | string[] | `[]` | Labels auto-applied to every ticket |
| `defaultComponents` | string[] | `[]` | Components auto-applied to every ticket |

## Setting Up for Your Team

The extension is designed so any team can use it by configuring their own settings. No code changes needed.

**Option A — Workspace Settings**
Add to `.vscode/settings.json` in your project:
```json
{
  "jiraTicketCreator.baseUrl": "https://jira.yourcompany.com",
  "jiraTicketCreator.projectKey": "TEAMPROJECT",
  "jiraTicketCreator.authType": "pat",
  "jiraTicketCreator.issueTypes": ["Bug", "Story", "Task"],
  "jiraTicketCreator.defaultLabels": ["qa-reported"]
}
```

**Option B — Custom AI Prompt**
Override the AI behavior for your team's workflow:
```json
{
  "jiraTicketCreator.promptTemplate": "You are a QA ticket assistant for the TEAMPROJECT project. Given a bug report, return JSON with: summary, description (include steps to reproduce, expected vs actual), issueType (always 'Bug'), priority, labels. Available types: {issueTypes}. Return ONLY valid JSON."
}
```

## Prerequisites

- **VS Code** 1.93 or later
- **GitHub Copilot** extension installed and active (provides the AI models)
- A **Jira** account with permission to create issues

## Project Structure

```
jira-ticket-creator/
├── package.json              # Extension manifest, commands, settings
├── src/
│   ├── extension.js          # Entry point, command registration
│   ├── configManager.js      # Settings + credential management
│   ├── jiraClient.js         # Jira REST API (Cloud + Server/DC)
│   ├── aiService.js          # Copilot Language Model API
│   └── webviewProvider.js    # Webview panel + messaging
├── media/
│   ├── main.js               # Webview UI logic
│   └── styles.css            # Theme-aware styles
└── docs/
    └── copilot-agent-prompt.md  # Prompt to rebuild this tool via AI
```

## Rebuilding with AI

The `docs/copilot-agent-prompt.md` file contains a comprehensive specification for this extension. You can paste it into GitHub Copilot (Agent mode), Cursor, or any AI coding assistant to have it rebuild the entire extension from scratch — useful for forking, customizing, or porting to a different platform.


