import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, Mail, MessageSquareText, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export type RecoveryMethod = "EMAIL" | "PHONE" | "AUTHENTICATOR";

type Step = "request" | "verify" | "password";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}

const METHODS: Array<{
  value: RecoveryMethod;
  title: string;
  description: string;
  icon: typeof Mail;
}> = [
  {
    value: "EMAIL",
    title: "Email",
    description: "Send a 6-digit code to the verified email on your account.",
    icon: Mail,
  },
  {
    value: "PHONE",
    title: "Phone number",
    description: "Send a 6-digit SMS code to the verified phone on your account.",
    icon: MessageSquareText,
  },
  {
    value: "AUTHENTICATOR",
    title: "Authenticator app",
    description: "Use the current 6-digit code from Google Authenticator or another TOTP app.",
    icon: ShieldCheck,
  },
];

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<RecoveryMethod>("EMAIL");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestReset(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<{ challengeId: string; method: RecoveryMethod }>(
        "/api/auth/password-reset/request",
        { email, method },
      );
      setChallengeId(response.challengeId);
      setCode("");
      setStep("verify");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!challengeId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.post<{ resetToken: string }>("/api/auth/password-reset/verify", {
        challengeId,
        code,
      });
      setResetToken(response.resetToken);
      setStep("password");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function completeReset(event: FormEvent) {
    event.preventDefault();
    if (!resetToken) return;
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/password-reset/complete", { resetToken, newPassword });
      navigate("/login", {
        replace: true,
        state: { message: "Password changed. Sign in with your new password." },
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const selected = METHODS.find((item) => item.value === method)!;
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <Card className="w-full max-w-lg border-white/70 bg-card/95 shadow-raised">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-midnight-700">
            <KeyRound className="h-5 w-5 text-sage-200" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Forgot password</h1>
            <p className="mt-1 text-sm text-ink/60">Verify one of your recovery methods, then choose a new password.</p>
          </div>
        </div>

        {step === "request" && (
          <form className="space-y-4" onSubmit={requestReset}>
            <Input
              label="Account email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium text-ink">Recovery method</legend>
              {METHODS.map(({ value, title, description, icon: Icon }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer gap-3 rounded-card border p-3 transition ${method === value ? "border-sage-400 bg-sage-50" : "border-border bg-white/70 hover:bg-sage-50/40"}`}
                >
                  <input
                    type="radio"
                    name="method"
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                    className="mt-1 accent-sage-600"
                  />
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-sage-700" />
                  <span><span className="block text-sm font-medium text-ink">{title}</span><span className="mt-0.5 block text-xs leading-relaxed text-ink/55">{description}</span></span>
                </label>
              ))}
            </fieldset>
            <p className="text-xs leading-relaxed text-ink/45">For privacy, NightSafe does not confirm whether a recovery method is attached to an email address until a valid verification code is entered.</p>
            {error && <p className="text-sm text-status-overdue">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>Continue</Button>
            <Link to="/login" className="block text-center text-sm font-medium text-sage-700">Back to sign in</Link>
          </form>
        )}

        {step === "verify" && (
          <form className="space-y-4" onSubmit={verifyCode}>
            <div className="rounded-card bg-sage-50 p-4">
              <p className="text-sm font-medium text-ink">{selected.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink/60">
                {method === "AUTHENTICATOR"
                  ? "Open Google Authenticator (or your chosen authenticator app) and enter the current 6-digit NightSafe code."
                  : `If this ${method === "EMAIL" ? "email" : "phone"} recovery method is available on your account, enter the 6-digit code you receive.`}
              </p>
            </div>
            <Input
              label="6-digit verification code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            {error && <p className="text-sm text-status-overdue">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>Verify code</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("request"); setError(null); }}>Choose another method</Button>
          </form>
        )}

        {step === "password" && (
          <form className="space-y-4" onSubmit={completeReset}>
            <div className="rounded-card bg-status-confirmed/10 p-4 text-sm text-status-confirmed">Identity verified. Create your new password.</div>
            <Input label="New password" type="password" minLength={8} autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
            <Input label="Confirm new password" type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
            {error && <p className="text-sm text-status-overdue">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>Reset password</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
