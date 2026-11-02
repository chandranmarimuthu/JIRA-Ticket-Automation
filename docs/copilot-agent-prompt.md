# Copilot Agent Prompt: Build a Jira Ticket Creator VS Code Extension

> **How to use**: Copy this entire document and paste it as a prompt into GitHub Copilot Chat (Agent mode / `@workspace`) in VS Code. Copilot will scaffold and build the entire extension for you. You can also use it with Cursor, or any AI coding agent.

---

## Task

Build a VS Code extension called **"Jira Ticket Creator"** that allows users to create Jira tickets (single or bulk) from free-text issue descriptions, using AI to auto-extract structured Jira fields.

## Requirements

### 1. Project Setup
- Language: **JavaScript** (no TypeScript, no build step)
- VS Code engine: `^1.93.0`
- No external npm dependencies — use only VS Code APIs and built-in `fetch`
- Extension ID: `jira-ticket-creator`

### 2. Commands (register in package.json + extension.js)
| Command ID | Title | Context |
|---|---|---|
| `jiraTicketCreator.openPanel` | Create Jira Ticket(s) | Command palette |
| `jiraTicketCreator.createFromSelection` | Create Jira Ticket from Selection | Editor right-click menu (when text is selected) |
| `jiraTicketCreator.configureAuth` | Configure Jira Authentication | Command palette |

### 3. Configuration Settings (package.json `contributes.configuration`)
All settings prefixed with `jiraTicketCreator.`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `baseUrl` | string | `""` | Jira base URL (e.g., `https://jira.example.com` or `https://org.atlassian.net`) |
| `projectKey` | string | `""` | Default Jira project key |
| `authType` | enum | `"pat"` | Auth method: `"pat"` (Personal Access Token), `"basic"` (username+password), `"apiToken"` (Jira Cloud email+token) |
| `username` | string | `""` | Username/email for basic or apiToken auth |
| `defaultIssueType` | string | `"Bug"` | Default issue type |
| `issueTypes` | string[] | `["Bug","Story","Task","Sub-task"]` | Available issue types in UI |
| `customFields` | object | `{}` | Custom Jira fields as `{ "customfield_10001": "value" }` |
| `promptTemplate` | string | `""` | Custom AI system prompt (supports `{issueTypes}` placeholder) |
| `defaultLabels` | string[] | `[]` | Labels auto-added to every ticket |
| `defaultComponents` | string[] | `[]` | Components auto-added to every ticket |

### 4. Architecture (src/ files)

#### `src/extension.js` — Entry point
- Instantiate ConfigManager, JiraClient, AiService, WebviewProvider
- Register all 3 commands
- `createFromSelection` gets the selected editor text and opens the webview pre-filled

#### `src/configManager.js` — Settings + Secrets
- Read all `jiraTicketCreator.*` settings via `vscode.workspace.getConfiguration`
- Store credentials in `vscode.ExtensionContext.secrets` (SecretStorage), NEVER in settings
- `getAuthHeader()`: Returns `Bearer {PAT}` for pat auth, `Basic base64(user:credential)` for basic/apiToken
- `validate()`: Check required settings are present (baseUrl, projectKey, username for non-pat)
- `promptForCredentials()`: Show password input box, store in secrets
- `isCloud` getter: `true` if baseUrl contains `.atlassian.net`
- `apiBase` getter: `/rest/api/3` for cloud, `/rest/api/2` for server

#### `src/jiraClient.js` — Jira REST API
- Private `_request(path, options)` method: prepends baseUrl, adds auth header, parses JSON response
- `testConnection()`: `GET {apiBase}/myself` — returns `{ success, user }` or `{ success: false, error }`
- `getProjects()`: `GET {apiBase}/project`
- `getIssueTypes(projectKey)`: `GET {apiBase}/project/{key}` → extract issueTypes
- `createIssue(ticketFields)`: `POST {apiBase}/issue`
  - Build `fields` object: project.key, summary, issuetype.name, priority.name, labels, components
  - For Cloud: description must be in ADF format (`{ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "..." }] }] }`)
  - For Server/DC: description is plain text string
  - Merge `defaultLabels` and `defaultComponents` from settings
  - Apply `customFields` from settings
  - Return `{ success, key, url }` or `{ success: false, error }`
- `bulkCreateIssues(array)`: Loop and call `createIssue` for each, return results array

