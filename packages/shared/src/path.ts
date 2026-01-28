const MAX_PATH_LEN = 512;
const MAX_SEGMENTS = 64;

export function normalizePath(input: string): string {
  if (!input || typeof input !== "string") throw new Error("Invalid path");
  if (!input.startsWith("/")) throw new Error("Path must start with '/'");
  if (input.length > MAX_PATH_LEN) throw new Error("Path too long");

  // Collapse multiple slashes and remove trailing slash (except root)
  let p = input.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);

  const segs = p.split("/").slice(1); // drop leading empty
  if (segs.length > MAX_SEGMENTS) throw new Error("Too many path segments");
  for (const s of segs) {
    if (s.length === 0) throw new Error("Empty path segment");
    if (s === "." || s === "..") throw new Error("Invalid path segment");
  }
  return p;
}

export function isReservedPath(path: string): boolean {
  return path === "/sys" || path.startsWith("/sys/");
}
