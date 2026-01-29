import { getEnv } from "@agentos/shared/src/env.js";

const EMBEDDINGS_TIMEOUT_MS = 15_000;

export async function embedText(text: string): Promise<number[]> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
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
    throw new Error("Embeddings service temporarily unavailable");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text();
    // Log details for ops/debugging; avoid storing third-party response bodies in DB.
    console.error(`Embeddings API error: ${res.status}`, { body });
    throw new Error(`Embeddings API error: ${res.status}`);
  }

  const json = await res.json() as any;
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Invalid embeddings response");
  return vec as number[];
}
