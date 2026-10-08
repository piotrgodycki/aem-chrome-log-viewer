// Floating AEM Log Viewer widget: a logo button in the bottom-right corner of
// AEM pages. Clicking it toggles a resizable panel that hosts the full viewer
// (popup.html) in an iframe — so fetches run in the extension context.
export default defineContentScript({
  matches: ["http://localhost:4502/*", "http://localhost:4503/*"],
  runAt: "document_idle",
  main() {
    const w = window as unknown as { __aemLogViewerWidget?: boolean };
    if (w.__aemLogViewerWidget) return;
    w.__aemLogViewerWidget = true;

    const host = document.createElement("div");
    host.id = "aem-logviewer-widget-host";
    host.style.cssText = "all: initial;";
    (document.documentElement || document.body).appendChild(host);
    const root = host.attachShadow({ mode: "open" });

    const logoUrl = browser.runtime.getURL("/logo.png");
    const panelUrl = browser.runtime.getURL("/popup.html") + "?view=widget";

    root.innerHTML = `
      <style>
        :host { all: initial; }
        .fab {
          position: fixed; right: 20px; bottom: 20px;
          width: 52px; height: 52px; border-radius: 50%;
          cursor: pointer; border: none; padding: 0; overflow: hidden;
          background: #1d1d1d; box-shadow: 0 4px 16px rgba(0,0,0,.45);
          z-index: 2147483647; transition: transform .12s ease, box-shadow .12s ease;
        }
        .fab:hover { transform: scale(1.07); box-shadow: 0 6px 22px rgba(0,0,0,.55); }
        .fab img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .fab.active { outline: 2px solid #e34850; outline-offset: 2px; }
        .panel {
          position: fixed; right: 20px; bottom: 84px;
          width: 880px; height: 640px;
          max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
          min-width: 440px; min-height: 340px;
          resize: both; overflow: hidden;
          border-radius: 12px; background: #1d1d1d;
          box-shadow: 0 16px 56px rgba(0,0,0,.55);
          z-index: 2147483646; display: none;
        }
        .panel.open { display: block; }
        .panel iframe { width: 100%; height: 100%; border: none; display: block; background: #1d1d1d; }
      </style>
      <div class="panel" id="panel"><iframe id="frame" title="AEM Log Viewer"></iframe></div>
      <button class="fab" id="fab" title="AEM Log Viewer" aria-label="Toggle AEM Log Viewer">
        <img src="${logoUrl}" alt="AEM Log Viewer">
      </button>
    `;

    const fab = root.getElementById("fab") as HTMLButtonElement;
    const panel = root.getElementById("panel") as HTMLDivElement;
    const frame = root.getElementById("frame") as HTMLIFrameElement;

    fab.addEventListener("click", () => {
      const open = panel.classList.toggle("open");
      fab.classList.toggle("active", open);
      if (open && !frame.src) frame.src = panelUrl; // lazy-load on first open
    });

    // The viewer's close button asks us to hide the panel. Trust only our iframe.
    const selfOrigin = new URL(browser.runtime.getURL("/")).origin;
    window.addEventListener("message", (e) => {
      if (e.origin !== selfOrigin || e.source !== frame.contentWindow) return;
      if ((e.data as { type?: string })?.type === "aem-widget-close") {
        panel.classList.remove("open");
        fab.classList.remove("active");
      }
    });
  },
});
