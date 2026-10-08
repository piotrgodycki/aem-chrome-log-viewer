export type Provider = "ollama" | "gemini" | "claude";

export type EnvType = "prod" | "stage" | "dev" | "local" | "other";

export interface AemEnv {
  name: string;
  type: EnvType;
  url: string;
}

export type LogLevel = "error" | "warn" | "info" | null;

export type View = "tab" | "widget" | null;

export interface Features {
  widget: boolean;
  envBadge: boolean;
  dataLayer: boolean;
  llm: boolean;
  tools: boolean;
}

export const DEFAULT_FEATURES: Features = {
  widget: true,
  envBadge: true,
  dataLayer: true,
  llm: true,
  tools: true,
};

