chrome.action.onClicked.addListener(async (tab) => {
  // Capture the active tab's URL and title now — the popup window won't be
  // able to query the browser's active tab once it opens in its own context.
  await chrome.storage.local.set({
    gtj_source_tab: { url: tab.url || '', title: tab.title || '' },
  });

  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 356,
    height: 650,
    focused: true,
  });
});
