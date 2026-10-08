// Shared contract between the data-layer content scripts and the viewer.

/** window.postMessage tag used from the MAIN world → isolated relay. */
export const DL_MSG = "__aem_dl__";

/** chrome.storage.local key holding the latest data-layer snapshot. */
export const DL_STORAGE_KEY = "datalayer";

export type DLSource = "acdl" | "gtm";

export interface DLEvent {
  id: number;
  source: DLSource;
  name: string;
  ts: number;
  data: unknown;
}

export interface DLSnapshot {
  events: DLEvent[];
  acdlState: unknown;
  gtmState: unknown;
  href: string;
  updated: number;
}

/** Message shape posted from the MAIN world. */
export interface DLMessage {
  [DL_MSG]: true;
  kind: "event" | "state";
  source: DLSource;
  name: string;
  data: unknown;
  href: string;
  ts: number;
}
