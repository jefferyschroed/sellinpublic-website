import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./config.mjs";

export function parseCsvLine(line) {
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
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
  return { headers, rows };
}

export function readCsv(filePath, defaultHeaders = []) {
  if (!fs.existsSync(filePath)) return { headers: defaultHeaders, rows: [] };
  return parseCsv(fs.readFileSync(filePath, "utf8"));
}

export function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(headers, rows) {
  return `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
}

export function writeCsvAtomic(filePath, headers, rows) {
  ensureDir(path.dirname(filePath));
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, toCsv(headers, rows));
  fs.renameSync(tmpPath, filePath);
}

export function upsertRows(filePath, headers, incomingRows, keyFields) {
  const current = readCsv(filePath, headers);
  const mergedHeaders = Array.from(new Set([...current.headers, ...headers, ...incomingRows.flatMap((row) => Object.keys(row))]));
  const rowsByKey = new Map();
  const keyFor = (row) => keyFields.map((field) => row[field] ?? "").join("\u0001");

  for (const row of current.rows) rowsByKey.set(keyFor(row), row);
  for (const row of incomingRows) rowsByKey.set(keyFor(row), { ...rowsByKey.get(keyFor(row)), ...row });

  const rows = Array.from(rowsByKey.values()).sort((a, b) => keyFor(a).localeCompare(keyFor(b)));
  writeCsvAtomic(filePath, mergedHeaders, rows);
  return { path: filePath, rowsWritten: incomingRows.length, totalRows: rows.length };
}
