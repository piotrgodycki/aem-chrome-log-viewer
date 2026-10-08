import {
  DEFAULT_FEATURES,
  type Features,
} from "../lib/types";
import {
  DL_MSG,
  DL_STORAGE_KEY,
  type DLEvent,
  type DLMessage,
  type DLSnapshot,
} from "../lib/datalayer";

// Isolated world: receives data-layer messages from the MAIN world and mirrors
// the latest snapshot into chrome.storage.local, which the viewer reads live.
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_start",
  allFrames: true,
  main() {
    let enabled = true;
    const check = async () => {
      try {
        const cfg = (await browser.storage.local.get("features")) as { features?: Partial<Features> };
        enabled = { ...DEFAULT_FEATURES, ...(cfg.features ?? {}) }.dataLayer;
      } catch {
        /* extension context gone */
      }
    };
    void check();
    try {
      browser.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.features) void check();
      });
    } catch {
      /* extension context gone */
    }

    const events: DLEvent[] = [];
    let acdlState: unknown = null;
    let gtmState: unknown = null;
    let href = location.href;
    let seq = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const build = (n: number, withState: boolean): DLSnapshot => ({
      events: events.slice(-n),
      acdlState: withState ? acdlState : null,
      gtmState: withState ? gtmState : null,
      href,
      updated: Date.now(),
    });

    const save = (snap: DLSnapshot) => {
      try {
        // storage.local.set returns a Promise in MV3; swallow quota/context errors.
        void Promise.resolve(browser.storage.local.set({ [DL_STORAGE_KEY]: snap })).catch(() => {
          try {
            void Promise.resolve(
              browser.storage.local.set({ [DL_STORAGE_KEY]: build(30, false) }),
            ).catch(() => {});
          } catch {
            /* extension context gone */
          }
        });
      } catch {
        /* extension context gone */
      }
    };

    const flush = () => {
      timer = null;
      // Keep the stored snapshot well under the storage quota: drop the big
      // state blobs (and trim events) if the payload gets too large.
      let snap = build(200, true);
      try {
        if (JSON.stringify(snap).length > 1_500_000) snap = build(100, false);
      } catch {
        snap = build(50, false);
      }
      save(snap);
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(flush, 200);
    };

    window.addEventListener("message", (e) => {
      if (e.source !== window) return;
      const d = e.data as DLMessage | undefined;
      if (!d || d[DL_MSG] !== true) return;
      if (!enabled) return;

      href = d.href || href;
      if (d.kind === "state") {
        if (d.source === "acdl") acdlState = d.data;
        else gtmState = d.data;
      } else {
        events.push({ id: ++seq, source: d.source, name: String(d.name || "event"), ts: d.ts || Date.now(), data: d.data });
        if (events.length > 400) events.splice(0, events.length - 400);
      }
      schedule();
    });
  },
});
