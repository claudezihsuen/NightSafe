import type { Env } from "../types";

export async function sendVerificationEmail(
  env: Env,
  to: string,
  code: string,
  purpose: "EMAIL_CHANGE" | "PHONE_CHANGE",
): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;

  const subject = purpose === "EMAIL_CHANGE"
    ? "Verify your NightSafe email change"
    : "Verify your NightSafe phone number change";
  const action = purpose === "EMAIL_CHANGE" ? "email address" : "phone number";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text: `Your NightSafe verification code is ${code}. Use it within 10 minutes to confirm your ${action}. If you did not request this change, you can ignore this email.`,
    }),
  });

  if (!response.ok) {
    console.error("NightSafe verification email delivery failed", response.status);
    return false;
  }
  return true;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}
