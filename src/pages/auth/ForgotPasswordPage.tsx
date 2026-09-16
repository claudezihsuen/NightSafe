import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export type RecoveryMethod = "AUTHENTICATOR";

type Step = "request" | "verify" | "password";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
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
        { email, method: "AUTHENTICATOR" },
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <Card className="w-full max-w-lg border-white/70 bg-card/95 shadow-raised">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-midnight-700">
            <KeyRound className="h-5 w-5 text-sage-200" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">Forgot password</h1>
            <p className="mt-1 text-sm text-ink/60">Reset your password using the Authenticator App already linked to your NightSafe account.</p>
          </div>
        </div>

        {step === "request" && (
          <form className="space-y-4" onSubmit={requestReset}>
            <div className="rounded-card border border-status-waiting/25 bg-status-waiting/10 p-4">
              <p className="text-sm font-semibold text-ink">Email password reset is not available yet</p>
              <p className="mt-1 text-xs leading-relaxed text-ink/60">
                Until NightSafe has a verified email-sending domain, password recovery is available only with Google Authenticator or another compatible authenticator app.
              </p>
            </div>

            <Input
              label="Account email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <div className="flex gap-3 rounded-card border border-sage-300 bg-sage-50 p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sage-700" />
              <div>
                <p className="text-sm font-semibold text-ink">Authenticator App</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/60">
                  Use the current 6-digit NightSafe code from Google Authenticator or another TOTP app. This option works only if you enabled Authenticator App in Settings before losing access to your password.
                </p>
              </div>
            </div>

            {error && <p className="text-sm text-status-overdue">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>Continue with Authenticator</Button>
            <Link to="/login" className="block text-center text-sm font-medium text-sage-700">Back to sign in</Link>
          </form>
        )}

        {step === "verify" && (
          <form className="space-y-4" onSubmit={verifyCode}>
            <div className="rounded-card bg-sage-50 p-4">
              <p className="text-sm font-medium text-ink">Authenticator App verification</p>
              <p className="mt-1 text-xs leading-relaxed text-ink/60">
                Open Google Authenticator or your chosen authenticator app and enter the current 6-digit NightSafe code.
              </p>
            </div>
            <Input
              label="6-digit authenticator code"
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
            <Button type="button" variant="ghost" className="w-full" onClick={() => { setStep("request"); setError(null); }}>Back</Button>
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
