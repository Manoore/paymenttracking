import { claudeReader } from "./claude.js";
import { geminiReader } from "./gemini.js";
import { openAiReader } from "./openai.js";
import type { DocumentReader, ProviderId } from "./types.js";

export * from "./types.js";

/**
 * Provider registry. To add another provider: implement DocumentReader in a new
 * file and add one entry here (plus its label/default model in PROVIDER_INFO).
 */
const readers: Record<ProviderId, DocumentReader> = {
  openai: openAiReader(),
  anthropic: claudeReader(),
  gemini: geminiReader(),
  openai_compatible: openAiReader(),
};

export const PROVIDER_INFO: Record<ProviderId, { label: string; defaultModel: string; models: string[]; needsBaseUrl?: boolean; keyHint: string }> = {
  openai: {
    label: "OpenAI (GPT)",
    defaultModel: "gpt-5-mini",
    models: ["gpt-5-mini", "gpt-5", "gpt-4.1-mini", "gpt-4o-mini"],
    keyHint: "Starts with sk-. Create at platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Anthropic (Claude)",
    defaultModel: "claude-opus-5",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
    keyHint: "Starts with sk-ant-. Create at console.anthropic.com",
  },
  gemini: {
    label: "Google (Gemini)",
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    keyHint: "Create at aistudio.google.com/apikey",
  },
  openai_compatible: {
    label: "Other (OpenAI-compatible)",
    defaultModel: "",
    models: [],
    needsBaseUrl: true,
    keyHint: "Any service with an OpenAI-style API: OpenRouter, Groq, Together, a local Ollama…",
  },
};

export const readerFor = (provider: ProviderId) => readers[provider];
