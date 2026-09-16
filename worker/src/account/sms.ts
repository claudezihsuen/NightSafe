import type { Env } from "../types";

export async function sendRecoverySms(env: Env, to: string, code: string): Promise<boolean> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) return false;

  const body = new URLSearchParams({
    To: to,
    From: env.TWILIO_FROM_NUMBER,
    Body: `Your NightSafe password reset code is ${code}. It expires in 10 minutes.`,
  });

  const auth = btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    console.error("NightSafe recovery SMS delivery failed", response.status);
    return false;
  }
  return true;
}