#### `src/aiService.js` — GitHub Copilot Language Model API
- Use `vscode.lm.selectChatModels()` to get available Copilot models
- Default system prompt (customizable via settings):
  ```
  You are a Jira ticket creation assistant. Given a free-text issue description, extract and return a JSON object with these fields:
  - summary: concise ticket title (max 100 chars)
  - description: detailed description with reproduction steps if applicable
  - issueType: one of [{issueTypes}] — infer from context
  - priority: one of ["Highest", "High", "Medium", "Low", "Lowest"]
  - labels: array of relevant labels
  Return ONLY valid JSON, no markdown fences.
  ```
- `generateTicketFields(promptText)`: Send to model via `model.sendRequest()`, collect streamed response, parse JSON
- `generateBulkTicketFields(prompts[])`: Process each prompt, catch errors per-ticket (don't fail the whole batch)
- Strip markdown fences from response before JSON.parse

#### `src/webviewProvider.js` — Webview Panel
- Create a `vscode.WebviewPanel` with `enableScripts: true`, `retainContextWhenHidden: true`
- Load HTML with CSP-restricted inline styles and nonce-protected scripts
- Load external CSS (`media/styles.css`) and JS (`media/main.js`) via `webview.asWebviewUri`
- Handle messages from webview: `generate`, `create`, `testConnection`, `loadFile`, `configureAuth`, `openSettings`
- `show(initialText?)`: Create or reveal panel, optionally pre-fill prompt
- Send `init` message with config (projectKey, issueTypes, defaultIssueType) on panel open

### 5. Webview UI (`media/` files)

#### `media/main.js` — Webview-side JavaScript
All UI logic runs here (not in extension process). Communicates via `vscode.postMessage` / `window.addEventListener('message')`.

**Layout sections:**
1. **Header**: Title + buttons (Test Connection, Configure Auth, Settings)
2. **Config bar**: Project key input + Default issue type dropdown
3. **Prompt area**: Textarea for issue descriptions (one per line for bulk) + "Generate with AI" button + "Load from File" button
4. **Status bar**: Shows loading spinner, success, or error messages
5. **Preview table**: Checkbox | # | Summary | Type | Priority | Labels | Edit button — each row is an AI-generated ticket
6. **Create actions**: "Create Selected" + "Create All" buttons
7. **Results list**: Shows created ticket keys (as links) or error messages
8. **Edit modal**: Overlay form to edit individual ticket fields (summary, description, type, priority, labels)

**Features:**
- Select/deselect all checkbox in table header
- Edit modal with save/cancel
- Editable fields before creation
- Priority badges with color coding (Highest=red, High=orange, Medium=yellow, Low=green, Lowest=blue)
- Label tags as rounded pill badges
- Escape all user content to prevent XSS (create text nodes, read innerHTML)

#### `media/styles.css` — Webview Styles
- Use VS Code CSS variables throughout: `--vscode-editor-background`, `--vscode-button-background`, `--vscode-input-background`, etc.
- This ensures the extension looks native in any VS Code theme (dark, light, high contrast)
- Loading spinner animation for status bar
- Modal overlay with backdrop
- Responsive table with sticky header
- Priority badge colors and label pill styles

### 6. Auth Flow (First-Time User Experience)
1. User runs "Create Jira Ticket(s)" command
2. Extension checks `baseUrl` and `projectKey` in settings
3. If missing → show error with "Click Settings to configure"
4. Check if credential exists in SecretStorage
5. If missing → show error with "Click Configure Auth to set up"
6. If present → open webview panel

### 7. File Structure
```
jira-ticket-creator/
├── package.json
├── .gitignore          (node_modules/, *.vsix, .vscode-test/)
├── .vscodeignore       (.vscode/**, node_modules/**, docs/**)
├── src/
│   ├── extension.js
│   ├── configManager.js
│   ├── jiraClient.js
│   ├── aiService.js
│   └── webviewProvider.js
├── media/
│   ├── main.js
│   └── styles.css
└── docs/
```

### 8. Key Implementation Notes
- **No npm dependencies**: Use built-in `fetch` (available in VS Code 1.93+) for HTTP requests
- **VS Code LM API**: `vscode.lm.selectChatModels()` returns models from the user's Copilot subscription — no API keys needed
- **Message format for LM**: Use `vscode.LanguageModelChatMessage.User(text)` — combine system prompt and user text in a single user message
- **Stream response**: `model.sendRequest()` returns an async iterable — collect chunks via `for await (const chunk of response.text)`
- **CSP**: Webview must have Content-Security-Policy with `script-src 'nonce-{nonce}'` for security
- **Secret storage**: `context.secrets.store(key, value)` / `context.secrets.get(key)` — encrypted by VS Code
- **Jira API v2 vs v3**: Server/DC uses v2 (description is string), Cloud uses v3 (description is ADF JSON)

---

## Customization Points for Other Teams

Teams can customize without touching code:
1. **Jira instance**: Change `baseUrl` and `authType` in settings
2. **Project & types**: Change `projectKey`, `issueTypes`, `defaultIssueType`
3. **Custom fields**: Add Jira custom field IDs and defaults via `customFields` setting
4. **AI behavior**: Override the AI prompt via `promptTemplate` setting
5. **Auto-labels/components**: Set `defaultLabels` and `defaultComponents`

---

### 9. Launch Configuration
Create `.vscode/launch.json` for F5 debugging:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"]
    }
  ]
}
```

---

## User-Facing Usage Guide

Include this information in the README so end users know how to use the extension after installing.

### Installation
1. Package: run `npx @vscode/vsce package` in the project root → produces a `.vsix` file
2. In VS Code: `Ctrl+Shift+P` → "Extensions: Install from VSIX..." → select the `.vsix` file
3. Reload VS Code

### First-Time Setup
1. Open VS Code Settings (`Ctrl+,`) → search "Jira Ticket Creator"
2. Set `baseUrl` (e.g., `https://jira.example.com`), `projectKey` (e.g., `MYPROJECT`), `authType` (`pat` for Server/DC)
3. `Ctrl+Shift+P` → "Jira: Configure Jira Authentication" → paste PAT

