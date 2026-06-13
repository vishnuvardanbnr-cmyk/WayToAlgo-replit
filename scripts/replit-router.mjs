import { createServer, request as makeRequest } from "http";
import net from "net";
import { spawn } from "child_process";
import { readFile, stat } from "fs/promises";
import { join, extname, normalize } from "path";

const ARTIFACT_ROUTER = process.env.REPLIT_ARTIFACT_ROUTER;
const ROUTER_PORT = 8000;
const API_PORT = 8080;
const WEB_PORT = 22041;
const WEBVIEW_PORT = 5000;
const STATIC_ROOT = "artifacts/uranaz/dist/public";

if (!ARTIFACT_ROUTER) {
  console.error("REPLIT_ARTIFACT_ROUTER not set — cannot start artifact router");
  process.exit(1);
}

console.log("Starting Replit artifact router...");
const ar = spawn(ARTIFACT_ROUTER, [], { stdio: "inherit", env: process.env });
ar.on("error", (err) => console.error("Artifact router spawn error:", err));
ar.on("exit", (code) => {
  console.error("Artifact router exited with code", code);
  process.exit(code ?? 1);
});

async function waitForPort(port, maxMs = 60000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const s = net.connect({ host: "localhost", port });
      s.on("connect", () => { s.destroy(); resolve(true); });
      s.on("error", () => resolve(false));
      s.setTimeout(800, () => { s.destroy(); resolve(false); });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} not ready after ${maxMs}ms`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".pdf": "application/pdf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

// Proxy an incoming HTTP request to a local upstream port.
function proxyHttp(req, res, upstreamPort) {
  const upstream = makeRequest(
    { hostname: "localhost", port: upstreamPort, path: req.url, method: req.method, headers: req.headers },
    (upRes) => {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res, { end: true });
    }
  );
  upstream.on("error", (err) => {
    console.error(`Upstream :${upstreamPort} error:`, err.message);
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("Bad Gateway");
  });
  req.pipe(upstream, { end: true });
}

// Proxy a WebSocket upgrade to a local upstream port.
function proxyUpgrade(req, socket, head, upstreamPort) {
  const upstream = net.connect(upstreamPort, "localhost", () => {
    const headers = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [k, v] of Object.entries(req.headers)) {
      headers.push(`${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
    }
    upstream.write(headers.join("\r\n") + "\r\n\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
}

// Serve a static file from STATIC_ROOT, falling back to index.html (SPA).
async function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  } catch {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("Bad Request");
    return;
  }
  let rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(STATIC_ROOT, rel);

  try {
    const s = await stat(filePath);
    if (s.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    filePath = join(STATIC_ROOT, "index.html"); // SPA fallback
  }

  try {
    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch {
    try {
      const body = await readFile(join(STATIC_ROOT, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not Found");
    }
  }
}

// Web server on WEB_PORT — the Helium edge routes public "/" traffic here.
// Serves the built SPA; forwards "/api" to the api-server as a safety net.
function startWebServer() {
  const server = createServer((req, res) => {
    if ((req.url || "").startsWith("/api")) return proxyHttp(req, res, API_PORT);
    serveStatic(req, res).catch((err) => {
      console.error(`Static handler error:`, err.message);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("Internal Server Error");
    });
  });
  server.on("upgrade", (req, socket, head) => {
    if ((req.url || "").startsWith("/api")) return proxyUpgrade(req, socket, head, API_PORT);
    socket.destroy();
  });
  server.on("error", (err) => console.error(`Web server :${WEB_PORT} error:`, err.message));
  server.listen(WEB_PORT, "0.0.0.0", () =>
    console.log(`Web server listening on ${WEB_PORT} (static SPA + /api → ${API_PORT})`)
  );
}

// Webview server on WEBVIEW_PORT (5000) — satisfies the workflow's webview
// requirement and powers the in-workspace preview/screenshot. Forwards to the
// artifact router which already serves both "/" and "/api".
function startWebviewServer() {
  const server = createServer((req, res) => proxyHttp(req, res, ROUTER_PORT));
  server.on("upgrade", (req, socket, head) => proxyUpgrade(req, socket, head, ROUTER_PORT));
  server.on("error", (err) => console.error(`Webview server :${WEBVIEW_PORT} error:`, err.message));
  server.listen(WEBVIEW_PORT, "0.0.0.0", () =>
    console.log(`Webview server listening on ${WEBVIEW_PORT} → artifact router ${ROUTER_PORT}`)
  );
}

console.log(`Waiting for artifact router on port ${ROUTER_PORT}...`);
await waitForPort(ROUTER_PORT);
console.log(`Artifact router ready on port ${ROUTER_PORT}`);

startWebServer();
startWebviewServer();
