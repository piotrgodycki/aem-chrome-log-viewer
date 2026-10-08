<script lang="ts">
  import { onMount } from "svelte";
  import { fetchLog, levelOf, type AemEnvKey } from "../../lib/aem";
  import { redactSensitive } from "../../lib/redact";
  import {
    MODEL_DEFAULTS,
    analyzeWithClaude,
    analyzeWithGemini,
    analyzeWithOllama,
  } from "../../lib/llm";
  import { DEFAULT_FEATURES } from "../../lib/types";
  import type { AemEnv, EnvType, Features, LogLevel, Provider, View } from "../../lib/types";

  const view = new URLSearchParams(location.search).get("view") as View;
  const isFluid = view === "tab" || view === "widget";

  // ----- View state -----
  let currentTab = $state<AemEnvKey>("author");
  let splitView = $state(false);
  let authorRaw = $state("");
  let publishRaw = $state("");
  let authorError = $state("");
  let publishError = $state("");
  let searchValue = $state("");
  let query = $state("");
  let filters = $state({ error: true, warn: true, info: true });
  let paused = $state(false);
  let loaded = $state(false);

  let authorLogEl: HTMLDivElement | undefined = $state();
  let publishLogEl: HTMLDivElement | undefined = $state();

  // ----- Environments -----
  let environments = $state<AemEnv[]>([]);
  let activeEnv = $state("");
  let settingsOpen = $state(false);
  let features = $state<Features>({ ...DEFAULT_FEATURES });
  let newEnvName = $state("");
  let newEnvType = $state<EnvType>("local");
  let newEnvUrl = $state("");

  // ----- LLM -----
  let provider = $state<Provider>("ollama");
  let model = $state("llama3.1");
  let ollamaUrl = $state("http://localhost:11434");
  let claudeKey = $state("");
  let redact = $state(true);
  let analysisOpen = $state(false);
  let analysisText = $state("");
  let aiStatus = $state("");
  let aiErr = $state(false);
  let analyzing = $state(false);
  let externalConsent = false;

  const activeEnvs = $derived<AemEnvKey[]>(splitView ? ["author", "publish"] : [currentTab]);
  const activeEnvObj = $derived(environments.find((e) => e.name === activeEnv) ?? null);

  interface Seg { text: string; mark: boolean; }
  interface Row { level: LogLevel; segs: Seg[]; }

  function segsFor(line: string, q: string): Seg[] {
    if (!q) return [{ text: line, mark: false }];
    const segs: Seg[] = [];
    const lower = line.toLowerCase();
    const ql = q.toLowerCase();
    let i = 0;
    while (i < line.length) {
      const idx = lower.indexOf(ql, i);
      if (idx === -1) {
        segs.push({ text: line.slice(i), mark: false });
        break;
      }
      if (idx > i) segs.push({ text: line.slice(i, idx), mark: false });
      segs.push({ text: line.slice(idx, idx + q.length), mark: true });
      i = idx + q.length;
    }
    return segs;
  }

  function processLines(raw: string): { rows: Row[]; count: number } {
    const q = query.toLowerCase();
    const rows: Row[] = [];
    for (const line of raw.split("\n")) {
      if (q && !line.toLowerCase().includes(q)) continue;
      const level = levelOf(line);
      if (level && !filters[level]) continue;
      rows.push({ level, segs: segsFor(line, query) });
    }
    return { rows, count: rows.length };
  }

  const authorView = $derived(processLines(authorRaw));
  const publishView = $derived(processLines(publishRaw));

  // Auto-scroll panes to the bottom as content changes.
  $effect(() => {
    authorView.count;
    if (authorLogEl) authorLogEl.scrollTop = authorLogEl.scrollHeight;
  });
  $effect(() => {
    publishView.count;
    if (publishLogEl) publishLogEl.scrollTop = publishLogEl.scrollHeight;
  });

  // ----- Fetching -----
  async function loadEnv(env: AemEnvKey) {
    const r = await fetchLog(env);
    if (env === "author") {
      authorError = r.success ? "" : r.error;
      authorRaw = r.success ? r.data : "";
    } else {
      publishError = r.success ? "" : r.error;
      publishRaw = r.success ? r.data : "";
    }
  }

  async function refreshNow() {
    await Promise.all(activeEnvs.map(loadEnv));
  }

  // Auto-refresh loop (restarts when the visible panes or pause state change).
  $effect(() => {
    const envs = activeEnvs;
    if (paused) return;
    const id = setInterval(() => void refreshNow(), 5000);
    return () => clearInterval(id);
  });

  // ----- Search debounce -----
  let searchTimer: ReturnType<typeof setTimeout>;
  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => (query = searchValue.trim()), 300);
  }
  function onSearchKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      clearTimeout(searchTimer);
      query = searchValue.trim();
    }
  }

  // ----- Tabs / split -----
  function selectTab(env: AemEnvKey) {
    currentTab = env;
    splitView = false;
    void refreshNow();
  }
  function toggleSplit() {
    splitView = !splitView;
    void refreshNow();
  }

  // ----- Copy / export / clear -----
  function plain(rows: Row[]): string {
    return rows.map((r) => r.segs.map((s) => s.text).join("")).join("\n");
  }
  function visibleText(): string {
    const parts: string[] = [];
    if (activeEnvs.includes("author")) parts.push("=== AUTHOR ===\n" + plain(authorView.rows));
    if (activeEnvs.includes("publish")) parts.push("=== PUBLISH ===\n" + plain(publishView.rows));
    return parts.join("\n\n");
  }
  let copied = $state(false);
  async function copyLogs() {
    await navigator.clipboard.writeText(visibleText());
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
  function exportLogs() {
    const name = splitView ? "compare" : currentTab;
    const blob = new Blob([visibleText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aem-${name}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function clearLogs() {
    authorRaw = "";
    publishRaw = "";
  }

  // ----- Window controls -----
  function closeViewer() {
    if (view === "widget") parent.postMessage({ type: "aem-widget-close" }, "*");
    else window.close();
  }
  function popout() {
    const url = browser.runtime.getURL("/popup.html") + "?view=tab";
    if (browser.windows) browser.windows.create({ url, type: "popup", width: 1100, height: 800 });
    else window.open(url, "_blank");
    window.close();
  }

  // ----- Environments -----
  function addEnv() {
    const name = newEnvName.trim();
    if (!name || environments.some((e) => e.name === name)) return;
    environments = [...environments, { name, type: newEnvType, url: newEnvUrl.trim() }];
    newEnvName = "";
    newEnvUrl = "";
  }
  function delEnv(i: number) {
    const removed = environments[i];
    environments = environments.filter((_, idx) => idx !== i);
    if (removed && removed.name === activeEnv) activeEnv = "";
  }
  function selectEnv(name: string) {
    activeEnv = name;
  }
  function onEnvKey(e: KeyboardEvent, name: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectEnv(name);
    }
  }
  function onAddKey(e: KeyboardEvent) {
    if (e.key === "Enter") addEnv();
  }

  // ----- LLM -----
  function onProviderChange() {
    if (provider !== "gemini") {
      model = MODEL_DEFAULTS[provider];
    }
  }
  function logsForAI(): string {
    const chunks: string[] = [];
    if (activeEnvs.includes("author")) chunks.push("=== AUTHOR ===\n" + authorRaw);
    if (activeEnvs.includes("publish")) chunks.push("=== PUBLISH ===\n" + publishRaw);
    const lines = chunks.join("\n\n").split("\n");
    const important = lines.filter((l) => /ERROR|WARN|Exception|Caused by|\tat /.test(l));
    const picked = (important.length ? important : lines).slice(-200);
    return picked.join("\n").slice(-12000);
  }
  function ensureExternalConsent(): boolean {
    if (externalConsent) return true;
    const ok = confirm(
      "Claude runs in Anthropic's cloud. The selected logs will be sent to api.anthropic.com " +
        "and processed under your account.\n\nContinue? (Tip: keep 'Redact sensitive data' on.)",
    );
    if (ok) {
      externalConsent = true;
      browser.storage.local.set({ externalConsent: true });
    }
    return ok;
  }
  async function runAnalyze() {
    const rawLogs = logsForAI();
    if (!rawLogs.trim()) {
      aiStatus = "No logs to analyze.";
      aiErr = true;
      return;
    }
    const text = provider === "gemini" || redact ? redactSensitive(rawLogs) : rawLogs;
    if (provider === "claude" && !ensureExternalConsent()) {
      aiStatus = "Cancelled.";
      aiErr = false;
      return;
    }
    analyzing = true;
    analysisOpen = true;
    analysisText = "";
    aiErr = false;
    aiStatus = "Running " + provider + "…";
    const onToken = (t: string) => (analysisText = t);
    try {
      if (provider === "gemini") {
        await analyzeWithGemini(text, onToken, (s) => (aiStatus = s));
      } else if (provider === "claude") {
        await analyzeWithClaude(text, model || MODEL_DEFAULTS.claude, claudeKey.trim(), onToken);
      } else {
        await analyzeWithOllama(text, model || MODEL_DEFAULTS.ollama, ollamaUrl, onToken);
      }
      aiStatus = "Done.";
    } catch (e) {
      analysisText = "";
      aiStatus = e instanceof Error ? e.message : String(e);
      aiErr = true;
    } finally {
      analyzing = false;
    }
  }
  function clearKey() {
    claudeKey = "";
    browser.storage.local.remove("claudeKey");
    aiStatus = "Key cleared.";
  }

  // ----- Persistence -----
  $effect(() => {
    if (!loaded) return;
    browser.storage.local.set({
      aiProvider: provider,
      aiModel: model,
      ollamaUrl,
      claudeKey,
      redact,
      environments: $state.snapshot(environments),
      activeEnv,
      features: $state.snapshot(features),
    });
  });

  onMount(async () => {
    const cfg = (await browser.storage.local.get([
      "aiProvider",
      "aiModel",
      "claudeKey",
      "ollamaUrl",
      "redact",
      "environments",
      "activeEnv",
      "externalConsent",
      "features",
    ])) as Record<string, any>;
    if (cfg.aiProvider) provider = cfg.aiProvider;
    if (cfg.aiModel) model = cfg.aiModel;
    if (cfg.claudeKey) claudeKey = cfg.claudeKey;
    if (cfg.ollamaUrl) ollamaUrl = cfg.ollamaUrl;
    if (cfg.redact === false) redact = false;
    if (Array.isArray(cfg.environments)) environments = cfg.environments;
    if (cfg.activeEnv) activeEnv = cfg.activeEnv;
    if (cfg.features) features = { ...DEFAULT_FEATURES, ...cfg.features };
    externalConsent = !!cfg.externalConsent;
    loaded = true;
    void refreshNow();
  });
</script>

<main class="app" class:fluid={isFluid}>
  {#if activeEnvObj}
    <div class="env-strip {activeEnvObj.type}" title={activeEnvObj.url}>
      <span class="strip-dot"></span>
      <span class="strip-label">{activeEnvObj.type.toUpperCase()} · {activeEnvObj.name}</span>
      {#if activeEnvObj.url}<span class="strip-url">{activeEnvObj.url}</span>{/if}
    </div>
  {/if}
  <header class="header">
    <img class="logo" src="/logo.png" alt="AEM Logo" />
    <div class="title-group">
      <h1>AEM Log Viewer</h1>
      <span class="subtitle">Author &amp; Publish error logs</span>
    </div>
    <div class="live" class:paused>
      <span class="dot"></span>
      <span>{paused ? "Paused" : "Live"}</span>
    </div>
    <button class="icon-plain" class:on={settingsOpen} title="Settings & environments" aria-label="Settings"
      onclick={() => (settingsOpen = !settingsOpen)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
    {#if !isFluid}
      <button class="icon-plain" title="Open in a resizable window" aria-label="Pop out" onclick={popout}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6"></path><path d="M10 14 21 3"></path>
          <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"></path>
        </svg>
      </button>
    {/if}
    <button class="icon-plain close" aria-label="Close" onclick={closeViewer}>&times;</button>
  </header>

  {#if settingsOpen}
    <button class="settings-overlay" aria-label="Close settings" onclick={() => (settingsOpen = false)}></button>
    <div class="settings-panel">
      <div class="settings-head">
        <span>Environments <span class="settings-sub">— local-only labels</span></span>
        <button class="icon-plain" aria-label="Close settings" onclick={() => (settingsOpen = false)}>&times;</button>
      </div>
      <div class="env-opts">
        <div class="env-opt" class:active={activeEnv === ""} role="button" tabindex="0"
          onclick={() => selectEnv("")} onkeydown={(e) => onEnvKey(e, "")}>
          <span class="env-dot local"></span>
          <span class="env-opt-name">Local (unlabeled)</span>
          {#if activeEnv === ""}<span class="env-check">✓</span>{/if}
        </div>
        {#each environments as env, i (env.name)}
          <div class="env-opt" class:active={activeEnv === env.name} role="button" tabindex="0"
            onclick={() => selectEnv(env.name)} onkeydown={(e) => onEnvKey(e, env.name)}>
            <span class="env-dot {env.type}"></span>
            <span class="env-opt-name">{env.name}</span>
            <span class="env-opt-url">{env.url}</span>
            {#if activeEnv === env.name}<span class="env-check">✓</span>{/if}
            <button class="env-del" title="Delete" onclick={(e) => { e.stopPropagation(); delEnv(i); }}>✕</button>
          </div>
        {/each}
      </div>
      <div class="env-add">
        <input placeholder="Name (e.g. Prod EU)" bind:value={newEnvName} onkeydown={onAddKey} />
        <select bind:value={newEnvType}>
          <option value="prod">Prod</option>
          <option value="stage">Stage</option>
          <option value="dev">Dev</option>
          <option value="local">Local</option>
          <option value="other">Other</option>
        </select>
        <input class="env-url" placeholder="https://author-prod.example.com" bind:value={newEnvUrl} onkeydown={onAddKey} />
        <button class="icon-btn primary" onclick={addEnv}>Add</button>
      </div>
      <div class="env-hint">Label URLs so you always know what you're looking at. Nothing leaves this machine.</div>

      <div class="settings-sep"></div>
      <div class="settings-head2">Features</div>
      <label class="feat"><input type="checkbox" bind:checked={features.widget} /> Floating widget on AEM pages</label>
      <label class="feat"><input type="checkbox" bind:checked={features.envBadge} /> On-page environment badge (top-left)</label>
      <label class="feat"><input type="checkbox" bind:checked={features.llm} /> LLM analysis</label>
    </div>
  {/if}

  <div class="tab-row">
    <div class="segmented" role="tablist">
      <button class="seg" class:active={!splitView && currentTab === "author"} role="tab" onclick={() => selectTab("author")}>Author</button>
      <button class="seg" class:active={!splitView && currentTab === "publish"} role="tab" onclick={() => selectTab("publish")}>Publish</button>
    </div>
    <button class="icon-btn" class:on={splitView} title="Show Author & Publish side by side" onclick={toggleSplit}>⿻ Split</button>
  </div>

  <div class="toolbar">
    <div class="search">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input placeholder="Search logs..." autocomplete="off" bind:value={searchValue} oninput={onSearchInput} onkeydown={onSearchKey} />
    </div>
    <div class="filters">
      <label class="chip error"><input type="checkbox" bind:checked={filters.error} /> ERROR</label>
      <label class="chip warn"><input type="checkbox" bind:checked={filters.warn} /> WARN</label>
      <label class="chip info"><input type="checkbox" bind:checked={filters.info} /> INFO</label>
    </div>
    <div class="actions">
      <button class="icon-btn primary" title="Refresh now" onclick={() => void refreshNow()}>Refresh</button>
      <button class="icon-btn" class:on={paused} title="Pause / resume auto-refresh" onclick={() => (paused = !paused)}>{paused ? "Resume" : "Pause"}</button>
      <button class="icon-btn" title="Copy visible logs" onclick={copyLogs}>{copied ? "Copied!" : "Copy"}</button>
      <button class="icon-btn" title="Export visible logs" onclick={exportLogs}>Export</button>
      <button class="icon-btn" title="Clear view" onclick={clearLogs}>Clear</button>
    </div>
  </div>

  {#if features.llm}
  <div class="ai-row">
    <button class="icon-btn analyze" title="Analyze logs with an LLM" disabled={analyzing} onclick={runAnalyze}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="7" width="14" height="12" rx="2"></rect>
        <path d="M12 7V4"></path><circle cx="12" cy="3" r="1"></circle>
        <path d="M9 2v2M15 2v2M2 11h3M2 15h3M19 11h3M19 15h3"></path>
        <circle cx="10" cy="12" r="1"></circle><circle cx="14" cy="12" r="1"></circle>
        <path d="M9 16h6"></path>
      </svg>
      Analyze with LLM
    </button>
    <label class="provider-label">Engine
      <select bind:value={provider} onchange={onProviderChange}>
        <option value="ollama">Ollama (local)</option>
        <option value="gemini">Gemini Nano (built-in)</option>
        <option value="claude">Claude (your account)</option>
      </select>
    </label>
    {#if provider === "ollama"}
      <input class="ollama-url" title="Ollama server URL (default local port 11434)" placeholder="http://localhost:11434" bind:value={ollamaUrl} />
    {/if}
    {#if provider !== "gemini"}
      <input class="model" placeholder="model" bind:value={model} />
    {/if}
    {#if provider === "claude"}
      <input class="key" type="password" placeholder="sk-ant-... (stored locally)" autocomplete="off" bind:value={claudeKey} />
      <button class="icon-btn" title="Remove stored key" onclick={clearKey}>Clear key</button>
    {/if}
    <label class="redact-label" title="Mask paths, URLs, e-mails, IPs and UUIDs before sending">
      <input type="checkbox" disabled={provider === "gemini"} checked={provider === "gemini" || redact}
        onchange={(e) => (redact = e.currentTarget.checked)} /> Redact sensitive data
    </label>
    <span class="ai-status" class:err={aiErr}>{aiStatus}</span>
  </div>

  {#if provider === "gemini"}
    <div class="warn-box">
      ⚠️ <strong>Gemini Nano = Google model.</strong> Client names, JCR/file paths, URLs, e-mails and IPs are
      automatically redacted before sending. For fully confidential data use <strong>Ollama (local)</strong>.
    </div>
  {/if}
  {#if provider === "claude"}
    <div class="note-box">
      🔑 Uses <strong>your Anthropic account</strong>. The key is stored locally in this browser only and sent
      directly to api.anthropic.com. Only enable for data your account may process.
    </div>
  {/if}
  {/if}

  {#if analysisOpen}
    <div class="analysis">
      <div class="analysis-head">
        <h3>LLM Analysis</h3>
        <button class="icon-plain" aria-label="Close analysis" onclick={() => (analysisOpen = false)}>&times;</button>
      </div>
      <div class="analysis-body">{analysisText || "Analyzing…"}</div>
    </div>
  {/if}

  <div class="log-container">
    {#if activeEnvs.includes("author")}
      <div class="log-section">
        <div class="log-head">
          <h3>Author <span class="port">:4502</span></h3>
          <span class="count">{authorView.count} lines</span>
        </div>
        <div class="log" bind:this={authorLogEl}>
          {#if authorError}
            <span class="empty">Error: {authorError}</span>
          {:else if authorView.count === 0}
            <span class="empty">{authorRaw ? "No matching log lines." : "No logs loaded."}</span>
          {:else}
            {#each authorView.rows as row}
              <span class="log-line" class:error={row.level === "error"} class:warn={row.level === "warn"} class:info={row.level === "info"}>{#each row.segs as seg}{#if seg.mark}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
    {#if activeEnvs.includes("publish")}
      <div class="log-section">
        <div class="log-head">
          <h3>Publish <span class="port">:4503</span></h3>
          <span class="count">{publishView.count} lines</span>
        </div>
        <div class="log" bind:this={publishLogEl}>
          {#if publishError}
            <span class="empty">Error: {publishError}</span>
          {:else if publishView.count === 0}
            <span class="empty">{publishRaw ? "No matching log lines." : "No logs loaded."}</span>
          {:else}
            {#each publishView.rows as row}
              <span class="log-line" class:error={row.level === "error"} class:warn={row.level === "warn"} class:info={row.level === "info"}>{#each row.segs as seg}{#if seg.mark}<mark>{seg.text}</mark>{:else}{seg.text}{/if}{/each}</span>
            {/each}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</main>

<style>
  :global(html, body) { margin: 0; }
  :global(body) { background: #1d1d1d; width: 820px; max-width: 100vw; }
  :global(body:has(.app.fluid)) { width: 100%; }

  .app {
    --red: #e34850;
    --red-hover: #ec5b62;
    --bg: #1d1d1d;
    --bg-raised: #252525;
    --bg-sunken: #161616;
    --border: #323232;
    --border-strong: #3f3f3f;
    --text: #e8e8e8;
    --text-dim: #adadad;
    --text-faint: #7a7a7a;
    --error: #ec5b62;
    --warn: #e8a33d;
    --info: #5aa7a7;
    --accent: #378ef0;
    --radius: 6px;
    --mono: "SF Mono", "JetBrains Mono", "Roboto Mono", Menlo, Consolas, monospace;

    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    position: relative;
    container-type: inline-size;
    padding: 14px 16px 16px;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    font-family: "adobe-clean", "Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .app * { box-sizing: border-box; }

  .app.fluid { width: 100%; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  .app.fluid .log-container { flex: 1; min-height: 0; }
  .app.fluid .log-container:has(.log-section:nth-child(2)) { flex-direction: row; }
  .app.fluid .log-section { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .app.fluid .log { flex: 1; height: auto; min-height: 120px; }

  /* Narrow container (widget / resized pop-out): stack the split panes. */
  @container (max-width: 640px) {
    .app.fluid .log-container { flex-direction: column; }
  }

  .header {
    display: flex; align-items: center; gap: 12px;
    padding-bottom: 12px; margin-bottom: 12px; border-bottom: 1px solid var(--border);
  }
  .logo { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; box-shadow: 0 0 0 1px var(--border-strong); }
  .title-group { display: flex; flex-direction: column; line-height: 1.2; }
  h1 { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.2px; color: #fff; }
  .subtitle { font-size: 11px; color: var(--text-faint); }

  .live {
    margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-dim);
    padding: 4px 9px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 999px;
  }
  .live .dot { width: 7px; height: 7px; border-radius: 50%; background: #3fcf6e; animation: pulse 2s infinite; }
  .live.paused .dot { background: var(--text-faint); animation: none; }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(63,207,110,.5); }
    70% { box-shadow: 0 0 0 6px rgba(63,207,110,0); }
    100% { box-shadow: 0 0 0 0 rgba(63,207,110,0); }
  }

  .icon-plain { background: transparent; border: none; color: var(--text-faint); cursor: pointer; border-radius: var(--radius); display: inline-flex; align-items: center; padding: 5px 6px; }
  .icon-plain:hover { color: #fff; background: var(--bg-raised); }
  .icon-plain.close { font-size: 22px; line-height: 1; padding: 2px 6px; }

  /* Full-width environment strip — impossible to miss which instance you're on. */
  .env-strip {
    display: flex; align-items: center; gap: 9px;
    margin: -14px -16px 12px; padding: 7px 16px;
    font-size: 11px; font-weight: 800; letter-spacing: 0.6px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.35);
  }
  .strip-dot { width: 9px; height: 9px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
  .strip-label { white-space: nowrap; }
  .strip-url { margin-left: auto; font-weight: 500; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; }

  .env-strip.prod { background: var(--red); color: #fff; animation: prodPulse 1.6s infinite; }
  .env-strip.stage { background: #d4a916; color: #221a00; }
  .env-strip.dev { background: #1f7a4d; color: #eafff3; }
  .env-strip.local { background: #1f7a4d; color: #eafff3; }
  .env-strip.other { background: #1f4e86; color: #d6e7fb; }
  @keyframes prodPulse {
    0%, 100% { box-shadow: inset 0 0 0 0 rgba(255, 255, 255, 0); }
    50% { box-shadow: inset 0 -3px 0 0 rgba(255, 255, 255, 0.35); }
  }
  .app.fluid .env-strip { margin-top: -14px; }

  .tab-row { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .segmented { display: inline-flex; background: var(--bg-sunken); border: 1px solid var(--border); border-radius: var(--radius); padding: 3px; }
  .seg { background: transparent; border: none; color: var(--text-dim); font-size: 13px; font-weight: 600; padding: 6px 18px; border-radius: 4px; cursor: pointer; transition: background .12s, color .12s; }
  .seg:hover { color: var(--text); }
  .seg.active { background: var(--red); color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); }

  .icon-plain.on { color: var(--accent); background: var(--bg-raised); }

  .env-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; background: var(--text-faint); }
  .env-dot.prod { background: var(--red); box-shadow: 0 0 0 3px rgba(227,72,80,.25); }
  .env-dot.stage { background: #e6c619; }
  .env-dot.dev { background: #3fcf6e; }
  .env-dot.local { background: #3fcf6e; }
  .env-dot.other { background: var(--accent); }

  .settings-overlay { position: fixed; inset: 0; z-index: 40; background: rgba(0,0,0,.35); border: none; padding: 0; cursor: default; }
  .settings-panel {
    position: absolute; top: 56px; right: 16px; z-index: 41; width: min(360px, calc(100% - 32px));
    background: var(--bg-raised); border: 1px solid var(--border-strong); border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0,0,0,.5); padding: 10px;
  }
  .settings-head { display: flex; align-items: center; justify-content: space-between; font-size: 11px; font-weight: 800; letter-spacing: .4px; color: var(--text); padding: 2px 4px 10px; }
  .settings-head .icon-plain { font-size: 18px; line-height: 1; padding: 0 4px; }
  .settings-sub { font-weight: 500; color: var(--text-faint); }
  .settings-sep { height: 1px; background: var(--border); margin: 12px 0 10px; }
  .settings-head2 { font-size: 11px; font-weight: 800; letter-spacing: .4px; color: var(--text); padding: 0 4px 6px; }
  .feat { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-dim); padding: 5px 6px; cursor: pointer; user-select: none; }
  .feat input { margin: 0; accent-color: var(--red); cursor: pointer; }
  .env-opts { display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; }
  .env-opt { display: flex; align-items: center; gap: 9px; padding: 7px 8px; border-radius: var(--radius); cursor: pointer; border: 1px solid transparent; }
  .env-opt:hover { background: var(--bg-sunken); }
  .env-opt.active { background: var(--bg-sunken); border-color: var(--border); }
  .env-opt-name { font-size: 12.5px; font-weight: 600; color: var(--text); }
  .env-opt-url { font-size: 11px; color: var(--text-faint); margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 130px; }
  .env-check { color: var(--accent); font-weight: 800; margin-left: auto; }
  .env-del { background: transparent; border: none; color: var(--text-faint); cursor: pointer; font-size: 11px; padding: 2px 5px; border-radius: 4px; flex-shrink: 0; }
  .env-del:hover { color: var(--error); background: var(--bg-raised); }
  .env-add { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 2px 2px; border-top: 1px solid var(--border); margin-top: 8px; }
  .env-add input { flex: 1 1 100%; }
  .env-add select { flex: 1 1 90px; }
  .env-add .icon-btn { flex: 0 0 auto; }
  .env-hint { font-size: 10.5px; color: var(--text-faint); padding: 8px 2px 0; line-height: 1.4; }

  .icon-btn { background: var(--bg-raised); border: 1px solid var(--border-strong); color: var(--text); font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: var(--radius); cursor: pointer; transition: background .12s, border-color .12s; }
  .icon-btn:hover { background: #2f2f2f; border-color: #4a4a4a; }
  .icon-btn:disabled { opacity: 0.5; cursor: default; }
  .icon-btn.primary { background: var(--red); border-color: var(--red); color: #fff; }
  .icon-btn.primary:hover { background: var(--red-hover); border-color: var(--red-hover); }
  .icon-btn.on { color: var(--warn); border-color: var(--warn); }

  select, .env-add input, .search input, .ai-row input {
    background: var(--bg-sunken); border: 1px solid var(--border-strong); color: var(--text);
    border-radius: var(--radius); padding: 5px 8px; font-size: 12px; outline: none;
  }
  select:focus, input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(55,142,240,.25); }

  .toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .search { position: relative; display: flex; align-items: center; flex: 1 1 220px; min-width: 200px; }
  .search-icon { position: absolute; left: 10px; color: var(--text-faint); pointer-events: none; }
  .search input { width: 100%; padding-left: 32px; }

  .filters { display: flex; gap: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 999px; font-size: 11px; font-weight: 600; letter-spacing: 0.3px; cursor: pointer; user-select: none; }
  .chip input { margin: 0; cursor: pointer; accent-color: var(--red); }
  .chip.error { color: var(--error); }
  .chip.warn { color: var(--warn); }
  .chip.info { color: var(--info); }

  .actions { display: flex; gap: 6px; }

  .ai-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .analyze { display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg, var(--red), #c13584); border-color: transparent; color: #fff; }
  .analyze:hover { filter: brightness(1.08); }
  .analyze svg { flex-shrink: 0; }
  .provider-label { font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 6px; }
  .ai-row input.model { width: 150px; }
  .ai-row input.key { width: 220px; }
  .ai-row input.ollama-url { width: 180px; }
  .redact-label { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--text-dim); cursor: pointer; user-select: none; }
  .redact-label input { margin: 0; cursor: pointer; accent-color: var(--red); }
  .ai-status { font-size: 11px; color: var(--text-faint); }
  .ai-status.err { color: var(--error); }

  .warn-box { background: rgba(232,163,61,.1); border: 1px solid rgba(232,163,61,.4); border-radius: var(--radius); padding: 8px 12px; font-size: 11.5px; line-height: 1.5; color: #f0c37a; margin-bottom: 12px; }
  .warn-box strong { color: var(--warn); }
  .note-box { background: rgba(55,142,240,.1); border: 1px solid rgba(55,142,240,.4); border-radius: var(--radius); padding: 8px 12px; font-size: 11.5px; line-height: 1.5; color: #9cc4f5; margin-bottom: 12px; }
  .note-box strong { color: var(--accent); }

  .analysis { background: var(--bg-raised); border: 1px solid var(--border); border-left: 3px solid var(--red); border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
  .analysis-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .analysis-head h3 { margin: 0; font-size: 12px; font-weight: 700; color: #fff; }
  .analysis-body { padding: 12px; font-size: 12.5px; line-height: 1.6; color: var(--text); max-height: 240px; overflow-y: auto; white-space: pre-wrap; }

  .log-container { display: flex; flex-direction: column; gap: 12px; }
  .log-section { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .log-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .log-head h3 { margin: 0; font-size: 12px; font-weight: 700; color: var(--text); letter-spacing: 0.2px; }
  .log-head .port { color: var(--text-faint); font-weight: 500; }
  .count { font-size: 10px; color: var(--text-dim); background: var(--bg-sunken); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border); }

  .log { background: var(--bg-sunken); padding: 8px 12px; height: 260px; overflow-y: auto; white-space: pre-wrap; font-family: var(--mono); font-size: 11.5px; line-height: 1.55; }
  .log-line { display: block; white-space: pre-wrap; padding: 1px 0 1px 8px; margin-left: -8px; border-left: 2px solid transparent; color: var(--text-dim); }
  .log-line.error { color: var(--error); border-left-color: var(--error); }
  .log-line.warn { color: var(--warn); }
  .log-line.info { color: var(--info); }
  .log :global(mark) { background: var(--red); color: #fff; border-radius: 2px; padding: 0 1px; }
  .empty { color: var(--text-faint); font-style: italic; }

  .log::-webkit-scrollbar { width: 10px; }
  .log::-webkit-scrollbar-track { background: transparent; }
  .log::-webkit-scrollbar-thumb { background: #3a3a3a; border-radius: 6px; border: 2px solid var(--bg-sunken); }
  .log::-webkit-scrollbar-thumb:hover { background: #4a4a4a; }
</style>
