import net from "net";
import http from "http";
import { createServer } from "net";

const PROXY_PORT = 8081;
const TARGET_PORT = 5000;
const TARGET_HOST = "127.0.0.1";

const server = http.createServer((req, res) => {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", (err) => {
    res.writeHead(502);
    res.end("Gateway error: " + err.message);
  });

  req.pipe(proxy, { end: true });
});

server.on("upgrade", (req, socket, head) => {
  const target = net.createConnection(TARGET_PORT, TARGET_HOST, () => {
    target.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
      "\r\n\r\n"
    );
    if (head && head.length) target.write(head);
    target.pipe(socket);
    socket.pipe(target);
  });
  target.on("error", () => socket.destroy());
  socket.on("error", () => target.destroy());
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`Port forwarder: 0.0.0.0:${PROXY_PORT} → localhost:${TARGET_PORT}`);
});
