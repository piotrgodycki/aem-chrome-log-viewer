chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchLogsFromTab" && request.url) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) {
        sendResponse({ success: false, error: "No active tab found." });
        return;
      }

      const tab = tabs[0];
      if (
        !tab.url ||
        (!tab.url.startsWith("http://localhost:4502") &&
          !tab.url.startsWith("http://localhost:4503"))
      ) {
        sendResponse({
          success: false,
          error: "Please open an AEM Author or Publish tab first.",
        });
        return;
      }

      chrome.tabs.sendMessage(
        tab.id,
        { action: "getLogs", url: request.url },
        (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({
              success: false,
              error:
                "Could not connect to content script. Make sure you are on the correct AEM page.",
            });
          } else {
            sendResponse(response);
          }
        }
      );
    });

    return true;
  }
});
