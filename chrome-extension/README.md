# Jira Token Relay — Chrome Extension

This Chrome extension automatically relays your Jira session cookies to the **Jira Ticket Creator** VS Code extension, so you never need to manually enter credentials.

## How to install (unpacked/developer mode)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder inside this repository
5. The extension icon (puzzle piece → "Jira Token Relay") will appear in your toolbar

## How it works

1. Make sure the **Jira Ticket Creator** panel is open in VS Code (the local relay server must be running)
2. Log in to `https://jira.mycompany.com` normally in Chrome
3. The extension detects the session cookies automatically and POSTs them to `http://localhost:27836/jira-cookie`
4. VS Code stores the cookie securely and the panel shows **✓ Connected as \<your name\>**

The extension re-syncs every time a Jira cookie changes (e.g. after login or session refresh).  
Click the extension popup → **Sync Now** to force an immediate sync.

## Troubleshooting

| Popup message | Fix |
|---|---|
| *VS Code extension not running* | Open the Jira Ticket Creator panel in VS Code first, then click Sync Now |
| *No Jira session found* | Log in to Jira in Chrome, then click Sync Now |
| *Error: …* | Check the VS Code Developer Console for details |
