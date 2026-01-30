const MAX_PATH_LEN = 512;
const MAX_SEGMENTS = 64;

function pathError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: "INVALID_PATH" });
}

export function normalizePath(input: string): string {
  if (!input || typeof input !== "string") throw pathError("Invalid path");
  if (!input.startsWith("/")) throw pathError("Path must start with '/'");
  if (input.length > MAX_PATH_LEN) throw pathError("Path too long");

  // Collapse multiple slashes and remove trailing slash (except root)
  let p = input.replace(/\/+/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);

  const segs = p.split("/").slice(1); // drop leading empty
  if (segs.length > MAX_SEGMENTS) throw pathError("Too many path segments");
  for (const s of segs) {
    if (s.length === 0) throw pathError("Empty path segment");
    if (s === "." || s === "..") throw pathError("Invalid path segment");
  }
  return p;
}

export function isReservedPath(path: string): boolean {
  return path === "/sys" || path.startsWith("/sys/");
}
