import fs from "node:fs";
import path from "node:path";

export const REQUIRED_PACKET_FILES = [
  "brief.yaml",
  "research.md",
  "citations.json",
  "sme-notes.md",
  "outline.md",
  "draft.md",
  "article.blocks.json",
  "claims-ledger.csv",
  "qa-report.md",
  "publish-meta.yaml",
  "distribution-pack.md",
  "performance-log.csv",
  "refresh-notes.md",
  "asset-manifest.json",
];

export function repoRootFrom(start = process.cwd()) {
  return path.resolve(start);
}

export function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "[]") return [];
  if (trimmed === "{}") return {};
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function setValue(parent, key, value) {
  if (Array.isArray(parent)) parent.push(value);
  else parent[key] = value;
}

export function parseYaml(source) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;

    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].value;

    if (line.startsWith("- ")) {
      if (!Array.isArray(parent)) {
        throw new Error(`YAML parse error on line ${index + 1}: list item has no list parent.`);
      }

      const itemSource = line.slice(2).trim();
      if (itemSource.includes(": ")) {
        const [key, ...valueParts] = itemSource.split(":");
        const valueText = valueParts.join(":").trim();
        const item = {};
        item[key.trim()] = valueText ? parseScalar(valueText) : {};
        parent.push(item);
        if (!valueText) stack.push({ indent, value: item[key.trim()] });
      } else {
        parent.push(parseScalar(itemSource));
      }
      continue;
    }

    const match = line.match(/^([^:]+):(.*)$/);
    if (!match) {
      throw new Error(`YAML parse error on line ${index + 1}: expected key/value.`);
    }

    const key = match[1].trim();
    const valueText = match[2].trim();

    if (valueText) {
      setValue(parent, key, parseScalar(valueText));
      continue;
    }

    let nextContainer = {};
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      if (!nextLine.trim() || nextLine.trimStart().startsWith("#")) continue;
      const nextIndent = nextLine.match(/^\s*/)[0].length;
      const nextTrimmed = nextLine.trim();
      if (nextIndent > indent && nextTrimmed.startsWith("- ")) nextContainer = [];
      break;
    }

    setValue(parent, key, nextContainer);
    stack.push({ indent, value: nextContainer });
  }

  return root;
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

export function parseCsv(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

export function loadPacket(packetPath, root = process.cwd()) {
  const absolutePath = path.resolve(root, packetPath);
  const file = (name) => path.join(absolutePath, name);
  const exists = (name) => fs.existsSync(file(name));

  return {
    root: path.resolve(root),
    packetPath: absolutePath,
    packetName: path.basename(absolutePath),
    exists,
    file,
    missingFiles: REQUIRED_PACKET_FILES.filter((name) => !exists(name)),
    brief: exists("brief.yaml") ? parseYaml(readText(file("brief.yaml"))) : {},
    publishMeta: exists("publish-meta.yaml") ? parseYaml(readText(file("publish-meta.yaml"))) : {},
    citations: exists("citations.json") ? readJson(file("citations.json")) : [],
    claims: exists("claims-ledger.csv") ? parseCsv(readText(file("claims-ledger.csv"))) : [],
    articleBlocks: exists("article.blocks.json") ? readJson(file("article.blocks.json")) : null,
    assetManifest: exists("asset-manifest.json") ? readJson(file("asset-manifest.json")) : null,
  };
}

export function listPacketDirs(root = process.cwd()) {
  const packetRoot = path.join(root, "content-packets");
  if (!fs.existsSync(packetRoot)) return [];
  return fs
    .readdirSync(packetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packetRoot, entry.name))
    .sort();
}

export function writeJson(filePath, value) {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function isPathInside(parent, candidate) {
  const relativePath = path.relative(parent, candidate);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

export function assertSafeSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ""))) {
    throw new Error(`Unsafe slug: ${slug}`);
  }
  return slug;
}

export function safeOutputPath(root, ...parts) {
  const outputPath = path.resolve(root, ...parts);
  if (!isPathInside(root, outputPath)) {
    throw new Error(`Output path escapes repository root: ${outputPath}`);
  }
  return outputPath;
}

export function writeTextAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tempPath, value);
  fs.renameSync(tempPath, filePath);
}