### Ways to Open the Extension
1. **Command Palette**: `Ctrl+Shift+P` → "Jira: Create Jira Ticket(s)"
2. **Right-click selection**: Select text in editor → right-click → "Create Jira Ticket from Selection"
3. **Custom keyboard shortcut**: Bind `jiraTicketCreator.openPanel` to any key combo via Keyboard Shortcuts (`Ctrl+K Ctrl+S`)

### Workflow: Single Ticket
1. Open the panel → type an issue description → "Generate with AI"
2. AI populates Summary, Description, Type, Priority, Labels in a preview table
3. Click "Edit" on any row to modify fields → "Create All"

### Workflow: Bulk Tickets
1. Enter multiple issue descriptions, one per line (or click "Load from File" to load from a `.txt`/`.csv`)
2. "Generate with AI" processes all lines → preview table shows all tickets
3. Use checkboxes to select/deselect → "Create Selected" or "Create All"

### Panel Buttons
| Button | What It Does |
|---|---|
| Test Connection | Verifies Jira credentials, shows your display name |
| Configure Auth | Opens PAT/token input prompt |
| Settings | Opens VS Code settings for this extension |
| Generate with AI | Sends prompts to Copilot, populates preview table |
| Load from File | Loads issue descriptions from a text file |
| Edit (per row) | Opens modal to edit ticket fields before creation |
| Create Selected | Creates only checked tickets |
| Create All | Creates all previewed tickets |

### Troubleshooting
| Issue | Fix |
|---|---|
| "No language models available" | Install and sign in to GitHub Copilot |
| "No Jira credentials configured" | `Ctrl+Shift+P` → "Jira: Configure Jira Authentication" |
| "Missing settings: baseUrl, projectKey" | Open Settings → fill in Jira URL and project key |
| 401 on connection test | PAT expired — regenerate in Jira and re-configure |
| Network error | Check VPN, verify Jira URL is reachable |

---

## How to Test (Development)
1. Open the `jira-ticket-creator` folder in VS Code
2. Press `F5` to launch Extension Development Host
3. In the new window, open command palette → "Jira: Create Jira Ticket(s)"
4. Configure settings (baseUrl, projectKey) and auth (PAT) when prompted
5. Enter a test issue description → click "Generate with AI" → verify preview
6. Click "Create All" → verify ticket created in Jira
7. Test bulk: enter multiple lines → generate → create all
8. Test right-click: select text in editor → right-click → "Create Jira Ticket from Selection"
9. Test packaging: `npx @vscode/vsce package` → install `.vsix` → verify all commands work
