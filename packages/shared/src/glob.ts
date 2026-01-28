/**
 * MVP glob support:
 *  - * matches any chars within a segment
 *  - ? matches single char within a segment
 *  - ** matches across segments
 *
 * This converts a glob into a SQL LIKE pattern and returns:
 *  - like: string
 *  - escapeChar: '\\'
 *
 * Caller must use: WHERE path LIKE $1 ESCAPE '\\'
 */
export function globToSqlLike(glob: string): { like: string } {
  // Escape SQL LIKE wildcards first
  const ESC = "\\";
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    const next = glob[i + 1];

    if (ch === "*") {
      if (next === "*") {
        // ** -> %
        out += "%";
        i++; // consume second *
      } else {
        // * -> % but within segment; we approximate with % and rely on prefixing patterns
        out += "%";
      }
      continue;
    }
    if (ch === "?") {
      out += "_";
      continue;
    }
    // Escape LIKE special chars
    if (ch === "%" || ch === "_" || ch === ESC) out += ESC;
    out += ch;
  }
  return { like: out };
}
