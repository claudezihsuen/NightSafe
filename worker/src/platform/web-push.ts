import type { Env } from "../types";

interface VapidKeyRow {
  public_key: string;
  private_jwk: string;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
}

interface PendingUserRow {
  user_id: string;
}

type PushDelivery = "success" | "gone" | "retry";

function base64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function ensureVapidKeys(env: Env): Promise<VapidKeyRow> {
  const existing = await env.DB.prepare(
    "SELECT public_key, private_jwk FROM push_vapid_keys WHERE id=1",
  ).first<VapidKeyRow>();
  if (existing) return existing;

  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const publicRaw = await crypto.subtle.exportKey("raw", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = base64Url(publicRaw);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO push_vapid_keys (id, public_key, private_jwk)
     VALUES (1, ?, ?)`,
  ).bind(publicKey, JSON.stringify(privateJwk)).run();

  const stored = await env.DB.prepare(
    "SELECT public_key, private_jwk FROM push_vapid_keys WHERE id=1",
  ).first<VapidKeyRow>();
  if (!stored) throw new Error("Unable to initialize Web Push VAPID keys.");
  return stored;
}

async function vapidAuthorization(env: Env, endpoint: string, keys: VapidKeyRow): Promise<string> {
  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);
  const cached = await env.DB.prepare(
    "SELECT token, expires_at FROM push_vapid_tokens WHERE audience=?",
  ).bind(audience).first<{ token: string; expires_at: number }>();

  let token = cached?.token;
  if (!token || Number(cached?.expires_at ?? 0) <= now + 3600) {
    const expiresAt = now + 12 * 60 * 60;
    const header = base64UrlJson({ typ: "JWT", alg: "ES256" });
    const payload = base64UrlJson({
      aud: audience,
      exp: expiresAt,
      sub: "https://nightsafe.pages.dev",
    });
    const unsigned = `${header}.${payload}`;
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(keys.private_jwk) as JsonWebKey,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      new TextEncoder().encode(unsigned),
    );
    token = `${unsigned}.${base64Url(signature)}`;

    await env.DB.prepare(
      `INSERT INTO push_vapid_tokens (audience, token, expires_at, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(audience) DO UPDATE SET
         token=excluded.token,
         expires_at=excluded.expires_at,
         updated_at=datetime('now')`,
    ).bind(audience, token, expiresAt).run();
  }

  return `vapid t=${token}, k=${keys.public_key}`;
}

async function deliverEmptyPush(env: Env, endpoint: string, keys: VapidKeyRow): Promise<PushDelivery> {
  try {
    const authorization = await vapidAuthorization(env, endpoint, keys);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        TTL: "86400",
        Urgency: "high",
        Topic: "nightsafe",
      },
    });
    if (response.ok) return "success";
    if (response.status === 404 || response.status === 410) return "gone";
    return "retry";
  } catch (error) {
    console.error("Web Push delivery failed", error);
    return "retry";
  }
}

export async function getVapidPublicKey(env: Env): Promise<string> {
  return (await ensureVapidKeys(env)).public_key;
}

/**
 * Deliver one coalesced background push per user for newly-created NightSafe
 * notifications. The push intentionally carries no payload, so the service
 * worker can retrieve current in-app data from NightSafe and the server never
 * exposes notification text to a third-party push service.
 */
export async function processPendingWebPush(env: Env): Promise<void> {
  const pending = await env.DB.prepare(
    `SELECT DISTINCT user_id
     FROM notifications
     WHERE push_sent_at IS NULL AND push_attempts < 5
     ORDER BY created_at ASC
     LIMIT 100`,
  ).all<PendingUserRow>();

  if (!pending.results?.length) return;
  const keys = await ensureVapidKeys(env);

  for (const row of pending.results) {
    const subscriptions = await env.DB.prepare(
      "SELECT id, endpoint FROM push_subscriptions WHERE user_id=? ORDER BY updated_at DESC",
    ).bind(row.user_id).all<PushSubscriptionRow>();

    if (!subscriptions.results?.length) {
      await env.DB.prepare(
        "UPDATE notifications SET push_sent_at=datetime('now') WHERE user_id=? AND push_sent_at IS NULL",
      ).bind(row.user_id).run();
      continue;
    }

    let delivered = false;
    let retryNeeded = false;
    for (const subscription of subscriptions.results) {
      const result = await deliverEmptyPush(env, subscription.endpoint, keys);
      if (result === "success") delivered = true;
      if (result === "retry") retryNeeded = true;
      if (result === "gone") {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(subscription.id).run();
      }
    }

    if (delivered || !retryNeeded) {
      await env.DB.prepare(
        "UPDATE notifications SET push_sent_at=datetime('now') WHERE user_id=? AND push_sent_at IS NULL",
      ).bind(row.user_id).run();
    } else {
      await env.DB.prepare(
        `UPDATE notifications
         SET push_attempts=push_attempts+1,
             push_sent_at=CASE WHEN push_attempts+1 >= 5 THEN datetime('now') ELSE NULL END
         WHERE user_id=? AND push_sent_at IS NULL`,
      ).bind(row.user_id).run();
    }
  }
}
