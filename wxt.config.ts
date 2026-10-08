import { defineConfig } from "wxt";

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-svelte"],
  manifest: {
    name: "AEM Error Log Viewer",
    description:
      "View and compare AEM Author and Publish error.logs, with local LLM analysis.",
    permissions: ["storage"],
    host_permissions: [
      "http://localhost/*",
      "http://127.0.0.1/*",
      "https://api.anthropic.com/*",
    ],
    icons: {
      16: "/logo.png",
      32: "/logo.png",
      48: "/logo.png",
      128: "/logo.png",
    },
    action: {
      default_title: "AEM Log Viewer",
    },
    // The floating widget loads the popup page inside an iframe on AEM pages.
    // Scope the exposed page to the AEM ports only (not every localhost origin).
    web_accessible_resources: [
      {
        resources: ["popup.html", "logo.png"],
        matches: [
          "http://localhost:4502/*",
          "http://localhost:4503/*",
          "http://127.0.0.1:4502/*",
          "http://127.0.0.1:4503/*",
        ],
      },
    ],
  },
});
