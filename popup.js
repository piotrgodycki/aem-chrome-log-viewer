// ===== Elements =====
const searchInput = document.getElementById("search");
const refreshBtn = document.getElementById("refresh");
const pauseBtn = document.getElementById("pause");
const copyBtn = document.getElementById("copy");
const exportBtn = document.getElementById("export");
const clearBtn = document.getElementById("clear");

const authorTab = document.getElementById("author");
const publishTab = document.getElementById("publish");
const splitBtn = document.getElementById("split");

const authorLogEl = document.getElementById("author-log");
const publishLogEl = document.getElementById("publish-log");
const authorCountEl = document.getElementById("author-count");
const publishCountEl = document.getElementById("publish-count");
const authorSection = document.getElementById("author-section");
const publishSection = document.getElementById("publish-section");

const filterError = document.getElementById("filter-error");
const filterWarn = document.getElementById("filter-warn");
const filterInfo = document.getElementById("filter-info");

const liveIndicator = document.getElementById("live-indicator");
const liveText = document.getElementById("live-text");

// ===== State =====
let currentTab = "author"; // 'author' | 'publish'
let splitView = false;
let authorRawLogText = "";
let publishRawLogText = "";
let currentSearch = "";
let isPaused = false;
let filters = { error: true, warn: true, info: true };

let autoRefreshInterval = null;
const REFRESH_INTERVAL_MS = 5000;

const ENDPOINTS = {
  author:
    "http://localhost:4502/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log",
  publish:
    "http://localhost:4503/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log",
};

// How are we shown? small toolbar popup (null) | resizable window ('tab') | floating widget iframe ('widget')
const view = new URLSearchParams(location.search).get("view");
const isFluid = view === "tab" || view === "widget";
if (isFluid) document.body.classList.add("tab-mode");

document.getElementById("close-btn").addEventListener("click", () => {
  if (view === "widget") parent.postMessage({ type: "aem-widget-close" }, "*");
  else window.close();
});

const popoutBtn = document.getElementById("popout-btn");
if (isFluid) {
  popoutBtn.classList.add("hidden"); // already in a window/widget
} else {
  popoutBtn.addEventListener("click", () => {
    const url = chrome.runtime.getURL("popup.html?view=tab");
    if (chrome.windows) {
      chrome.windows.create({ url, type: "popup", width: 1100, height: 800 });
    } else {
      window.open(url, "_blank");
    }
    window.close();
  });
}

