import { describe, it, expect } from "vitest";
import { globToSqlLike } from "./glob.js";

describe("globToSqlLike", () => {
  describe("basic patterns", () => {
    it("should convert * to %", () => {
      const result = globToSqlLike("/user/*");
      expect(result.like).toBe("/user/%");
    });

    it("should convert ** to %", () => {
      const result = globToSqlLike("/user/**");
      expect(result.like).toBe("/user/%");
    });

    it("should convert ? to _", () => {
      const result = globToSqlLike("/user/item?");
      expect(result.like).toBe("/user/item_");
    });

    it("should handle multiple wildcards", () => {
      const result = globToSqlLike("/*/config/*");
      expect(result.like).toBe("/%/config/%");
    });
  });

  describe("escaping special chars", () => {
    it("should escape % in input", () => {
      const result = globToSqlLike("/user/100%/data");
      expect(result.like).toBe("/user/100\\%/data");
    });

    it("should escape _ in input", () => {
      const result = globToSqlLike("/user/my_file");
      expect(result.like).toBe("/user/my\\_file");
    });

    it("should escape backslash in input", () => {
      const result = globToSqlLike("/user/path\\name");
      expect(result.like).toBe("/user/path\\\\name");
    });
  });

  describe("complex patterns", () => {
    it("should handle glob at start", () => {
      const result = globToSqlLike("**/config");
      expect(result.like).toBe("%/config");
    });

    it("should handle multiple ? chars", () => {
      const result = globToSqlLike("/log/????-??-??");
      expect(result.like).toBe("/log/____-__-__");
    });

    it("should handle no wildcards", () => {
      const result = globToSqlLike("/exact/path/here");
      expect(result.like).toBe("/exact/path/here");
    });

    it("should handle mixed wildcards and escapes", () => {
      const result = globToSqlLike("/data/100%/**/items");
      expect(result.like).toBe("/data/100\\%/%/items");
    });
  });

  describe("edge cases", () => {
    it("should handle root glob", () => {
      const result = globToSqlLike("/**");
      expect(result.like).toBe("/%");
    });

    it("should handle just *", () => {
      const result = globToSqlLike("*");
      expect(result.like).toBe("%");
    });

    it("should handle consecutive **", () => {
      const result = globToSqlLike("/a/**/b/**/c");
      expect(result.like).toBe("/a/%/b/%/c");
    });
  });
});
