export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: any): any {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;

  if (Array.isArray(value)) return value.map(canonicalize);

  // Objects: sort keys recursively.
  if (t === "object") {
    const out: Record<string, any> = {};
    const keys = Object.keys(value).sort();
    for (const k of keys) out[k] = canonicalize(value[k]);
    return out;
  }

  // Functions/undefined/symbol are not valid JSON; preserve JSON.stringify behavior by stringifying as null.
  return null;
}