// ===== Utils =====
function debounce(func, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levelOf(line) {
  if (/\*ERROR\*|\bERROR\b/.test(line)) return "error";
  if (/\*WARN\*|\bWARN\b/.test(line)) return "warn";
  if (/\*INFO\*|\bINFO\b/.test(line)) return "info";
  return null;
}

// Which panes are currently visible.
function activeEnvs() {
  return splitView ? ["author", "publish"] : [currentTab];
}

// ===== Auto-refresh =====
function startAutoRefresh() {
  stopAutoRefresh();
  if (isPaused) return;
  autoRefreshInterval = setInterval(refreshNow, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

function setPaused(paused) {
  isPaused = paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  pauseBtn.classList.toggle("paused", paused);
  liveIndicator.classList.toggle("paused", paused);
  liveText.textContent = paused ? "Paused" : "Live";
  if (paused) stopAutoRefresh();
  else startAutoRefresh();
}

// ===== View layout =====
function updateLayout() {
  authorTab.classList.toggle("active", !splitView && currentTab === "author");
  publishTab.classList.toggle("active", !splitView && currentTab === "publish");
  splitBtn.classList.toggle("paused", splitView); // reuse highlight style

  const envs = activeEnvs();
  authorSection.classList.toggle("hidden", !envs.includes("author"));
  publishSection.classList.toggle("hidden", !envs.includes("publish"));
}

// ===== Rendering =====
function renderLogs() {
  const envs = activeEnvs();
  if (envs.includes("author")) renderLogSection(authorLogEl, authorRawLogText, authorCountEl);
  if (envs.includes("publish")) renderLogSection(publishLogEl, publishRawLogText, publishCountEl);
}

function renderLogSection(container, logText, countEl) {
  const lines = logText.split("\n");
  const search = currentSearch.toLowerCase();
  const re = currentSearch ? new RegExp(escapeRegExp(currentSearch), "gi") : null;
  const frag = document.createDocumentFragment();
  let visible = 0;

  lines.forEach((line) => {
    if (search && !line.toLowerCase().includes(search)) return;
    const level = levelOf(line);
    if (level && !filters[level]) return;

    visible++;
    const span = document.createElement("span");
    span.className = "log-line" + (level ? " " + level : "");
    if (re) {
      span.innerHTML = escapeHtml(line).replace(re, (m) => `<mark>${escapeHtml(m)}</mark>`);
    } else {
      span.textContent = line;
    }
    frag.appendChild(span);
  });

  container.innerHTML = "";
  if (visible === 0) {
    const e = document.createElement("span");
    e.className = "empty";
    e.textContent = logText ? "No matching log lines." : "No logs loaded.";
    container.appendChild(e);
  } else {
    container.appendChild(frag);
  }

  if (countEl) countEl.textContent = `${visible} line${visible === 1 ? "" : "s"}`;
  container.scrollTop = container.scrollHeight;
}

// ===== Direct fetch (from popup, via host_permissions) =====
async function fetchLog(env) {
  try {
    const resp = await fetch(ENDPOINTS[env], { credentials: "include" });
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
    return { success: true, data: await resp.text() };
  } catch (e) {
    return { success: false, error: `${e.message} — is AEM ${env} running & are you logged in?` };
  }
}

async function loadEnv(env) {
  const result = await fetchLog(env);
  if (result.success) {
    if (env === "author") authorRawLogText = result.data;
    else publishRawLogText = result.data;
  } else {
    showError(env, result.error);
    if (env === "author") authorRawLogText = "";
    else publishRawLogText = "";
  }
}

// Load all currently visible panes in parallel, then render.
async function refreshNow() {
  await Promise.all(activeEnvs().map(loadEnv));
  renderLogs();
}

function showError(env, message) {
  const el = env === "publish" ? publishLogEl : authorLogEl;
  el.innerHTML = "";
  const e = document.createElement("span");
  e.className = "empty";
  e.textContent = `Error: ${message}`;
  el.appendChild(e);
}

// ===== Copy / export text =====
function visibleText() {
  const parts = [];
  const envs = activeEnvs();
  if (envs.includes("author")) parts.push("=== AUTHOR ===\n" + authorLogEl.innerText);
  if (envs.includes("publish")) parts.push("=== PUBLISH ===\n" + publishLogEl.innerText);
  return parts.join("\n\n");
}

// ===== Events: toolbar =====
refreshBtn.addEventListener("click", () => {
  refreshBtn.disabled = true;
  const prev = refreshBtn.textContent;
  refreshBtn.textContent = "...";
  refreshNow().then(() => { refreshBtn.disabled = false; refreshBtn.textContent = prev; });
});

pauseBtn.addEventListener("click", () => setPaused(!isPaused));

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(visibleText()).then(() => {
    const prev = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = prev), 1200);
  });
});

