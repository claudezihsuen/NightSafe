const PRODUCTION_API = "https://nightsafe-api.claude-zihsuen.workers.dev";
const STAGING_API = "https://nightsafe-staging.claude-zihsuen.workers.dev";
const PRODUCTION_WORKER_ORIGIN = "https://nightsafe.pages.dev";
const STAGING_WORKER_ORIGIN = "https://development.nightsafe.pages.dev";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cloudflare Pages Function catch-all for /api/*.
 *
 * Browser traffic stays same-origin with the Pages site, so the HTTP-only
 * session cookie is first-party. Unsafe browser requests are checked against
 * the exact Pages origin here before they are forwarded. The proxy then uses
 * the canonical frontend origin expected by the Worker, preserving the
 * Worker's existing Origin/CSRF checks while allowing a future custom Pages
 * domain without third-party cookies.
 */
export async function onRequest(context) {
  const incomingUrl = new URL(context.request.url);
  const isStagingPreview = incomingUrl.hostname === "development.nightsafe.pages.dev";
  const upstreamOrigin = isStagingPreview ? STAGING_API : PRODUCTION_API;
  const canonicalFrontendOrigin = isStagingPreview ? STAGING_WORKER_ORIGIN : PRODUCTION_WORKER_ORIGIN;
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, upstreamOrigin);

  if (!SAFE_METHODS.has(context.request.method)) {
    const requestOrigin = context.request.headers.get("Origin");
    const currentOrigin = incomingUrl.origin;
    if (!requestOrigin || requestOrigin !== currentOrigin) {
      return new Response(JSON.stringify({ error: "Not authorized." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const headers = new Headers(context.request.headers);
  headers.delete("host");
  headers.set("Origin", canonicalFrontendOrigin);
  headers.set("X-NightSafe-Proxy", isStagingPreview ? "staging-pages" : "production-pages");

  const init = {
    method: context.request.method,
    headers,
    redirect: "manual",
  };

  if (context.request.method !== "GET" && context.request.method !== "HEAD") {
    init.body = context.request.body;
  }

  const upstreamResponse = await fetch(upstreamUrl, init);
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: upstreamResponse.headers,
  });
}
