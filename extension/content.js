function extractJobTitle() {
  // 1. JSON-LD JobPosting schema (LinkedIn, Indeed, Greenhouse, Lever, Ashby, Workday…)
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(script.textContent);
      const find = (d) => {
        if (!d) return null;
        if (Array.isArray(d)) return d.map(find).find(Boolean) || null;
        if (d['@type'] === 'JobPosting') return d;
        if (d['@graph']) return find(d['@graph']);
        return null;
      };
      const posting = find(json);
      const title = posting && (posting.title || posting.name);
      if (title) return title.trim();
    } catch {}
  }

  // 2. First <h1> on the page
  const h1 = document.querySelector('h1');
  if (h1) {
    const text = h1.textContent.replace(/\s+/g, ' ').trim();
    if (text) return text;
  }

  // 3. Page <title> with common suffixes stripped
  return document.title
    .replace(/\s*[|–—]\s*.+$/, '')   // " | Company" or " — Company"
    .replace(/\s+-\s+.+$/, '')        // " - Company"
    .replace(/\s+at\s+.+$/i, '')      // " at Company"
    .trim();
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

  const params = new URLSearchParams({ url: location.href, title: extractJobTitle() });
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
