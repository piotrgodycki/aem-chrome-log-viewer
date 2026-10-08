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
        .fab {
          position: fixed; right: 20px; bottom: 20px;
          width: 52px; height: 52px; border-radius: 50%;
          cursor: pointer; border: none; padding: 0; overflow: hidden; display: none;
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
      <div class="env-badge" id="envBadge"><span class="d"></span><span id="envText"></span></div>
      <div class="panel" id="panel"><iframe id="frame" title="AEM Log Viewer"></iframe></div>
      <button class="fab" id="fab" title="AEM Log Viewer" aria-label="Toggle AEM Log Viewer">
        <img src="${logoUrl}" alt="AEM Log Viewer">
      </button>
    `;

    const fab = root.getElementById("fab") as HTMLButtonElement;
    const panel = root.getElementById("panel") as HTMLDivElement;
    const frame = root.getElementById("frame") as HTMLIFrameElement;
    const envBadge = root.getElementById("envBadge") as HTMLDivElement;
    const envText = root.getElementById("envText") as HTMLSpanElement;

    fab.addEventListener("click", () => {
      const open = panel.classList.toggle("open");
      fab.classList.toggle("active", open);
      if (open && !frame.src) frame.src = panelUrl;
    });

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

      fab.style.display = features.widget ? "block" : "none";
      if (!features.widget) {
        panel.classList.remove("open");
        fab.classList.remove("active");
      }

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
