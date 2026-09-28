import {
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA,
  normalizeExtraction,
  ReaderError,
  type DocumentReader,
  type ProviderConfig,
  type ReadInput,
} from "./types.js";

const OPENAI_BASE = "https://api.openai.com/v1";

async function failure(res: Response, what: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const detail = body?.error?.message ? `: ${body.error.message}` : "";
  if (res.status === 401) return new ReaderError(`The API key was rejected${detail}`, 400);
  if (res.status === 404) return new ReaderError(`Model not found or not available to this key${detail}`, 400);
  if (res.status === 429) return new ReaderError(`Rate limit or quota reached at the provider${detail}`, 429);
  return new ReaderError(`${what} failed (${res.status})${detail}`);
}

/**
 * OpenAI Chat Completions with JSON-schema structured output. The same code
 * serves any "OpenAI-compatible" service (OpenRouter, Groq, Together, a local
 * Ollama…) by pointing baseUrl at it; those may not support PDFs or strict
 * schemas, in which case the provider's own error is shown.
 */
export function openAiReader(defaultBase = OPENAI_BASE): DocumentReader {
  const base = (cfg: ProviderConfig) => (cfg.baseUrl || defaultBase).replace(/\/+$/, "");
  const headers = (cfg: ProviderConfig) => ({ Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" });

  return {
    async read(cfg: ProviderConfig, input: ReadInput) {
      const dataUrl = `data:${input.mimeType};base64,${input.bytes.toString("base64")}`;
      const filePart =
        input.mimeType === "application/pdf"
          ? { type: "file", file: { filename: input.filename, file_data: dataUrl } }
          : { type: "image_url", image_url: { url: dataUrl, detail: "high" } };
      const res = await fetch(`${base(cfg)}/chat/completions`, {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          model: cfg.model,
          messages: [
            { role: "system", content: EXTRACTION_PROMPT },
            { role: "user", content: [{ type: "text", text: "Read this file and extract the fields." }, filePart] },
          ],
          response_format: { type: "json_schema", json_schema: { name: "document_extraction", strict: true, schema: EXTRACTION_SCHEMA } },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw await failure(res, "Reading the document");
      const data = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
      const msg = data.choices?.[0]?.message;
      if (msg?.refusal) throw new ReaderError(`The model declined to read this file: ${msg.refusal}`, 422);
      try {
        return normalizeExtraction(JSON.parse(msg?.content ?? ""));
      } catch {
        throw new ReaderError("The model returned an unreadable answer; try again or pick another model");
      }
    },

    async test(cfg: ProviderConfig) {
      const res = await fetch(`${base(cfg)}/models/${encodeURIComponent(cfg.model)}`, {
        headers: headers(cfg),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw await failure(res, "Checking the key");
    },
  };
}
