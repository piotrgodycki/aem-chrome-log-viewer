chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getLogs" && message.url) {
    fetch(message.url, {
      credentials: "include",
    })
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.text();
      })
      .then((text) => sendResponse({ success: true, data: text }))
      .catch((err) => sendResponse({ success: false, error: err.message }));

    return true;
  }
});
