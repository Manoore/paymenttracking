import {
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA,
  normalizeExtraction,
  ReaderError,
  type DocumentReader,
  type ProviderConfig,
  type ReadInput,
} from "./types.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Gemini's responseSchema is an OpenAPI subset: nullable flag instead of ["x","null"], no additionalProperties. */
function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "additionalProperties") continue;
    if (k === "type" && Array.isArray(v)) {
      out.type = v.find((t) => t !== "null");
      if (v.includes("null")) out.nullable = true;
    } else if (k === "enum" && Array.isArray(v)) {
      out.enum = v.filter((e) => e !== null);
    } else out[k] = toGeminiSchema(v);
  }
  return out;
}

async function failure(res: Response, what: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
  const detail = body?.error?.message ? `: ${body.error.message}` : "";
  if (res.status === 400 && /API key/i.test(detail)) return new ReaderError(`The Gemini API key was rejected${detail}`, 400);
  if (res.status === 403) return new ReaderError(`The Gemini API key isn't allowed to use this model${detail}`, 400);
  if (res.status === 404) return new ReaderError(`Model not found${detail}`, 400);
  if (res.status === 429) return new ReaderError(`Rate limit or quota reached at Google${detail}`, 429);
  return new ReaderError(`${what} failed (${res.status})${detail}`);
}

export function geminiReader(): DocumentReader {
  const headers = (cfg: ProviderConfig) => ({ "x-goog-api-key": cfg.apiKey, "Content-Type": "application/json" });
  return {
    async read(cfg: ProviderConfig, input: ReadInput) {
      const res = await fetch(`${BASE}/models/${encodeURIComponent(cfg.model)}:generateContent`, {
        method: "POST",
        headers: headers(cfg),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: EXTRACTION_PROMPT }] },
          contents: [
            {
              role: "user",
              parts: [
                { inline_data: { mime_type: input.mimeType, data: input.bytes.toString("base64") } },
                { text: "Read this file and extract the fields." },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", responseSchema: toGeminiSchema(EXTRACTION_SCHEMA) },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw await failure(res, "Reading the document");
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
        promptFeedback?: { blockReason?: string };
      };
      if (data.promptFeedback?.blockReason) throw new ReaderError(`Gemini declined to read this file (${data.promptFeedback.blockReason})`, 422);
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      try {
        return normalizeExtraction(JSON.parse(text));
      } catch {
        throw new ReaderError("Gemini returned an unreadable answer; try again");
      }
    },
    async test(cfg: ProviderConfig) {
      const res = await fetch(`${BASE}/models/${encodeURIComponent(cfg.model)}`, { headers: headers(cfg), signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw await failure(res, "Checking the key");
    },
  };
}
