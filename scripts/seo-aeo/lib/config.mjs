import fs from "node:fs";
import path from "node:path";

export function repoRoot() {
  return process.cwd();
}

export function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadConfig(root = repoRoot()) {
  const configPath = process.env.SEO_AEO_CONFIG || "config/seo-aeo.config.json";
  const absolutePath = path.resolve(root, configPath);
  const fallbackPath = path.resolve(root, "config/seo-aeo.config.example.json");
  const config = fs.existsSync(absolutePath) ? readJsonIfExists(absolutePath) : readJsonIfExists(fallbackPath);
  return {
    ...config,
    _path: fs.existsSync(absolutePath) ? absolutePath : fallbackPath,
    _usingExample: !fs.existsSync(absolutePath),
  };
}

export function envOrConfig(envName, configValue, fallback = "") {
  return process.env[envName] || configValue || fallback;
}

export function requireValue(value, message) {
  if (!value || String(value).includes("REPLACE")) {
    throw new Error(message);
  }
  return value;
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmpPath, filePath);
}