exportBtn.addEventListener("click", () => {
  const name = splitView ? "compare" : currentTab;
  const blob = new Blob([visibleText()], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `aem-${name}-logs.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

clearBtn.addEventListener("click", () => {
  authorRawLogText = "";
  publishRawLogText = "";
  renderLogs();
});

const debouncedSearch = debounce(() => { currentSearch = searchInput.value.trim(); renderLogs(); }, 300);
searchInput.addEventListener("input", debouncedSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { currentSearch = searchInput.value.trim(); renderLogs(); }
});

filterError.addEventListener("change", () => { filters.error = filterError.checked; renderLogs(); });
filterWarn.addEventListener("change", () => { filters.warn = filterWarn.checked; renderLogs(); });
filterInfo.addEventListener("change", () => { filters.info = filterInfo.checked; renderLogs(); });

// ===== Events: tabs & split =====
function selectTab(env) {
  currentTab = env;
  splitView = false;
  updateLayout();
  refreshNow();
  startAutoRefresh();
}
authorTab.addEventListener("click", () => selectTab("author"));
publishTab.addEventListener("click", () => selectTab("publish"));
splitBtn.addEventListener("click", () => {
  splitView = !splitView;
  updateLayout();
  refreshNow();
  startAutoRefresh();
});

// ===== Environments (local-only safety labels) =====
const envBadge = document.getElementById("env-badge");
const envSelect = document.getElementById("env-select");
const envManageBtn = document.getElementById("env-manage");
const envManager = document.getElementById("env-manager");
const envList = document.getElementById("env-list");
const envName = document.getElementById("env-name");
const envType = document.getElementById("env-type");
const envUrl = document.getElementById("env-url");
const envAddBtn = document.getElementById("env-add-btn");

let environments = []; // [{ name, type, url }]
let activeEnv = "";

function persistEnvs() {
  chrome.storage?.local.set({ environments, activeEnv });
}

function renderEnvSelect() {
  envSelect.innerHTML = '<option value="">Local (unlabeled)</option>';
  environments.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.name;
    opt.textContent = e.name;
    envSelect.appendChild(opt);
  });
  envSelect.value = environments.some((e) => e.name === activeEnv) ? activeEnv : "";
}

function renderBadge() {
  const env = environments.find((e) => e.name === activeEnv);
  if (!env) { envBadge.classList.add("hidden"); return; }
  envBadge.className = "env-badge-" + env.type;
  envBadge.textContent = env.type.toUpperCase() + " · " + env.name;
  envBadge.title = env.url || "";
  envBadge.classList.remove("hidden");
}

function renderEnvList() {
  envList.innerHTML = "";
  if (!environments.length) {
    const e = document.createElement("div");
    e.className = "env-empty";
    e.textContent = "No environments yet.";
    envList.appendChild(e);
    return;
  }
  environments.forEach((env, i) => {
    const row = document.createElement("div");
    row.className = "env-item";
    const tag = document.createElement("span");
    tag.className = "env-badge-" + env.type;
    tag.textContent = env.type.toUpperCase();
    const label = document.createElement("span");
    label.className = "env-item-name";
    label.textContent = env.name;
    const url = document.createElement("span");
    url.className = "env-item-url";
    url.textContent = env.url || "";
    const del = document.createElement("button");
    del.className = "env-del";
    del.textContent = "✕";
    del.title = "Delete";
    del.addEventListener("click", () => {
      const removed = environments.splice(i, 1)[0];
      if (removed.name === activeEnv) activeEnv = "";
      persistEnvs();
      renderEnvSelect(); renderEnvList(); renderBadge();
    });
    row.append(tag, label, url, del);
    envList.appendChild(row);
  });
}

envManageBtn.addEventListener("click", () => {
  envManager.classList.toggle("hidden");
  if (!envManager.classList.contains("hidden")) renderEnvList();
});

envAddBtn.addEventListener("click", () => {
  const name = envName.value.trim();
  if (!name) { envName.focus(); return; }
  if (environments.some((e) => e.name === name)) { envName.focus(); return; }
  environments.push({ name, type: envType.value, url: envUrl.value.trim() });
  envName.value = ""; envUrl.value = "";
  persistEnvs();
  renderEnvSelect(); renderEnvList();
});

envSelect.addEventListener("change", () => {
  activeEnv = envSelect.value;
  persistEnvs();
  renderBadge();
});

chrome.storage?.local.get(["environments", "activeEnv"], (cfg) => {
  if (Array.isArray(cfg.environments)) environments = cfg.environments;
  if (cfg.activeEnv) activeEnv = cfg.activeEnv;
  renderEnvSelect(); renderBadge();
});

// ===== LLM analysis =====
const analyzeBtn = document.getElementById("analyze");
const aiProvider = document.getElementById("ai-provider");
const ollamaUrlInput = document.getElementById("ollama-url");
const modelInput = document.getElementById("model-input");
const claudeKey = document.getElementById("claude-key");
const clearKeyBtn = document.getElementById("clear-key");
const redactChk = document.getElementById("redact");
const aiStatus = document.getElementById("ai-status");
const analysisPanel = document.getElementById("analysis");
const analysisBody = document.getElementById("analysis-body");
const geminiWarning = document.getElementById("gemini-warning");
const claudeNote = document.getElementById("claude-note");
document.getElementById("analysis-close").addEventListener("click", () => analysisPanel.classList.add("hidden"));

const MODEL_DEFAULTS = { ollama: "llama3.1", claude: "claude-sonnet-4-6" };

const AI_PROMPT =
  "You are a principal Adobe Experience Manager (AEM as a Cloud Service & 6.5) engineer doing log triage.\n" +
  "Apply AEM-specific debugging expertise. Watch for and name these common patterns when present:\n" +
  "- OSGi: bundle not Active / unresolved imports, unsatisfied references, DS component not satisfied, 'Unable to resolve'.\n" +
  "- Sling: Model injection failures (@ValidationStrategy, missing @Inject source), script resolution 'No renderer', 404 resource not found, servlet registration clashes.\n" +
  "- JCR/Oak: AccessDeniedException / permission issues, 'OakState' commit conflicts, session leaks ('Session created without closing'), large node warnings, versionstore growth.\n" +
  "- Replication / publish: agent queue blocked, 'Replication (TEST) returned', Sling distribution errors, 403/503 to publisher, author↔publish mismatch (use the Author vs Publish sections to correlate).\n" +
  "- Dispatcher/CDN: cache-miss storms, 404/500 pass-through, auth-check loops.\n" +
  "- Queries: slow query / 'traversed X nodes' / missing Oak index, QueryEngine warnings.\n" +
  "- Threads: deadlocks, thread pool exhaustion, long-running requests.\n\n" +
  "Respond concisely in plain text:\n" +
  "1) Key issues (grouped, deduplicated, with log level)\n" +
  "2) Most likely root cause (name the failing bundle/class/service; if Author vs Publish differ, say so)\n" +
  "3) Concrete fixes / next steps (config, code, index, or OSGi action)\n" +
  "4) Severity: Critical / Warning / Noise.\n" +
  "Ignore routine INFO noise unless it explains an error.\n\nLOGS:\n";

function logsForAI() {
  const envs = activeEnvs();
  const chunks = [];
  if (envs.includes("author")) chunks.push("=== AUTHOR ===\n" + authorRawLogText);
  if (envs.includes("publish")) chunks.push("=== PUBLISH ===\n" + publishRawLogText);
  const raw = chunks.join("\n\n");
  const lines = raw.split("\n");
  const important = lines.filter((l) => /ERROR|WARN|Exception|Caused by|\tat /.test(l));
  const picked = (important.length ? important : lines).slice(-200);
  return picked.join("\n").slice(-12000);
}

function setAiStatus(msg, isErr) {
  aiStatus.textContent = msg;
  aiStatus.classList.toggle("err", !!isErr);
}

// Mask anything that could leak a client identity or environment before the
// logs leave the viewer. Always on for Gemini; opt-in (default on) for the rest.
function redactSensitive(text) {
  return text
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[PATH]")
    .replace(/(?:\/[\w.\-@%]+){2,}\/?/g, "[PATH]")
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, "[URL]")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g, "[EMAIL]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[IP]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[UUID]");
}

async function analyzeWithGemini(text, onToken) {
  if (!("LanguageModel" in self)) {
    throw new Error("Gemini Nano unavailable — needs Chrome 138+ (enable Prompt API).");
  }
  const avail = await LanguageModel.availability();
  if (avail === "unavailable") throw new Error("Gemini Nano model unavailable on this device.");
  if (avail !== "available") setAiStatus("Downloading model…");
  const session = await LanguageModel.create();
  try {
    const stream = session.promptStreaming(AI_PROMPT + text);
    let full = "";
    for await (const chunk of stream) { full += chunk; onToken(full); }
    return full;
  } finally {
    session.destroy();
  }
}

async function analyzeWithOllama(text, model, onToken) {
  const base = (ollamaUrlInput.value.trim() || "http://localhost:11434").replace(/\/+$/, "");
  let resp;
  try {
    resp = await fetch(base + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: AI_PROMPT + text, stream: true }),
    });
  } catch (e) {
    throw new Error("Can't reach Ollama. Run `OLLAMA_ORIGINS=* ollama serve`.");
  }
  if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status} — is the model pulled?`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop();
    for (const p of parts) {
      if (!p.trim()) continue;
      try { const j = JSON.parse(p); if (j.response) { full += j.response; onToken(full); } } catch {}
    }
  }
  return full;
}

async function analyzeWithClaude(text, model, key, onToken) {
  if (!key) throw new Error("Enter your Anthropic API key first.");
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      stream: true,
      messages: [{ role: "user", content: AI_PROMPT + text }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Claude HTTP ${resp.status} ${body.slice(0, 140)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const data = s.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        if (j.type === "content_block_delta" && j.delta && j.delta.text) {
          full += j.delta.text;
          onToken(full);
        }
      } catch {}
    }
  }
  return full;
}

