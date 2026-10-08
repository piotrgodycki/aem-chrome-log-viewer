import { DEFAULT_FEATURES, type AemEnv, type Features } from "../lib/types";

const ENV_COLORS: Record<string, { bg: string; fg: string }> = {
  prod: { bg: "#e34850", fg: "#ffffff" },
  stage: { bg: "#d4a916", fg: "#221a00" },
  dev: { bg: "#1f7a4d", fg: "#eafff3" },
  local: { bg: "#1f7a4d", fg: "#eafff3" },
  other: { bg: "#1f4e86", fg: "#d6e7fb" },
};

// Heuristic: does this page look like Adobe Experience Manager?
function isAemPage(): boolean {
  const h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return true; // local dev instances
  if (/\.adobeaemcloud\.com$/i.test(h)) return true; // AEMaaCS author/publish
  if (/(^|\.)(author|publish)[.-]/i.test(h)) return true; // author-/publish- hosts
  if (document.querySelector('meta[name="generator"][content*="Adobe Experience Manager" i]')) return true;
  if (
    document.querySelector(
      'link[href*="/etc.clientlibs/"], script[src*="/etc.clientlibs/"], link[href*="/libs/granite/"], script[src*="/libs/granite/"]',
    )
  )
    return true;
  if (document.querySelector('coral-shell, .foundation-layout-panel, [class*="cq-Editable"]')) return true;
  return false;
}

