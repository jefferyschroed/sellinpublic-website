import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function findPostFiles(root = process.cwd()) {
  const blogRoot = path.join(root, "blog");
  if (!fs.existsSync(blogRoot)) return [];
  return fs
    .readdirSync(blogRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join("blog", entry.name, "index.html"))
    .filter((filePath) => fs.existsSync(path.join(root, filePath)))
    .sort();
}

function findBlogHtmlFiles(root = process.cwd()) {
  const blogRoot = path.join(root, "blog");
  if (!fs.existsSync(blogRoot)) return [];
  const files = ["blog/index.html"];
  for (const postFile of findPostFiles(root)) files.push(postFile);
  return files.filter((filePath) => fs.existsSync(path.join(root, filePath)));
}

function decodeEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function getAttr(attrs, name) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeEntities(match?.[2] ?? match?.[3] ?? match?.[4] ?? "");
}

function hasAttr(attrs, name) {
  return new RegExp(`(?:^|\\s)${name}\\s*=`, "i").test(attrs);
}

function checkBlogImageAlts(root = process.cwd()) {
  const offenders = [];
  for (const filePath of findBlogHtmlFiles(root)) {
    const html = fs.readFileSync(path.join(root, filePath), "utf8");
    const images = Array.from(html.matchAll(/<img\b([^>]*)>/gi));
    images.forEach((match, index) => {
      const attrs = match[1];
      const src = getAttr(attrs, "src");
      if (!hasAttr(attrs, "alt") || !getAttr(attrs, "alt").trim()) {
        offenders.push(`${filePath} image ${index + 1}${src ? ` (${src})` : ""}`);
      }
    });
  }

  return {
    ok: offenders.length === 0,
    stdout: offenders.length ? "" : "All rendered blog images have non-empty alt text.\n",
    stderr: offenders.length ? `Rendered blog images missing non-empty alt text:\n${offenders.map((item) => `- ${item}`).join("\n")}\n` : "",
  };
}

export function checkAllPosts(root = process.cwd()) {
  const postFiles = findPostFiles(root);
  const results = [];

  for (const postFile of postFiles) {
    const result = spawnSync(process.execPath, ["scripts/check-blog-post.mjs", postFile], {
      cwd: root,
      encoding: "utf8",
    });
    results.push({
      postFile,
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      ok: result.status === 0,
    });
  }

  const imageAltScan = checkBlogImageAlts(root);
  results.push({
    postFile: "blog image alt scan",
    status: imageAltScan.ok ? 0 : 1,
    stdout: imageAltScan.stdout,
    stderr: imageAltScan.stderr,
    ok: imageAltScan.ok,
  });

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}
