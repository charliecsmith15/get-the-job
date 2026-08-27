import { STORAGE_KEYS, DEFAULT_ALLOWED_EMAILS, getSettings, originPatternFor } from './common.js';

const backendUrlInput = document.getElementById('backendUrl');
const allowedEmailsInput = document.getElementById('allowedEmails');
const statusEl = document.getElementById('status');

async function load() {
  const settings = await getSettings();
  backendUrlInput.value = settings.backendUrl;
  allowedEmailsInput.value = settings.allowedEmails.length
    ? settings.allowedEmails.join(', ')
    : DEFAULT_ALLOWED_EMAILS;
}

function showStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'err' : 'ok';
}

document.getElementById('save').addEventListener('click', async () => {
  const backendUrl = backendUrlInput.value.trim().replace(/\/$/, '');
  const allowedEmails = allowedEmailsInput.value.trim() || DEFAULT_ALLOWED_EMAILS;

  if (!backendUrl) {
    showStatus('Backend API base URL is required.', true);
    return;
  }

  const pattern = originPatternFor(backendUrl);
  if (!pattern) {
    showStatus('That doesn\'t look like a valid URL.', true);
    return;
  }

  try {
    const granted = await chrome.permissions.request({ origins: [pattern] });
    if (!granted) {
      showStatus('Permission to reach that backend was not granted, so it was not saved.', true);
      return;
    }
  } catch (e) {
    showStatus(`Could not request permission: ${e.message}`, true);
    return;
  }

  await chrome.storage.sync.set({
    [STORAGE_KEYS.backendUrl]: backendUrl,
    [STORAGE_KEYS.allowedEmails]: allowedEmails,
  });
  showStatus('Saved.', false);
});

load();

const redirectEl = document.getElementById('redirectUrl');
if (redirectEl) redirectEl.textContent = chrome.identity.getRedirectURL();