// Remember one-time consent to send logs to an external provider (Claude).
let externalConsent = false;
chrome.storage?.local.get(["externalConsent"], (c) => { externalConsent = !!c.externalConsent; });

function ensureExternalConsent() {
  if (externalConsent) return true;
  const ok = confirm(
    "Claude runs in Anthropic's cloud. The selected logs will be sent to api.anthropic.com " +
    "and processed under your account.\n\nContinue? (Tip: keep 'Redact sensitive data' on.)"
  );
  if (ok) { externalConsent = true; chrome.storage?.local.set({ externalConsent: true }); }
  return ok;
}

analyzeBtn.addEventListener("click", async () => {
  const provider = aiProvider.value;
  const raw = logsForAI();
  if (!raw.trim()) { setAiStatus("No logs to analyze.", true); return; }

  // Gemini (Google) is always redacted; others follow the checkbox.
  const text = (provider === "gemini" || redactChk.checked) ? redactSensitive(raw) : raw;

  // External provider → explicit consent.
  if (provider === "claude" && !ensureExternalConsent()) { setAiStatus("Cancelled.", false); return; }

  analyzeBtn.disabled = true;
  analysisPanel.classList.remove("hidden");
  analysisBody.innerHTML = '<span class="thinking">Analyzing…</span>';
  setAiStatus("Running " + provider + "…");

  const onToken = (t) => { analysisBody.textContent = t; };
  const model = modelInput.value.trim();
  try {
    if (provider === "gemini") {
      await analyzeWithGemini(text, onToken);
    } else if (provider === "claude") {
      await analyzeWithClaude(text, model || MODEL_DEFAULTS.claude, claudeKey.value.trim(), onToken);
    } else {
      await analyzeWithOllama(text, model || MODEL_DEFAULTS.ollama, onToken);
    }
    setAiStatus("Done.");
  } catch (e) {
    analysisBody.innerHTML = '<span class="thinking">Analysis failed.</span>';
    setAiStatus(e.message, true);
  } finally {
    analyzeBtn.disabled = false;
  }
});

