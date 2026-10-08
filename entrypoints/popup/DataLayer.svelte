<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { DL_STORAGE_KEY, type DLSnapshot } from "../../lib/datalayer";

  let snap = $state<DLSnapshot | null>(null);
  let source = $state<"all" | "acdl" | "gtm">("all");
  let query = $state("");
  let metaOpen = $state(true);
  let order = $state<"desc" | "asc">("desc");

  // Events are stored in capture order (oldest → newest); #id is the absolute
  // sequence so the order is unambiguous regardless of sort direction.
  const events = $derived.by(() => {
    const list = (snap?.events ?? [])
      .filter((e) => source === "all" || e.source === source)
      .filter((e) => !query || e.name.toLowerCase().includes(query.toLowerCase()));
    return order === "desc" ? list.slice().reverse() : list.slice();
  });

  // Prefer the AEM page meta if present, else the whole state.
  const pageMeta = $derived.by(() => {
    const s = snap?.acdlState as any;
    if (s && typeof s === "object") return s.page ?? s;
    return s ?? null;
  });

  function pretty(v: unknown): string {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  function time(ts: number): string {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return "";
    }
  }

  async function load() {
    const cfg = (await browser.storage.local.get(DL_STORAGE_KEY)) as Record<string, any>;
    snap = cfg[DL_STORAGE_KEY] ?? null;
  }
  function onChange(changes: Record<string, any>, area: string) {
    if (area === "local" && changes[DL_STORAGE_KEY]) snap = changes[DL_STORAGE_KEY].newValue ?? null;
  }
  function clearEvents() {
    const next: DLSnapshot = {
      events: [],
      acdlState: snap?.acdlState ?? null,
      gtmState: snap?.gtmState ?? null,
      href: snap?.href ?? "",
      updated: Date.now(),
    };
    browser.storage.local.set({ [DL_STORAGE_KEY]: next });
  }

  onMount(() => {
    void load();
    browser.storage.onChanged.addListener(onChange);
  });
  onDestroy(() => browser.storage.onChanged.removeListener(onChange));
</script>

<div class="dl">
  {#if !snap}
    <div class="dl-empty">
      No data layer captured yet. Open an AEM page (localhost:4502/4503) that uses the Adobe Client Data Layer
      or a GTM <code>dataLayer</code>, then interact with it.
    </div>
  {:else}
    {#if snap.href}<div class="dl-src">from <span>{snap.href}</span></div>{/if}

    <div class="dl-meta">
      <button class="dl-meta-head" onclick={() => (metaOpen = !metaOpen)}>
        <span class="chev" class:open={metaOpen}>▸</span> Page meta / state
      </button>
      {#if metaOpen}
        <pre class="dl-json">{pageMeta ? pretty(pageMeta) : "No ACDL state available."}</pre>
      {/if}
    </div>

    <div class="dl-toolbar">
      <div class="seg small">
        <button class:active={source === "all"} onclick={() => (source = "all")}>All</button>
        <button class:active={source === "acdl"} onclick={() => (source = "acdl")}>ACDL</button>
        <button class:active={source === "gtm"} onclick={() => (source = "gtm")}>GTM</button>
      </div>
      <input class="dl-search" placeholder="Filter events…" bind:value={query} />
      <span class="dl-count">{events.length}</span>
      <button class="dl-clear" title="Toggle sort order" onclick={() => (order = order === "desc" ? "asc" : "desc")}>
        {order === "desc" ? "Newest ↓" : "Oldest ↑"}
      </button>
      <button class="dl-clear" onclick={clearEvents}>Clear</button>
    </div>

    <div class="dl-events">
      {#if events.length === 0}
        <div class="dl-empty">No matching events.</div>
      {:else}
        {#each events as ev (ev.id)}
          <details class="dl-event">
            <summary>
              <span class="seq">#{ev.id}</span>
              <span class="src {ev.source}">{ev.source.toUpperCase()}</span>
              <span class="name">{ev.name}</span>
              <span class="ts">{time(ev.ts)}</span>
            </summary>
            <pre class="dl-json">{pretty(ev.data)}</pre>
          </details>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .dl { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  :global(.app.fluid) .dl { flex: 1; }

  .dl-empty { color: var(--text-faint); font-size: 12px; line-height: 1.6; padding: 16px; background: var(--bg-raised); border: 1px solid var(--border); border-radius: 8px; }
  .dl-empty code { background: var(--bg-sunken); padding: 1px 5px; border-radius: 4px; }
  .dl-src { font-size: 10.5px; color: var(--text-faint); }
  .dl-src span { color: var(--text-dim); }

  .dl-meta { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .dl-meta-head { width: 100%; text-align: left; background: transparent; border: none; color: var(--text); font-size: 12px; font-weight: 700; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  .dl-meta-head .chev { transition: transform .12s; color: var(--text-faint); }
  .dl-meta-head .chev.open { transform: rotate(90deg); }

  .dl-toolbar { display: flex; align-items: center; gap: 8px; }
  .seg.small { display: inline-flex; background: var(--bg-sunken); border: 1px solid var(--border); border-radius: var(--radius); padding: 2px; }
  .seg.small button { background: transparent; border: none; color: var(--text-dim); font-size: 11px; font-weight: 600; padding: 4px 11px; border-radius: 4px; cursor: pointer; }
  .seg.small button.active { background: var(--red); color: #fff; }
  .dl-search { flex: 1; background: var(--bg-sunken); border: 1px solid var(--border-strong); color: var(--text); border-radius: var(--radius); padding: 6px 9px; font-size: 12px; outline: none; }
  .dl-search:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(55,142,240,.25); }
  .dl-count { font-size: 10px; color: var(--text-dim); background: var(--bg-sunken); padding: 3px 9px; border-radius: 999px; border: 1px solid var(--border); }
  .dl-clear { background: var(--bg-raised); border: 1px solid var(--border-strong); color: var(--text); font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: var(--radius); cursor: pointer; }
  .dl-clear:hover { background: #2f2f2f; }

  .dl-events { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; }
  :global(.app.fluid) .dl-events { flex: 1; min-height: 0; }
  :global(.app:not(.fluid)) .dl-events { max-height: 360px; }

  .dl-event { background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px; }
  .dl-event summary { display: flex; align-items: center; gap: 9px; padding: 7px 10px; cursor: pointer; list-style: none; font-size: 12px; }
  .dl-event summary::-webkit-details-marker { display: none; }
  .seq { font-family: var(--mono); font-size: 10px; color: var(--text-faint); min-width: 30px; }
  .src { font-size: 9px; font-weight: 800; letter-spacing: .4px; padding: 2px 6px; border-radius: 4px; }
  .src.acdl { background: rgba(227,72,80,.18); color: #ff8085; }
  .src.gtm { background: rgba(55,142,240,.18); color: #9cc4f5; }
  .name { font-weight: 600; color: var(--text); }
  .ts { margin-left: auto; font-size: 10.5px; color: var(--text-faint); }

  .dl-json { margin: 0; padding: 10px 12px; background: var(--bg-sunken); border-top: 1px solid var(--border); font-family: var(--mono); font-size: 11px; line-height: 1.5; color: var(--text-dim); white-space: pre-wrap; word-break: break-word; max-height: 240px; overflow: auto; }
</style>
