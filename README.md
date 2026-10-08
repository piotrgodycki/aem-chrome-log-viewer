# AEM Error Log Viewer 🔍

[![CI](https://github.com/piotrgodycki/aem-chrome-log-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/piotrgodycki/aem-chrome-log-viewer/actions/workflows/ci.yml)
![Manifest V3](https://img.shields.io/badge/Manifest%20V3-Compatible-blue?style=flat-square&logo=googlechrome&logoColor=white)
![Built with WXT](https://img.shields.io/badge/Built%20with-WXT-67d75e?style=flat-square)
![Svelte 5](https://img.shields.io/badge/Svelte-5-ff3e00?style=flat-square&logo=svelte&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![Security policy](https://img.shields.io/badge/security-policy-8a2be2?style=flat-square)](SECURITY.md)

> A Chrome/Firefox extension for viewing, comparing and **AI-analyzing** AEM Author & Publish `error.log` — right in the browser. All analysis can run **100% locally**.

---

## ✨ Features

- **Author / Publish tabs + Split view** — focus one instance or see both side by side.
- **Live tail** — auto-refresh every 5s, with pause/resume and a live indicator.
- **Search + highlight**, **level filters** (ERROR / WARN / INFO) and per-pane line counts.
- **Copy / Export / Clear** the visible logs.
- **LLM analysis** of the logs with a choice of engine:
  - **Ollama (local)** — fully on-device, configurable server URL & model.
  - **Gemini Nano (built-in)** — Chrome's on-device Prompt API.
  - **Claude (your account)** — Anthropic API with your own key (stored locally).
- **AEM-expert prompt** — triage tuned for OSGi, Sling, JCR/Oak, replication, dispatcher, queries, threads.
- **Data Layer tab** — live stream of **Adobe Client Data Layer** (`adobeDataLayer`) and **GTM** (`dataLayer`) events plus the current page meta / state, captured from the page (source filter, search, expandable payloads).
- **Floating widget** — a logo button in the bottom-right of AEM pages toggles a resizable viewer panel.
- **AEM tools launcher** — a one-click menu on AEM pages to open the current page in the **editor**, plus **CRXDE Lite**, **Assets (DAM)** and **GraphiQL** on the author instance (publish :4503 → author :4502).
- **On-page environment badge** — a color-coded badge injected top-left of AEM pages (next to "Adobe Experience Manager") so you never confuse instances.
- **Resizable pop-out window** — break out of the fixed popup into a window you can drag-resize.
- **Environment labels** — tag URLs as PROD / STAGE / DEV with a loud colored strip + badge (local-only safety net for tunnelled instances).
- **Feature toggles** — enable/disable the widget, on-page badge, Data Layer tab and LLM analysis from the settings (⚙) panel.

## 🔒 Security & privacy

- **Redaction** — paths (JCR/Windows/unix), URLs, e-mails, IPs and UUIDs are masked before logs are sent to any engine. On by default; **forced on for Gemini** (Google model).
- **External-send consent** — sending to Claude (cloud) requires an explicit one-time confirmation.
- **Prompt-injection hardening** — logs are treated as untrusted data: fenced with sanitized delimiters and the model is instructed to never obey instructions found inside log lines (and to flag suspected log-injection).
- **Local-only state** — engine, model, Anthropic key and environments live in `chrome.storage.local`; nothing is synced. The key can be cleared with one click.
- **No background routing** — logs are fetched directly from the extension via `host_permissions`; no AEM tab needs to be open.

## 🧰 Tech stack

[WXT](https://wxt.dev) (Vite) · [Svelte 5](https://svelte.dev) (runes) · TypeScript (strict). Builds for Chrome and Firefox from one codebase.

## 🚀 Getting started (development)

```bash
npm install          # installs deps + runs `wxt prepare`
npm run dev          # launch Chrome with HMR
npm run dev:firefox  # launch Firefox with HMR
```

`npm run dev` opens a browser with the extension loaded and hot-reloads on save.

### Build & load manually

```bash
npm run build            # -> .output/chrome-mv3
npm run build:firefox    # -> .output/firefox-mv2
npm run zip              # packaged zips in .output/
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `.output/chrome-mv3`.

### Quality checks

```bash
npm run check    # svelte-check (type-check .svelte + .ts)
```

CI (GitHub Actions) runs `check`, builds Chrome + Firefox and packages zips on every push/PR to `main`.

## 🧪 Usage

**Prerequisites:** AEM Author on `http://localhost:4502`, Publish on `http://localhost:4503`, and you must be logged in (cookies are sent with the request).

1. Click the toolbar icon, or use the floating logo on an AEM page.
2. Switch **Author / Publish**, or toggle **Split**.
3. Filter by level, search, and watch it live-tail.
4. For AI triage: pick an **Engine**, (optionally) a model / enter your key, then **Analyze with LLM**.

### LLM engine setup

| Engine | Setup | Data leaves machine? |
| --- | --- | --- |
| **Ollama** | `OLLAMA_ORIGINS=* ollama serve` + `ollama pull llama3.1` | No |
| **Gemini Nano** | Chrome 138+ with the Prompt API available | No (on-device) |
| **Claude** | Paste your `sk-ant-...` key (select "Claude" engine) | Yes → `api.anthropic.com` |

The Ollama server URL (default `http://localhost:11434`) is editable in the UI.

## ⚙️ Log endpoints

```
/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log
```
fetched from `:4502` (Author) and `:4503` (Publish).

## 📁 Project structure

```
.
├── wxt.config.ts            # WXT config → generates manifest.json
├── entrypoints/
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.ts          # mounts Svelte app
│   │   └── App.svelte       # whole UI + state
│   └── widget.content.ts    # floating widget content script
├── lib/
│   ├── aem.ts               # endpoints, fetch, level detection
│   ├── llm.ts               # engines + hardened prompt builder
│   ├── redact.ts            # sensitive-data masking
│   └── types.ts
├── public/logo.png          # icon (optimized)
└── .github/workflows/ci.yml
```

## 🔑 Permissions

- `storage` — save preferences (engine, model, key, environments, feature flags).
- `host_permissions` — `http://localhost/*`, `http://127.0.0.1/*` (fetch logs / Ollama), `https://api.anthropic.com/*` (Claude).
- Content scripts (all run read-only, data stays in local extension storage):
  - Widget + on-page env badge — injected on all `http(s)` pages but shown only when the page is detected as AEM (hostname, `generator` meta, clientlibs, Granite UI).
  - Data Layer capture — all `http(s)` pages (inspect ACDL/GTM anywhere).

  Note: log fetching still targets `localhost:4502/4503`, so on a remote AEM host the widget gives you the env badge + Data Layer, but the log panes won't load.

## 🐛 Known limitations

- Reads instances reachable from your machine only.
- Gemini Nano requires a recent Chrome with the Prompt API enabled.
- EDS / Edge Delivery has no `slinglog` endpoint — environments there are badge-only.

## 📄 License

MIT — see [LICENSE](LICENSE).
