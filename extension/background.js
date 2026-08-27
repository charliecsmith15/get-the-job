const GOOGLE_CLIENT_ID = '948539209903-qku75f835du8coue8a6ld6g29aocif8k.apps.googleusercontent.com';
const TOKEN_CACHE_KEY = 'gtj_id_token_cache';

function parseJwtPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch { return null; }
}

async function getIdToken(interactive) {
  const { [TOKEN_CACHE_KEY]: cached } = await chrome.storage.local.get(TOKEN_CACHE_KEY);
  if (cached && Date.now() < cached.expiry) return cached.token;

  const redirectUrl = chrome.identity.getRedirectURL();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'id_token');
  authUrl.searchParams.set('redirect_uri', redirectUrl);
  authUrl.searchParams.set('scope', 'openid email');
  authUrl.searchParams.set('nonce', nonce);

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl.href, interactive }, (resultUrl) => {
      if (chrome.runtime.lastError || !resultUrl) {
        reject(new Error(chrome.runtime.lastError?.message || 'Auth cancelled'));
        return;
      }
      try {
        const hash = resultUrl.split('#')[1] || '';
        const params = new URLSearchParams(hash);
        const idToken = params.get('id_token');
        if (!idToken) throw new Error('No id_token in response');
        const payload = parseJwtPayload(idToken);
        const expiry = payload?.exp ? payload.exp * 1000 - 60_000 : Date.now() + 55 * 60 * 1000;
        chrome.storage.local.set({ [TOKEN_CACHE_KEY]: { token: idToken, expiry } });
        resolve(idToken);
      } catch (e) {
        reject(e);
      }
    });
  });
}

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'gtj-toggle' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_AUTH_TOKEN') {
    getIdToken(true)
      .then(token => sendResponse({ token }))
      .catch(e => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.type === 'GET_PROFILE_EMAIL') {
    // Try silently from cache; fall back to empty string (non-blocking)
    getIdToken(false)
      .then(token => {
        const payload = parseJwtPayload(token);
        sendResponse({ email: payload?.email?.toLowerCase() || '' });
      })
      .catch(() => sendResponse({ email: '' }));
    return true;
  }

  if (msg.type === 'GET_REDIRECT_URL') {
    sendResponse({ url: chrome.identity.getRedirectURL() });
    return false;
  }
});
