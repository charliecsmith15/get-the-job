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

  const params = new URLSearchParams({ url: location.href, title: document.title });
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
