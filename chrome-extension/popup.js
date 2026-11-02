const statusBox = document.getElementById('status-box');
const dot = document.getElementById('dot');
const syncBtn = document.getElementById('btn-sync');

async function render() {
  const { status, lastSync, error } = await chrome.storage.local.get(['status', 'lastSync', 'error']);
  const since = lastSync
    ? `<div class="since">Last sync: ${new Date(lastSync).toLocaleTimeString()}</div>`
    : '';

  statusBox.className = 'status-box';

  if (status === 'ok') {
    statusBox.classList.add('ok');
    dot.style.background = '#34a853';
    statusBox.innerHTML = `✓ Cookies synced to VS Code${since}`;
  } else if (status === 'vscode_offline') {
    statusBox.classList.add('warn');
    dot.style.background = '#fbbc04';
    statusBox.innerHTML =
      `VS Code extension not running.${since}` +
      `<div class="since">Open the <strong>Jira Ticket Creator</strong> panel in VS Code first, then click Sync Now.</div>`;
  } else if (status === 'no_cookies') {
    statusBox.classList.add('warn');
    dot.style.background = '#fbbc04';
    statusBox.innerHTML =
      `No Jira session found.<br>` +
      `<a href="https://jira.mycompany.com" target="_blank">Log in to Jira</a> first, then click Sync Now.`;
  } else if (status === 'error') {
    statusBox.classList.add('err');
    dot.style.background = '#ea4335';
    statusBox.innerHTML = `Error: ${error || 'unknown'}${since}`;
  } else {
    statusBox.classList.add('info');
    dot.style.background = '#1a73e8';
    statusBox.innerHTML = 'Waiting for first sync…';
  }
}

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Syncing…';
  await chrome.runtime.sendMessage({ action: 'sync' });
  await render();
  syncBtn.disabled = false;
  syncBtn.textContent = 'Sync Now';
});

render();