// On AEM pages (any host): a floating logo button (toggles the viewer in an
// iframe) and a floating environment badge in the top-left corner next to
// "Adobe Experience Manager" — so you never confuse which instance you're on.
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_idle",
  main() {
    const w = window as unknown as { __aemLogViewerWidget?: boolean };
    if (w.__aemLogViewerWidget) return;
    if (!isAemPage()) return; // keep the widget off non-AEM sites
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
        .env-badge {
          position: fixed; top: 12px; left: 250px; z-index: 2147483647; display: none;
          align-items: center; gap: 7px; padding: 6px 12px; border-radius: 999px;
          font: 800 11px/1 "adobe-clean", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          letter-spacing: .5px; box-shadow: 0 2px 12px rgba(0,0,0,.35);
        }
        .env-badge .d { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .85; }
        .env-badge.prod { animation: dlpulse 1.6s infinite; }
        @keyframes dlpulse {
          0%, 100% { box-shadow: 0 2px 12px rgba(227,72,80,.4); }
          50% { box-shadow: 0 0 0 6px rgba(227,72,80,0), 0 2px 12px rgba(227,72,80,.4); }
        }
        .fab-wrap { position: fixed; right: 20px; bottom: 20px; z-index: 2147483647; display: none; }
        .fab-menu {
          position: absolute; right: 0; bottom: 62px; min-width: 200px;
          background: #252525; border: 1px solid #3f3f3f; border-radius: 10px;
          box-shadow: 0 16px 48px rgba(0,0,0,.55); padding: 6px; display: none; flex-direction: column; gap: 2px;
        }
        .fab-menu.open { display: flex; }
        .fab-menu button {
          display: flex; align-items: center; gap: 11px; width: 100%;
          background: transparent; border: none; cursor: pointer; text-align: left; color: #e8e8e8;
          font: 600 12.5px/1 "adobe-clean", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          padding: 9px 10px; border-radius: 6px;
        }
        .fab-menu button:hover { background: #161616; }
        .fab-menu button[disabled] { opacity: .4; cursor: default; }
        .fab-menu button[disabled]:hover { background: transparent; }
        .fab-menu .ico { display: flex; color: #adadad; flex-shrink: 0; }
        .fab-menu button:hover .ico { color: #fff; }
        .fab {
          width: 52px; height: 52px; border-radius: 50%;
          cursor: pointer; border: none; padding: 0; overflow: hidden; display: block;
          background: #1d1d1d; box-shadow: 0 4px 16px rgba(0,0,0,.45);
          transition: transform .12s ease, box-shadow .12s ease;
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
      <div class="env-badge" id="envBadge"><span class="d"></span><span id="envText"></span></div>
      <div class="panel" id="panel"><iframe id="frame" title="AEM Log Viewer"></iframe></div>
      <div class="fab-wrap" id="fabWrap">
        <div class="fab-menu" id="fabMenu">
          <button data-tool="viewer">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></span>
            Log Viewer
          </button>
          <button data-tool="datalayer">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg></span>
            Data Layer
          </button>
          <button data-tool="edit">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></span>
            Edit page
          </button>
          <button data-tool="crxde">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>
            CRXDE Lite
          </button>
          <button data-tool="dam">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></span>
            Assets (DAM)
          </button>
          <button data-tool="graphql">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="4" r="1.8"/><circle cx="12" cy="20" r="1.8"/><circle cx="5" cy="8" r="1.8"/><circle cx="19" cy="8" r="1.8"/><circle cx="5" cy="16" r="1.8"/><circle cx="19" cy="16" r="1.8"/><path d="M12 6v12M6.5 9l11 6M17.5 9l-11 6"/></svg></span>
            GraphQL
          </button>
          <button data-tool="bundles">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg></span>
            Bundles (OSGi)
          </button>
          <button data-tool="slinglog">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span>
            Sling Log
          </button>
          <button data-tool="querybuilder">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg></span>
            Query Builder
          </button>
          <button data-tool="templates">
            <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span>
            Templates
          </button>
        </div>
        <button class="fab" id="fab" title="AEM tools" aria-label="AEM tools">
          <img src="${logoUrl}" alt="AEM Log Viewer">
        </button>
      </div>
    `;

    const fab = root.getElementById("fab") as HTMLButtonElement;
    const panel = root.getElementById("panel") as HTMLDivElement;
    const frame = root.getElementById("frame") as HTMLIFrameElement;
    const envBadge = root.getElementById("envBadge") as HTMLDivElement;
    const envText = root.getElementById("envText") as HTMLSpanElement;
    const fabWrap = root.getElementById("fabWrap") as HTMLDivElement;
    const fabMenu = root.getElementById("fabMenu") as HTMLDivElement;

    function openViewer(tab?: "datalayer") {
      if (!frame.src) {
        frame.src = panelUrl + (tab ? "&open=" + tab : "");
      } else if (tab) {
        frame.contentWindow?.postMessage({ type: "aem-show", tab }, selfOrigin);
      }
      panel.classList.add("open");
    }

    // Author base for console tools (publish :4503 → author :4502).
    const authorBase = () => location.origin.replace(/:4503\b/, ":4502");

    // Editor URL for the current AEM content page.
    function editorUrl(): string | null {
      const path = location.pathname;
      if (path.startsWith("/editor.html")) return null; // already in the editor
      if (!path.startsWith("/content/") || !/\.html$/.test(path)) return null;
      return authorBase() + "/editor.html" + path + location.search;
    }
    function toolUrl(tool: string): string | null {
      const base = authorBase();
      switch (tool) {
        case "edit": return editorUrl();
        case "crxde": return base + "/crx/de/index.jsp";
        case "dam": return base + "/assets.html/content/dam";
        case "graphql": return base + "/aem/graphiql.html";
        case "bundles": return base + "/system/console/bundles";
        case "slinglog": return base + "/system/console/slinglog";
        case "querybuilder": return base + "/libs/cq/search/content/querydebug.html";
        case "templates": return base + "/libs/wcm/core/content/sites/templates.html/conf";
        default: return null;
      }
    }

    fab.addEventListener("click", (e) => {
      e.stopPropagation();
      const editBtn = fabMenu.querySelector('button[data-tool="edit"]') as HTMLButtonElement | null;
      if (editBtn) editBtn.disabled = editorUrl() === null;
      fabMenu.classList.toggle("open");
    });
    fabMenu.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.addEventListener("click", () => {
        const tool = b.dataset.tool ?? "";
        if (tool === "viewer") openViewer();
        else if (tool === "datalayer") openViewer("datalayer");
        else {
          const u = toolUrl(tool);
          if (u) window.open(u, "_blank", "noopener");
        }
        fabMenu.classList.remove("open");
      });
    });
    window.addEventListener("click", () => fabMenu.classList.remove("open"));

    const selfOrigin = new URL(browser.runtime.getURL("/")).origin;
    window.addEventListener("message", (e) => {
      if (e.origin !== selfOrigin || e.source !== frame.contentWindow) return;
      if ((e.data as { type?: string })?.type === "aem-widget-close") {
        panel.classList.remove("open");
        fab.classList.remove("active");
      }
    });

    // Reflect feature flags + active environment from storage, live.
    async function sync() {
      const cfg = (await browser.storage.local.get([
        "features",
        "environments",
        "activeEnv",
      ])) as Record<string, any>;
      const features: Features = {
        ...DEFAULT_FEATURES,
        ...(cfg.features ?? {}),
      };
      const envs: AemEnv[] = Array.isArray(cfg.environments)
        ? cfg.environments
        : [];
      const active: string = cfg.activeEnv ?? "";

      const anyFab = features.widget || features.tools;
      fabWrap.style.display = anyFab ? "block" : "none";
      if (!anyFab) fabMenu.classList.remove("open");
      const viewerBtn = fabMenu.querySelector('button[data-tool="viewer"]') as HTMLElement | null;
      if (viewerBtn) viewerBtn.style.display = features.widget ? "flex" : "none";
      const dlBtn = fabMenu.querySelector('button[data-tool="datalayer"]') as HTMLElement | null;
      if (dlBtn) dlBtn.style.display = features.widget && features.dataLayer ? "flex" : "none";
      fabMenu
        .querySelectorAll<HTMLElement>('button[data-tool]:not([data-tool="viewer"]):not([data-tool="datalayer"])')
        .forEach((b) => {
          b.style.display = features.tools ? "flex" : "none";
        });
      if (!features.widget) panel.classList.remove("open");

      const env = envs.find((e) => e.name === active);
      if (features.envBadge && env) {
        const col = ENV_COLORS[env.type] ?? ENV_COLORS.other!;
        envText.textContent = env.type.toUpperCase() + " · " + env.name;
        envBadge.style.background = col.bg;
        envBadge.style.color = col.fg;
        envBadge.classList.toggle("prod", env.type === "prod");
        envBadge.style.display = "inline-flex";
      } else {
        envBadge.style.display = "none";
      }
    }

    void sync();
    browser.storage.onChanged.addListener((changes, area) => {
      if (
        area === "local" &&
        (changes.features || changes.environments || changes.activeEnv)
      ) {
        void sync();
      }
    });
  },
});
