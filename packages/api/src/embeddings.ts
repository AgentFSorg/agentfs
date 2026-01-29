import { getEnv } from "@agentos/shared/src/env.js";

const EMBEDDINGS_TIMEOUT_MS = 15_000;

export async function embedQuery(text: string): Promise<number[]> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw Object.assign(new Error("Search requires OPENAI_API_KEY"), { statusCode: 503, code: "EMBEDDINGS_NOT_CONFIGURED" });
  }

  const model = env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EMBEDDINGS_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: text
      }),
      signal: controller.signal
    });
  } catch (err: any) {
    console.error("Embeddings API request failed", { error: String(err?.message || err) });
    throw Object.assign(
      new Error("Embeddings service temporarily unavailable"),
      { statusCode: 502, code: "EMBEDDINGS_API_ERROR" }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    // Log full error for debugging, but don't expose to client
    console.error(`Embeddings API error: ${res.status}`, { body });
    throw Object.assign(
      new Error("Embeddings service temporarily unavailable"),
      { statusCode: 502, code: "EMBEDDINGS_API_ERROR" }
    );
  }

  const json = await res.json() as { data?: { embedding?: number[] }[] };
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) {
    throw Object.assign(new Error("Invalid embeddings response"), { statusCode: 502, code: "EMBEDDINGS_INVALID_RESPONSE" });
  }

  return vec;
}
