import type { LogLevel } from "./types";

export const ENDPOINTS = {
  author:
    "http://localhost:4502/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log",
  publish:
    "http://localhost:4503/system/console/slinglog/tailer.txt?tail=10000&grep=*&name=%2Flogs%2Ferror.log",
} as const;

export type AemEnvKey = keyof typeof ENDPOINTS;

/** Classify a log line by level. Returns null for lines with no level marker. */
export function levelOf(line: string): LogLevel {
  if (/\*ERROR\*|\bERROR\b/.test(line)) return "error";
  if (/\*WARN\*|\bWARN\b/.test(line)) return "warn";
  if (/\*INFO\*|\bINFO\b/.test(line)) return "info";
  return null;
}

export type FetchResult =
  | { success: true; data: string }
  | { success: false; error: string };

/** Fetch an error.log tail directly from the popup via host_permissions. */
export async function fetchLog(env: AemEnvKey): Promise<FetchResult> {
  try {
    const resp = await fetch(ENDPOINTS[env], { credentials: "include" });
    if (!resp.ok) return { success: false, error: `HTTP ${resp.status}` };
    return { success: true, data: await resp.text() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `${msg} — is AEM ${env} running & are you logged in?` };
  }
}
