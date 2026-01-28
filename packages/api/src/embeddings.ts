import { getEnv } from "@agentfs/shared/src/env.js";

export async function embedQuery(text: string): Promise<number[]> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw Object.assign(new Error("Search requires OPENAI_API_KEY"), { statusCode: 503, code: "EMBEDDINGS_NOT_CONFIGURED" });
  }

  const model = env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: text
    })
  });

  if (!res.ok) {
    const body = await res.text();
    throw Object.assign(new Error(`Embeddings API error: ${res.status}`), { statusCode: 502, code: "EMBEDDINGS_API_ERROR", details: body });
  }

  const json = await res.json() as { data?: { embedding?: number[] }[] };
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) {
    throw Object.assign(new Error("Invalid embeddings response"), { statusCode: 502, code: "EMBEDDINGS_INVALID_RESPONSE" });
  }

  return vec;
}
