import { handleJitsiRequest, isMeetProxyPath, proxyMeet } from "../../scripts/jitsi-brand.mjs";

interface JitsiEvent {
  req: Request;
  url: URL;
}

export default async function orbitJitsiMiddleware(
  event: JitsiEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const method = (event.req.method ?? "GET").toUpperCase();
  const url = event.url.pathname + event.url.search;
  if (isMeetProxyPath(event.url.pathname)) {
    const body =
      method === "GET" || method === "HEAD" ? undefined : Buffer.from(await event.req.arrayBuffer());
    const result = await proxyMeet(method, url, event.req.headers.get("content-type") ?? undefined, body);
    return new Response(new Uint8Array(result.body), { status: result.status, headers: result.headers });
  }
  const result = await handleJitsiRequest(url, method, event.req.headers.get("accept"));
  if (!result) return next();
  return new Response(new Uint8Array(result.body), { status: result.status, headers: result.headers });
}