// Provider UI + persistence
function syncProviderUI() {
  const p = aiProvider.value;
  ollamaUrlInput.classList.toggle("hidden", p !== "ollama");
  modelInput.classList.toggle("hidden", p === "gemini");
  claudeKey.classList.toggle("hidden", p !== "claude");
  clearKeyBtn.classList.toggle("hidden", p !== "claude");
  geminiWarning.classList.toggle("hidden", p !== "gemini");
  claudeNote.classList.toggle("hidden", p !== "claude");
  // Gemini (Google) must redact — force it on and lock the checkbox.
  if (p === "gemini") { redactChk.checked = true; redactChk.disabled = true; }
  else { redactChk.disabled = false; }
  if (p !== "gemini" && !modelInput.value.trim()) modelInput.value = MODEL_DEFAULTS[p] || "";
}

clearKeyBtn.addEventListener("click", () => {
  claudeKey.value = "";
  chrome.storage?.local.remove("claudeKey");
  setAiStatus("Key cleared.");
});
redactChk.addEventListener("change", () => chrome.storage?.local.set({ redact: redactChk.checked }));

aiProvider.addEventListener("change", () => {
  const p = aiProvider.value;
  if (p !== "gemini") modelInput.value = MODEL_DEFAULTS[p] || modelInput.value;
  syncProviderUI();
  chrome.storage?.local.set({ aiProvider: p, aiModel: modelInput.value });
});
modelInput.addEventListener("change", () => chrome.storage?.local.set({ aiModel: modelInput.value }));
ollamaUrlInput.addEventListener("change", () => chrome.storage?.local.set({ ollamaUrl: ollamaUrlInput.value }));
claudeKey.addEventListener("change", () => chrome.storage?.local.set({ claudeKey: claudeKey.value }));

chrome.storage?.local.get(["aiProvider", "aiModel", "claudeKey", "ollamaUrl", "redact"], (cfg) => {
  if (cfg.aiProvider) aiProvider.value = cfg.aiProvider;
  if (cfg.aiModel) modelInput.value = cfg.aiModel;
  if (cfg.claudeKey) claudeKey.value = cfg.claudeKey;
  if (cfg.ollamaUrl) ollamaUrlInput.value = cfg.ollamaUrl;
  if (cfg.redact === false) redactChk.checked = false;
  syncProviderUI();
});
syncProviderUI();

// ===== Init =====
updateLayout();
refreshNow().then(startAutoRefresh);
