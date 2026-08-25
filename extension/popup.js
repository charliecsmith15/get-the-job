import { getSettings, buildJobPayload, createJob, originPatternFor } from './common.js';

const states = ['loading', 'denied', 'unconfigured', 'form'];
function showState(name) {
  for (const s of states) {
    document.getElementById(s).classList.toggle('hidden', s !== name);
  }
}

document.getElementById('denied-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('unconfigured-settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

const statusSelect = document.getElementById('status');
const dateAppliedWrap = document.getElementById('dateApplied-wrap');
statusSelect.addEventListener('change', () => {
  dateAppliedWrap.classList.toggle('hidden', statusSelect.value !== 'Applied');
});

async function getActiveTab() {
  const { gtj_source_tab: tab } = await chrome.storage.local.get('gtj_source_tab');
  return tab || null;
}

document.getElementById('close').addEventListener('click', () => window.close());

const EMAIL_CACHE_KEY = 'gtj_email_cache';
const EMAIL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getSignedInEmail() {
  const { [EMAIL_CACHE_KEY]: cached } = await chrome.storage.local.get(EMAIL_CACHE_KEY);
  if (cached && Date.now() - cached.ts < EMAIL_CACHE_TTL) return cached.email;

  return new Promise((resolve) => {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, async (info) => {
      const email = info && info.email ? info.email.toLowerCase() : '';
      await chrome.storage.local.set({ [EMAIL_CACHE_KEY]: { email, ts: Date.now() } });
      resolve(email);
    });
  });
}

async function init() {
  try {
    const [settings, tab] = await Promise.all([getSettings(), getActiveTab()]);

    if (!settings.backendUrl) { showState('unconfigured'); return; }

    const pattern = originPatternFor(settings.backendUrl);
    const hasPermission = pattern && (await chrome.permissions.contains({ origins: [pattern] }));
    if (!hasPermission) { showState('unconfigured'); return; }

    if (tab) {
      document.getElementById('url').value = tab.url || '';
      document.getElementById('title').value = tab.title || '';
    }

    showState('form');

    // Email check is a UX guard only — run it after the form is visible so it
    // never blocks load. Switch to denied if it comes back unauthorized.
    getSignedInEmail().then((email) => {
      if (!email || !settings.allowedEmails.includes(email)) {
        showState('denied');
      } else {
        document.getElementById('signed-in-as').textContent = `Signed in as ${email}`;
      }
    }).catch(() => {});
  } catch (err) {
    console.error('Get the Job popup init failed:', err);
    showState('unconfigured');
    return;
  }

  document.getElementById('submit').addEventListener('click', async () => {
    const submitBtn = document.getElementById('submit');
    const statusEl = document.getElementById('form-status');
    const title = document.getElementById('title').value.trim();
    const company = document.getElementById('company').value.trim();

    if (!title || !company) {
      statusEl.textContent = 'Job title and company are required.';
      statusEl.className = 'err';
      return;
    }

    const job = buildJobPayload({
      title,
      company,
      status: statusSelect.value,
      url: document.getElementById('url').value.trim(),
      description: document.getElementById('description').value.trim(),
      location: document.getElementById('location').value.trim(),
      dateApplied: document.getElementById('dateApplied').value,
      tags: document.getElementById('tags').value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });

    submitBtn.disabled = true;
    statusEl.textContent = 'Saving…';
    statusEl.className = '';
    try {
      await createJob(settings.backendUrl, job);
      statusEl.textContent = 'Saved to Get the Job!';
      statusEl.className = 'ok';
      setTimeout(() => window.close(), 900);
    } catch (e) {
      statusEl.textContent = e.message || 'Failed to save job.';
      statusEl.className = 'err';
      submitBtn.disabled = false;
    }
  });
}

init();
