function detectSourceFromUrl(url) {
  try {
    const u = new URL(url);
    const utmSource = u.searchParams.get('utm_source') || u.searchParams.get('src') || '';
    if (utmSource) return utmSource;
    const host = u.hostname.toLowerCase();
    const SOURCE_HOSTS = [
      [/linkedin\.com/, 'linkedin'],
      [/indeed\.com/, 'indeed'],
      [/glassdoor\.com/, 'glassdoor'],
      [/handshake\.com/, 'handshake'],
      [/ziprecruiter\.com/, 'ziprecruiter'],
      [/builtin\.com/, 'builtin'],
      [/lever\.co/, 'lever'],
      [/greenhouse\.io/, 'greenhouse'],
      [/myworkdayjobs\.com/, 'workday'],
      [/ashbyhq\.com/, 'ashby'],
    ];
    const match = SOURCE_HOSTS.find(([pattern]) => pattern.test(host));
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

let panel = null;

function removePanel() {
  if (panel) {
    panel.remove();
    panel = null;
  }
}

window.addEventListener('message', (e) => {
  if (e.data === 'gtj-close') removePanel();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'gtj-toggle') return;

  if (panel) {
    removePanel();
    return;
  }

  let cleanUrl = location.href;
  let source = '';
  try {
    const u = new URL(location.href);
    source = detectSourceFromUrl(location.href);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'src') u.searchParams.delete(key);
    }
    cleanUrl = u.toString();
  } catch {}

  const params = new URLSearchParams({ url: cleanUrl, source });
  panel = document.createElement('iframe');
  panel.src = `${chrome.runtime.getURL('popup.html')}?${params}`;
  panel.setAttribute('allowtransparency', 'true');
  panel.style.cssText = [
    'position: fixed',
    'top: 16px',
    'right: 16px',
    'width: 340px',
    'height: 680px',
    'border: none',
    'border-radius: 12px',
    'box-shadow: 0 8px 32px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.10)',
    'z-index: 2147483647',
  ].join(';');

  document.documentElement.appendChild(panel);
});
