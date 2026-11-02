// @ts-nocheck
(function () {
  // Acquire VS Code API
  const vscode = acquireVsCodeApi();

  // State
  let tickets = [];
  let issueTypes = ['Bug', 'Story', 'Task', 'Sub-task'];
  let defaultIssueType = 'Bug';

  // DOM elements
  const projectKeyInput = document.getElementById('project-key');
  const issueTypeSelect = document.getElementById('issue-type');
  const promptInput = document.getElementById('prompt-input');
  const statusBar = document.getElementById('status-bar');
  const previewSection = document.getElementById('preview-section');
  const previewCount = document.getElementById('preview-count');
  const previewBody = document.getElementById('preview-body');
  const resultsSection = document.getElementById('results-section');
  const resultsList = document.getElementById('results-list');
  const editModal = document.getElementById('edit-modal');
  const selectAllCheckbox = document.getElementById('select-all');

  const connStatus = document.getElementById('conn-status');

  // Buttons
  document.getElementById('btn-generate').addEventListener('click', handleGenerate);
  document.getElementById('btn-load').addEventListener('click', () => vscode.postMessage({ command: 'loadFile' }));
  document.getElementById('btn-create').addEventListener('click', () => handleCreate(false));
  document.getElementById('btn-create-all').addEventListener('click', () => handleCreate(true));
  document.getElementById('btn-settings').addEventListener('click', () => vscode.postMessage({ command: 'openSettings' }));
  document.getElementById('btn-save-edit').addEventListener('click', saveEdit);
  document.getElementById('btn-cancel-edit').addEventListener('click', closeModal);
  selectAllCheckbox.addEventListener('change', toggleSelectAll);

  // Handle messages from extension
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.command) {
      case 'init':
        initConfig(msg.config);
        break;
      case 'setPrompt':
        promptInput.value = msg.text;
        break;
      case 'reverify':
        vscode.postMessage({ command: 'testConnection' });
        break;
      case 'connStatus':
        showConnectionStatus(msg.text, msg.statusType);
        break;
      case 'preview':
        showPreview(msg.tickets);
        break;
      case 'results':
        showResults(msg.results);
        break;
      case 'status':
        showStatus(msg.message, msg.loading, msg.type);
        break;
      case 'error':
        showStatus(msg.message, false, 'error');
        break;
    }
  });

  function initConfig(cfg) {
    if (cfg.projectKey) {
      projectKeyInput.value = cfg.projectKey;
    }
    if (cfg.issueTypes) {
      issueTypes = cfg.issueTypes;
    }
    if (cfg.defaultIssueType) {
      defaultIssueType = cfg.defaultIssueType;
    }
    populateIssueTypeSelect(issueTypeSelect, issueTypes, defaultIssueType);
    vscode.postMessage({ command: 'testConnection' });
  }

  function populateIssueTypeSelect(select, types, selected) {
    select.innerHTML = '';
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (t === selected) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function handleGenerate() {
    const text = promptInput.value.trim();
    if (!text) {
      showStatus('Enter at least one issue description.', false, 'error');
      return;
    }
    // Split by newlines, filter empty
    const prompts = text.split('\n').map(l => l.trim()).filter(Boolean);
    hideStatus();
    previewSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    vscode.postMessage({ command: 'generate', prompts });
  }

  function handleCreate(all) {
    const toCreate = [];
    const projectKey = projectKeyInput.value.trim();
    const overrideType = issueTypeSelect.value;

    tickets.forEach((t, i) => {
      const checkbox = document.getElementById(`chk-${i}`);
      if (all || (checkbox && checkbox.checked)) {
        toCreate.push({
          ...t,
          projectKey: projectKey || undefined,
          issueType: t.issueType || overrideType,
        });
      }
    });

    if (toCreate.length === 0) {
      showStatus('No tickets selected.', false, 'error');
      return;
    }

    vscode.postMessage({ command: 'create', tickets: toCreate });
  }

  function showPreview(data) {
    tickets = data;
    previewBody.innerHTML = '';
    previewCount.textContent = `(${data.length} ticket${data.length !== 1 ? 's' : ''})`;

    data.forEach((t, i) => {
      const tr = document.createElement('tr');
      if (t._status === 'error') tr.classList.add('ai-error-row');

      const labelsHtml = (t.labels || [])
        .map(l => `<span class="label-tag">${esc(l)}</span>`)
        .join('');

      const priorityClass = `priority-${t.priority || 'Medium'}`;

      tr.innerHTML = `
        <td><input type="checkbox" id="chk-${i}" checked></td>
        <td>${i + 1}</td>
        <td class="summary-cell" title="${esc(t.summary || '')}">${esc(t.summary || '')}</td>
        <td>${esc(t.issueType || defaultIssueType)}</td>
        <td><span class="priority-badge ${priorityClass}">${esc(t.priority || 'Medium')}</span></td>
        <td>${t.parent ? `<span class="label-tag">${esc(t.parent)}</span>` : ''}</td>
        <td><div class="labels">${labelsHtml}</div></td>
        <td><button class="btn btn-sm btn-secondary" data-edit="${i}">Edit</button></td>
      `;

      tr.querySelector(`[data-edit="${i}"]`).addEventListener('click', () => openEdit(i));
      previewBody.appendChild(tr);
    });

    previewSection.classList.remove('hidden');
    hideStatus();
  }

  function showResults(results) {
    resultsList.innerHTML = '';

    results.forEach(r => {
      const div = document.createElement('div');
      div.classList.add('result-item', r.success ? 'success' : 'failure');

      if (r.success) {
        div.innerHTML = `<span>&#10003;</span> <a href="${esc(r.url)}">${esc(r.key)}</a> — ${esc(r.summary)}`;
      } else {
        div.innerHTML = `<span>&#10007;</span> <strong>Failed:</strong> ${esc(r.summary)} — ${esc(r.error)}`;
      }

      resultsList.appendChild(div);
    });

    resultsSection.classList.remove('hidden');
    hideStatus();
  }

  function showStatus(message, loading, type) {
    statusBar.className = 'status-bar';
    if (loading) {
      statusBar.classList.add('loading');
      statusBar.innerHTML = `<span class="spinner"></span> ${esc(message)}`;
    } else {
      statusBar.classList.add(type || 'loading');
      statusBar.innerHTML = esc(message);
    }
    statusBar.classList.remove('hidden');
  }

  function hideStatus() {
    statusBar.classList.add('hidden');
  }

  function showConnectionStatus(text, type) {
    connStatus.className = `conn-status conn-status--${type}`;
    connStatus.textContent = text;
  }

  // Edit modal
  function openEdit(index) {
    const t = tickets[index];
    document.getElementById('edit-index').value = index;
    document.getElementById('edit-summary').value = t.summary || '';
    document.getElementById('edit-description').value = t.description || '';
    document.getElementById('edit-labels').value = (t.labels || []).join(', ');
    document.getElementById('edit-parent').value = t.parent || '';

    const typeSelect = document.getElementById('edit-type');
    populateIssueTypeSelect(typeSelect, issueTypes, t.issueType || defaultIssueType);

    const priSelect = document.getElementById('edit-priority');
    priSelect.value = t.priority || 'Medium';

    editModal.classList.remove('hidden');
  }

  function saveEdit() {
    const index = parseInt(document.getElementById('edit-index').value, 10);
    tickets[index].summary = document.getElementById('edit-summary').value;
    tickets[index].description = document.getElementById('edit-description').value;
    tickets[index].issueType = document.getElementById('edit-type').value;
    tickets[index].priority = document.getElementById('edit-priority').value;
    tickets[index].labels = document.getElementById('edit-labels').value
      .split(',')
      .map(l => l.trim())
      .filter(Boolean);
    tickets[index].parent = document.getElementById('edit-parent').value.trim() || undefined;

    closeModal();
    showPreview(tickets);
  }

  function closeModal() {
    editModal.classList.add('hidden');
  }

  function toggleSelectAll() {
    const checked = selectAllCheckbox.checked;
    tickets.forEach((_, i) => {
      const cb = document.getElementById(`chk-${i}`);
      if (cb) cb.checked = checked;
    });
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
