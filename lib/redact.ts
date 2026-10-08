/**
 * Mask anything that could leak a client identity or environment before the
 * logs leave the viewer. Always applied for Gemini (Google); opt-in for the rest.
 */
export function redactSensitive(text: string): string {
  return text
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[PATH]") // Windows paths
    .replace(/(?:\/[\w.\-@%]+){2,}\/?/g, "[PATH]") // JCR / unix paths
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, "[URL]")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g, "[EMAIL]")
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "[IP]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[UUID]");
}
