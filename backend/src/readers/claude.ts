import Anthropic from "@anthropic-ai/sdk";
import {
  EXTRACTION_PROMPT,
  EXTRACTION_SCHEMA,
  normalizeExtraction,
  ReaderError,
  type DocumentReader,
  type ProviderConfig,
  type ReadInput,
} from "./types.js";

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

// Server-side refusal fallbacks are supported on these families; the API then
// retries a declined request on its default fallback model within the same call.
const supportsFallbacks = (model: string) => /^claude-(opus-5|fable-5)/.test(model);

function toReaderError(err: unknown): ReaderError {
  if (err instanceof Anthropic.AuthenticationError) return new ReaderError("The Anthropic API key was rejected", 400);
  if (err instanceof Anthropic.NotFoundError) return new ReaderError("Model not found or not available to this key", 400);
  if (err instanceof Anthropic.RateLimitError) return new ReaderError("Rate limit or quota reached at Anthropic", 429);
  if (err instanceof Anthropic.BadRequestError) return new ReaderError(`Anthropic rejected the request: ${err.message}`, 400);
  if (err instanceof Anthropic.APIConnectionError) return new ReaderError("Could not reach Anthropic; try again");
  if (err instanceof Anthropic.APIError) return new ReaderError(`Anthropic error (${err.status ?? "?"}): ${err.message}`);
  return err instanceof ReaderError ? err : new ReaderError("Reading the document failed");
}

/** Claude via the official Anthropic SDK: image or PDF in, schema-constrained JSON out. */
export function claudeReader(): DocumentReader {
  const client = (cfg: ProviderConfig) => new Anthropic({ apiKey: cfg.apiKey, timeout: 120_000, maxRetries: 2 });

  return {
    async read(cfg: ProviderConfig, input: ReadInput) {
      const data = input.bytes.toString("base64");
      const file =
        input.mimeType === "application/pdf"
          ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
          : ({ type: "image", source: { type: "base64", media_type: input.mimeType as ImageMediaType, data } } as const);
      try {
        const response = await client(cfg).beta.messages.create({
          model: cfg.model,
          max_tokens: 16000,
          system: EXTRACTION_PROMPT,
          messages: [{ role: "user", content: [file, { type: "text", text: "Read this file and extract the fields." }] }],
          output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> } },
          ...(supportsFallbacks(cfg.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
        if (response.stop_reason === "refusal") throw new ReaderError("Claude declined to read this file", 422);
        if (response.stop_reason === "max_tokens") throw new ReaderError("The answer was cut off; try a smaller file");
        const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
        try {
          return normalizeExtraction(JSON.parse(text));
        } catch {
          throw new ReaderError("Claude returned an unreadable answer; try again");
        }
      } catch (err) {
        throw toReaderError(err);
      }
    },

    async test(cfg: ProviderConfig) {
      try {
        await client(cfg).models.retrieve(cfg.model);
      } catch (err) {
        throw toReaderError(err);
      }
    },
  };
}
