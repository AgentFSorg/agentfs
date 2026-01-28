import { getEnv } from "@agentfs/shared/src/env.js";

export async function embedText(text: string): Promise<number[]> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
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
    throw new Error(`Embeddings API error: ${res.status} ${body}`);
  }

  const json = await res.json() as any;
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Invalid embeddings response");
  return vec as number[];
}
