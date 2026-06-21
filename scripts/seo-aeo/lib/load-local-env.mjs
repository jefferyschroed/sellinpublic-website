import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ENV_FILES = [".env", ".env.local", path.join("secrets", "seo-aeo.env")];

function parseValue(rawValue) {
  let value = String(rawValue || "").trim();
  if (!value) return "";

  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
    if (quote === "\"") {
      value = value
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\");
    }
    return value;
  }

  return value.replace(/\s+#.*$/, "").trim();
}

function parseLocalEnv(text) {
  const values = {};
  for (const rawLine of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    values[match[1]] = parseValue(match[2]);
  }
  return values;
}

function gitCommonDir(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function sharedWorktreeRoot(cwd) {
  const commonDir = gitCommonDir(cwd);
  if (!commonDir || path.basename(commonDir) !== ".git") return "";
  return path.dirname(commonDir);
}

function addUnique(items, value) {
  if (value && !items.includes(value)) items.push(value);
}

function candidateEnvFiles(cwd) {
  const dirs = [];
  addUnique(dirs, path.resolve(cwd));
  addUnique(dirs, sharedWorktreeRoot(cwd));

  const files = [];
  for (const dir of dirs) {
    for (const file of REPO_ENV_FILES) addUnique(files, path.join(dir, file));
  }
  addUnique(files, path.join(os.homedir(), ".codex", "env", "sellinpublic-website.env"));
  return files;
}

export function loadLocalEnv({ cwd = process.cwd(), override = false } = {}) {
  const loaded = [];
  for (const envPath of candidateEnvFiles(cwd)) {
    if (!fs.existsSync(envPath)) continue;

    const values = parseLocalEnv(fs.readFileSync(envPath, "utf8"));
    let applied = 0;
    for (const [key, value] of Object.entries(values)) {
      if (!override && process.env[key]) continue;
      process.env[key] = value;
      applied += 1;
    }

    loaded.push({ path: envPath, keys: Object.keys(values).length, applied });
  }
  return loaded;
}
