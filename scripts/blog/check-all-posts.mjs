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

  return {
    ok: results.every((result) => result.ok),
    results,
  };
}
