import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

export function sha256File(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return "";
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function artifactSnapshot(root, relativePath) {
  const normalizedPath = normalizePath(relativePath);
  const absolutePath = path.join(root, normalizedPath);
  const exists = fs.existsSync(absolutePath);
  const stat = exists ? fs.statSync(absolutePath) : null;
  const parsed = exists && stat?.isFile() ? readJson(absolutePath, {}) : {};
  return {
    path: normalizedPath,
    exists,
    generated_at: parsed.generated_at || "",
    sha256: exists && stat?.isFile() ? sha256File(absolutePath) : "",
    size: exists && stat?.isFile() ? stat.size : 0,
    mtime_ms: exists ? Math.round(stat.mtimeMs) : 0,
  };
}
