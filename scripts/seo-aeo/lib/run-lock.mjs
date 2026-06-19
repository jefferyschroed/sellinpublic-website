import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config.mjs";

function staleMsFromEnv(defaultMs) {
  const minutes = Number(process.env.SEO_AEO_LOCK_STALE_MINUTES || "");
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : defaultMs;
}

function readLock(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function isStale(filePath, staleMs) {
  try {
    const stats = fs.statSync(filePath);
    return Date.now() - stats.mtimeMs > staleMs;
  } catch {
    return false;
  }
}

export function acquireRunLock(root, name, { staleMs = staleMsFromEnv(6 * 60 * 60 * 1000) } = {}) {
  const lockDir = ensureDir(path.join(root, "automation-runs", ".locks"));
  const lockPath = path.join(lockDir, `${name}.lock.json`);

  if (fs.existsSync(lockPath) && isStale(lockPath, staleMs)) {
    fs.rmSync(lockPath, { force: true });
  }

  const payload = {
    name,
    pid: process.pid,
    created_at: new Date().toISOString(),
    cwd: root,
  };

  try {
    const fd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`);
    fs.closeSync(fd);
  } catch (error) {
    if (error.code === "EEXIST") {
      const existing = readLock(lockPath);
      throw new Error(
        `SEO/AEO run lock already exists at ${path.relative(root, lockPath)} from pid ${existing.pid || "unknown"} (${existing.created_at || "unknown time"}). Remove it only if the previous run is no longer active.`
      );
    }
    throw error;
  }

  let released = false;
  return {
    path: lockPath,
    release() {
      if (released) return;
      released = true;
      fs.rmSync(lockPath, { force: true });
    },
  };
}
