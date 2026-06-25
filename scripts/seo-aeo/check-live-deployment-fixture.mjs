#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const FIXTURE_DATE = "2099-01-16";
const MEASUREMENT_ID = "G-FIXTURE123";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function writeFile(root, relativePath, value) {
  const filePath = path.join(root, relativePath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value);
}

function html(title, withTag = true) {
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    ${withTag ? `<script>window.SIP_TRACKING = window.SIP_TRACKING || {}; window.SIP_TRACKING.ga4MeasurementId = "${MEASUREMENT_ID}";</script>` : ""}
  </head>
  <body>${title}</body>
</html>
`;
}

function writeExpectedLocalSite(root, origin) {
  writeFile(
    root,
    "config/seo-aeo.config.json",
    `${JSON.stringify(
      {
        site: { origin },
        google: { ga4MeasurementId: MEASUREMENT_ID },
      },
      null,
      2
    )}\n`
  );
  writeFile(root, "index.html", html("Home"));
  writeFile(root, "blog/index.html", html("Blog"));
  writeFile(root, "blog/example-post/index.html", html("Example"));
  writeFile(root, "feed.xml", "<rss><channel><title>Feed</title></channel></rss>\n");
  writeFile(root, "robots.txt", `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  writeFile(
    root,
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${origin}/</loc></url>
  <url><loc>${origin}/blog/</loc></url>
  <url><loc>${origin}/blog/example-post/</loc></url>
</urlset>
`
  );
}

function staticServer(root) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://fixture.test");
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    const filePath = path.join(root, relativePath);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { "content-type": "text/plain", connection: "close" });
      response.end("not found");
      return;
    }
    const contentType = filePath.endsWith(".html") ? "text/html" : filePath.endsWith(".xml") ? "application/xml" : "text/plain";
    response.writeHead(200, { "content-type": contentType, connection: "close" });
    response.end(fs.readFileSync(filePath));
  });
  server.keepAliveTimeout = 1;
  server.headersTimeout = 2000;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function runChecker(repoRoot, fixtureRoot, origin) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(repoRoot, "scripts/seo-aeo/check-live-deployment.mjs"), "--date", FIXTURE_DATE, "--origin", origin, "--timeout-ms", "2000"],
      {
        cwd: fixtureRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`check-live-deployment fixture command failed: ${output.trim()}`));
        return;
      }
      try {
        resolve(JSON.parse(fs.readFileSync(path.join(fixtureRoot, "automation-runs", FIXTURE_DATE, "live-deployment-check.json"), "utf8")));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function runCase({ stale }) {
  const repoRoot = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `sellinpublic-live-deploy-${stale ? "blocked" : "ready"}-`));
  const localRoot = ensureDir(path.join(tempRoot, "local"));
  const serveRoot = ensureDir(path.join(tempRoot, "serve"));
  const server = await staticServer(serveRoot);
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  try {
    writeExpectedLocalSite(localRoot, origin);
    if (stale) {
      writeFile(serveRoot, "index.html", html("Stale home", false));
    } else {
      writeExpectedLocalSite(serveRoot, origin);
    }
    const report = await runChecker(repoRoot, localRoot, origin);
    if (stale) {
      assert(report.status === "blocked", `expected blocked stale deployment, got ${report.status}`);
      assert(report.blocked_count >= 2, `expected multiple blocked routes, got ${report.blocked_count}`);
      assert(
        report.routes.some((route) => route.path === "/" && route.status === "blocked_missing_ga4_tag"),
        "stale fixture should flag missing GA4 on homepage."
      );
      assert(
        report.routes.some((route) => route.path === "/blog/" && route.status === "blocked_route_not_live"),
        "stale fixture should flag missing blog route."
      );
    } else {
      if (report.status !== "ready") {
        console.error(
          JSON.stringify(
            {
              fixture: "ready",
              status: report.status,
              routes: report.routes.map((route) => ({
                path: route.path,
                status: route.status,
                http_status: route.http_status,
                ga4_required: route.ga4_required,
                ga4_present: route.ga4_present,
                error: route.error || "",
              })),
            },
            null,
            2
          )
        );
      }
      assert(report.status === "ready", `expected ready deployment, got ${report.status}`);
      assert(Number(report.blocked_count || 0) === 0, `expected no blocked routes, got ${report.blocked_count}`);
    }
  } finally {
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await Promise.race([
      new Promise((resolve) => server.close(resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  await runCase({ stale: false });
  await runCase({ stale: true });
  console.log(JSON.stringify({ ok: true, fixture: "live-deployment-check" }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
