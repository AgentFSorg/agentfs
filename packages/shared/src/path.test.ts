import { describe, it, expect } from "vitest";
import { normalizePath } from "./path.js";

describe("normalizePath", () => {
  it("normalizes slashes and trims trailing slash", () => {
    expect(normalizePath("/a//b/")).toBe("/a/b");
  });

  it("rejects invalid segments", () => {
    expect(() => normalizePath("/a/../b")).toThrow();
    expect(() => normalizePath("a/b")).toThrow();
  });
});
