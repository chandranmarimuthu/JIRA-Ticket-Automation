const JIRA_HOST = 'jira.mycompany.com';
const VSCODE_ENDPOINT = 'http://localhost:27836/jira-cookie';

// Watch for any cookie change on the Jira domain
chrome.cookies.onChanged.addListener(({ cookie }) => {
  if (cookie.domain.includes(JIRA_HOST)) {
    syncCookies();
  }
});

// Sync on browser startup and extension install/update
chrome.runtime.onStartup.addListener(syncCookies);
chrome.runtime.onInstalled.addListener(syncCookies);

// Allow popup to trigger a manual sync
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'sync') {
    syncCookies().then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }
});

async function syncCookies() {
  const cookies = await chrome.cookies.getAll({ domain: JIRA_HOST });

  if (cookies.length === 0) {
    await chrome.storage.local.set({ status: 'no_cookies', lastSync: null });
    return;
  }

  // Build a Cookie header value from all cookies for the domain
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  try {
    const response = await fetch(VSCODE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie: cookieHeader }),
    });

    const data = await response.json();
    if (data.ok) {
      await chrome.storage.local.set({ status: 'ok', lastSync: Date.now(), error: null });
    } else {
      await chrome.storage.local.set({ status: 'error', error: data.error, lastSync: Date.now() });
    }
  } catch {
    // VS Code not running or panel not open yet — that's fine
    await chrome.storage.local.set({ status: 'vscode_offline', lastSync: Date.now() });
  }
}
