import https from "node:https";
import { handleJitsiRequest, isMeetProxyPath, MEET_HOST, proxyMeet } from "./jitsi-brand.mjs";

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, result) {
  res.statusCode = result.status;
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  res.end(result.body);
}

async function onRequest(req, res, next) {
  try {
    const method = (req.method || "GET").toUpperCase();
    const url = req.url || "/";
    const pathname = url.split("?", 1)[0] || "/";
    if (isMeetProxyPath(pathname)) {
      const body = method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readBody(req);
      send(res, await proxyMeet(method, url, req.headers["content-type"], body));
      return;
    }
    const result = await handleJitsiRequest(url, method, req.headers.accept);
    if (!result) {
      next();
      return;
    }
    send(res, result);
  } catch (error) {
    next(error);
  }
}

function proxyWebSocket(req, socket) {
  const headers = { ...req.headers, host: MEET_HOST, origin: "https://" + MEET_HOST };
  const upstream = https.request({
    hostname: MEET_HOST,
    port: 443,
    path: req.url,
    method: "GET",
    headers,
  });
  upstream.on("upgrade", (response, upstreamSocket, head) => {
    const lines = ["HTTP/1.1 101 Switching Protocols"];
    for (const [key, value] of Object.entries(response.headers)) {
      if (value == null) continue;
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) lines.push(`${key}: ${item}`);
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head?.length) socket.write(head);
    upstreamSocket.pipe(socket);
    socket.pipe(upstreamSocket);
    upstreamSocket.on("error", () => socket.destroy());
    socket.on("error", () => upstreamSocket.destroy());
  });
  upstream.on("error", () => socket.destroy());
  upstream.end();
}

function attachUpgrade(server) {
  if (!server.httpServer || server.httpServer.__orbitXmpp) return;
  server.httpServer.__orbitXmpp = true;
  server.httpServer.on("upgrade", (req, socket, head) => {
    const pathname = (req.url || "").split("?", 1)[0];
    if (!pathname.startsWith("/xmpp-websocket")) return;
    proxyWebSocket(req, socket, head);
  });
}

export function jitsiBrandPlugin() {
  return {
    name: "orbit-jitsi-brand",
    configureServer(server) {
      server.middlewares.use(onRequest);
      attachUpgrade(server);
    },
    configurePreviewServer(server) {
      return () => {
        server.middlewares.use(onRequest);
        attachUpgrade(server);
      };
    },
  };
}
