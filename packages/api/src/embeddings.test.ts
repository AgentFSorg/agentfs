import { describe, it, expect, vi } from "vitest";
import { embedQuery } from "./embeddings.js";

describe("embeddings", () => {
  it("should not expose upstream error bodies to callers", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream details", { status: 429 }))
    );

    try {
      await expect(embedQuery("hello")).rejects.toMatchObject({
        message: "Embeddings service temporarily unavailable",
        statusCode: 502,
        code: "EMBEDDINGS_API_ERROR"
      });
    } finally {
      errSpy.mockRestore();
      vi.unstubAllGlobals();
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });

  it("should return a generic error when the request fails", async () => {
    const prev = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    try {
      await expect(embedQuery("hello")).rejects.toMatchObject({
        message: "Embeddings service temporarily unavailable",
        statusCode: 502,
        code: "EMBEDDINGS_API_ERROR"
      });
    } finally {
      errSpy.mockRestore();
      vi.unstubAllGlobals();
      if (prev === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = prev;
    }
  });
});
