import { DL_MSG, type DLMessage } from "../lib/datalayer";

// Runs in the page's MAIN world (no extension APIs) so it can see
// window.adobeDataLayer / window.dataLayer. It hooks both and relays events +
// state to the isolated relay via window.postMessage.
export default defineContentScript({
  matches: ["http://*/*", "https://*/*"],
  runAt: "document_start",
  allFrames: true,
  world: "MAIN",
  main() {
    const post = (kind: DLMessage["kind"], source: DLMessage["source"], name: string, data: unknown) => {
      let safe: unknown = null;
      try {
        safe = JSON.parse(JSON.stringify(data));
      } catch {
        try {
          safe = String(data);
        } catch {
          safe = null;
        }
      }
      const msg: DLMessage = {
        [DL_MSG]: true,
        kind,
        source,
        name,
        data: safe,
        href: location.href,
        ts: Date.now(),
      };
      window.postMessage(msg, location.origin);
    };

    // --- Adobe Client Data Layer -------------------------------------------
    try {
      const w = window as any;
      w.adobeDataLayer = w.adobeDataLayer || [];
      // ACDL runs pushed functions with the data layer as `this`, even for
      // functions pushed before it finishes loading.
      w.adobeDataLayer.push(function (this: any) {
        const dl = this;
        try {
          dl.addEventListener("adobeDataLayer:event", (e: any) => {
            post("event", "acdl", e?.event ?? "event", e);
          });
          dl.addEventListener("adobeDataLayer:change", () => {
            try {
              post("state", "acdl", "state", dl.getState());
            } catch {
              /* ignore */
            }
          });
          post("state", "acdl", "state", dl.getState());
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }

    // --- GTM-style dataLayer ------------------------------------------------
    try {
      const w = window as any;
      const existing: any[] = Array.isArray(w.dataLayer) ? w.dataLayer.slice() : [];
      w.dataLayer = w.dataLayer || [];
      const orig = w.dataLayer.push.bind(w.dataLayer);
      w.dataLayer.push = function (...args: any[]) {
        for (const a of args) post("event", "gtm", (a && a.event) || "push", a);
        return orig(...args);
      };
      for (const a of existing) post("event", "gtm", (a && a.event) || "push", a);
    } catch {
      /* ignore */
    }
  },
});
