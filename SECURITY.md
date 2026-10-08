# Security Policy & Audit

This document describes the threat model, data flows, controls and the self-audit
findings for the **AEM Error Log Viewer** extension.

_Last reviewed: 2026-10-08 · scope: commit at time of review._

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Email the maintainer
(see the `git` commit author) or open a private GitHub security advisory on
`piotrgodycki/aem-chrome-log-viewer`. Expect an initial response within a few days.

---

## Threat model

The extension reads AEM `error.log` from local instances and can send log excerpts
to an LLM for triage. It is primarily a **developer tool for localhost instances**.

### Assets

- AEM error logs (may contain paths, usernames, stack traces, business data).
- The user's Anthropic API key (when the Claude engine is used).
- The user's AEM session cookies (used implicitly by `credentials: "include"`).

### Trust boundaries & data flows

| Flow | Origin | Trust |
| --- | --- | --- |
| Popup → `localhost:4502/4503` log tailer | extension (host_permissions) | logs = **untrusted data** |
| Popup → `localhost:11434` (Ollama) | extension | local, trusted by user |
| Popup → `api.anthropic.com` | extension | external; gated by consent |
| Gemini Nano | on-device Chrome API | local |
| Content script → page | `localhost:4502/4503` | injects a Shadow-DOM widget |
| Widget iframe ↔ parent | `postMessage` | origin + source checked |

---

## Controls in place

1. **Logs treated as untrusted / prompt-injection hardening** — before reaching any
   LLM, logs are wrapped in sanitized fence markers (the markers are stripped from
   the payload so a crafted line can't close the fence) and the model is instructed
   to never obey instructions found inside, and to flag suspected injection.
   See `lib/llm.ts` (`buildAemPrompt`).
2. **Sensitive-data redaction** — paths (JCR/Windows/unix), URLs, e-mails, IPv4 and
   UUIDs are masked (`lib/redact.ts`). On by default; **forced on and locked for
   Gemini** (Google model). User-toggleable for Ollama/Claude.
3. **External-send consent** — the first send to Claude (cloud) requires explicit
   confirmation, persisted thereafter.
4. **No HTML injection / XSS** — log lines and LLM output are rendered as text via
   Svelte interpolation; highlighting uses real `<mark>` elements, never `innerHTML`
   of untrusted content. The widget's `innerHTML` uses only static, extension-owned
   strings (`runtime.getURL`).
5. **Widget message authentication** — the content script only accepts `postMessage`
   whose `origin` equals the extension origin **and** whose `source` is its own iframe.
6. **Least-exposed resources** — `web_accessible_resources` (`popup.html`, `logo.png`)
   are scoped to the AEM ports `:4502/:4503` only, not every localhost origin.
7. **No remote code** — everything is bundled at build time; no `eval`, no CDN/remote
   script loading. MV3 default CSP applies to extension pages.
8. **Local-only state** — preferences, environments and the API key live in
   `chrome.storage.local` (not `sync`); the key has a one-click **Clear** action.
9. **Supply chain** — pinned `package-lock.json`, `npm audit` clean at review time,
   CI builds from lockfile (`npm ci`).

---

## Findings

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | Medium | `web_accessible_resources` exposed `popup.html` to every `localhost` origin, allowing any local page to embed the viewer. | **Fixed** — scoped to `:4502/:4503`. |
| 2 | Low | Anthropic API key stored in plaintext in `chrome.storage.local`. | **Accepted / documented** — per-extension isolated storage; key is opt-in, clearable, never synced. |
| 3 | Low | `anthropic-dangerous-direct-browser-access` exposes the key to the browser runtime. | **Accepted** — inherent to client-side API use; only active for the Claude engine. |
| 4 | Low | Broad `host_permissions` for `http://localhost/*` / `127.0.0.1/*` (needed for arbitrary AEM/Ollama ports). | **Accepted** — localhost only; content-script injection is still limited to `:4502/:4503`. |
| 5 | Low | Redaction is regex-based best-effort; client identifiers not matching a path/URL/e-mail pattern may pass through. | **Residual** — documented; prefer Ollama (local) for confidential data; Gemini always redacts. |
| 6 | Info | LLM output is model-controlled; a jailbroken model could emit misleading triage. | **Residual** — output is analysis-only, rendered as inert text; no tool execution. |
| 7 | Low | The Data Layer capture content script runs on all `http(s)` pages (to read ACDL/GTM anywhere). | **Accepted** — read-only observation; captured data stays in local extension storage and is never transmitted; disable via the Data Layer feature toggle. |

---

## Recommendations for users

- For confidential client data, use **Ollama (local)** or **Gemini Nano** — nothing
  leaves the machine. Keep **Redact** enabled.
- Only paste an Anthropic key you are comfortable storing locally; **Clear key** when done.
- Treat a loud **PROD** environment badge as a stop sign before acting on logs.
