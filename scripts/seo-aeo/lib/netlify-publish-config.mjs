import fs from "node:fs";
import path from "node:path";

export const EXPECTED_NETLIFY_BUILD_COMMAND = "node scripts/seo-aeo/build-netlify-publish-dir.mjs";
export const EXPECTED_NETLIFY_PUBLISH_DIR = "outputs/netlify-publish";

function normalizePath(value) {
  return String(value || "").split(path.sep).join("/");
}

function tomlString(source, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']\\s*$`, "m");
  const match = source.match(pattern);
  return match ? match[1].trim() : "";
}

export function netlifyPublishConfigSummary(root = process.cwd()) {
  const configPath = path.join(root, "netlify.toml");
  if (!fs.existsSync(configPath)) {
    return {
      path: "netlify.toml",
      exists: false,
      status: "missing",
      command: "",
      publish: "",
      blocker: "netlify_config_missing",
      detail: "netlify.toml is missing.",
    };
  }

  const source = fs.readFileSync(configPath, "utf8");
  const command = tomlString(source, "command");
  const publish = tomlString(source, "publish");
  const commandOk = command === EXPECTED_NETLIFY_BUILD_COMMAND;
  const publishOk = normalizePath(publish) === EXPECTED_NETLIFY_PUBLISH_DIR;
  const rootPublish = publish === "." || publish === "./";
  const blockers = [];
  if (rootPublish) blockers.push("netlify_publish_repo_root");
  if (!publishOk) blockers.push("netlify_publish_not_clean_output");
  if (!commandOk) blockers.push("netlify_missing_clean_build_command");

  return {
    path: "netlify.toml",
    exists: true,
    status: blockers.length ? "blocked" : "ready",
    command,
    publish,
    blocker: blockers.join(","),
    detail: blockers.length
      ? `Netlify must run \`${EXPECTED_NETLIFY_BUILD_COMMAND}\` and publish \`${EXPECTED_NETLIFY_PUBLISH_DIR}\`, never the repo root.`
      : "Netlify is configured to build and publish the clean static output directory.",
  };
}

export function assertNetlifyPublishConfigReady(root = process.cwd()) {
  const summary = netlifyPublishConfigSummary(root);
  if (summary.status !== "ready") {
    throw new Error(`${summary.detail} Current command=${summary.command || "missing"} publish=${summary.publish || "missing"}.`);
  }
  return summary;
}
