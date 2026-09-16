const PRODUCTION_API = "https://nightsafe-api.claude-zihsuen.workers.dev";
const STAGING_API = "https://nightsafe-staging.claude-zihsuen.workers.dev";

/**
 * Cloudflare Pages Function catch-all for /api/*.
 *
 * Browser traffic stays same-origin with the Pages site, so the HTTP-only
 * session cookie is first-party. The request (including Cookie and Origin)
 * is then forwarded to the Worker, where the existing auth/CSRF checks still
 * apply. A stable `development.nightsafe.pages.dev` preview uses staging;
 * production and custom production domains use the production API.
 */
export async function onRequest(context) {
  const incomingUrl = new URL(context.request.url);
  const isStagingPreview = incomingUrl.hostname === "development.nightsafe.pages.dev";
  const upstreamOrigin = isStagingPreview ? STAGING_API : PRODUCTION_API;
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, upstreamOrigin);

  const headers = new Headers(context.request.headers);
  headers.delete("host");
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
