chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'gtj-toggle' });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_AUTH_TOKEN') {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ token });
      }
    });
    return true;
  }

  if (msg.type === 'GET_PROFILE_EMAIL') {
    chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
      sendResponse({ email: info && info.email ? info.email.toLowerCase() : '' });
    });
    return true;
  }
});
