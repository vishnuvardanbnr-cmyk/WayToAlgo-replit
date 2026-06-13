import { createServer, request as makeRequest } from "http";
import net from "net";
import { spawn } from "child_process";

const ARTIFACT_ROUTER = process.env.REPLIT_ARTIFACT_ROUTER;
const ROUTER_PORT = 8000;
const PROXY_PORT = 5000;

if (!ARTIFACT_ROUTER) {
  console.error("REPLIT_ARTIFACT_ROUTER not set — running Express directly on 5000");
  process.exit(0);
}

console.log("Starting Replit artifact router...");
const ar = spawn(ARTIFACT_ROUTER, [], {
  stdio: "inherit",
  env: process.env,
});
ar.on("error", (err) => console.error("Artifact router spawn error:", err));
ar.on("exit", (code) => console.log("Artifact router exited with code", code));

async function waitForPort(port, maxMs = 60000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const s = net.connect({ host: "localhost", port });
      s.on("connect", () => { s.destroy(); resolve(true); });
      s.on("error", () => { resolve(false); });
      s.setTimeout(800, () => { s.destroy(); resolve(false); });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} not ready after ${maxMs}ms`);
}

console.log(`Waiting for artifact router on port ${ROUTER_PORT}...`);
await waitForPort(ROUTER_PORT);
console.log(`Artifact router ready on port ${ROUTER_PORT}`);

const proxy = createServer((req, res) => {
  const options = {
    hostname: "localhost",
    port: ROUTER_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const upstream = makeRequest(options, (upRes) => {
    res.writeHead(upRes.statusCode, upRes.headers);
    upRes.pipe(res, { end: true });
  });
  upstream.on("error", (err) => {
    console.error("Proxy upstream error:", err.message);
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad Gateway");
  });
  req.pipe(upstream, { end: true });
});

proxy.on("upgrade", (req, socket, head) => {
  const upstream = net.connect(ROUTER_PORT, "localhost", () => {
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
});

proxy.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`Proxy listening on port ${PROXY_PORT} → artifact router on port ${ROUTER_PORT}`);
});
