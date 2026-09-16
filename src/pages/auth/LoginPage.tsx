import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth, ApiError } from "@/lib/auth-context";
import { useI18n } from "@/i18n/I18nProvider";
import { ROLE_HOME } from "@/i18n/translations";

const REMEMBERED_EMAIL_KEY = "nightsafe-remembered-email";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, verifyTwoFactor, user, status } = useAuth();
  const { t } = useI18n();
  const rememberedEmail = typeof window !== "undefined" ? window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "" : "";
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedEmail));
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const message = (location.state as { message?: string } | null)?.message;

  useEffect(() => {
    if (status === "authenticated" && user) {
      navigate(ROLE_HOME[user.role], { replace: true });
    }
  }, [status, user, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password, rememberMe);
      if (rememberMe) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim().toLowerCase());
      else window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);

      if ("twoFactorRequired" in result && result.twoFactorRequired) {
        setChallenge(result.challenge);
        setCode("");
      } else if ("user" in result) {
        navigate(ROLE_HOME[result.user.role], { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTwoFactor(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    setLoading(true);
    try {
      const signedInUser = await verifyTwoFactor(challenge, code);
      navigate(ROLE_HOME[signedInUser.role], { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-8">
      <Card className="w-full max-w-sm border-white/70 bg-card/95 shadow-raised">
        <div className="mb-6 flex items-center justify-center gap-3">
          <ShieldCheck className="h-9 w-9 shrink-0 text-midnight-700" strokeWidth={1.8} />
          <div className="text-left">
            <h1 className="text-lg font-semibold leading-tight text-ink">NightSafe</h1>
            <p className="text-xs leading-tight text-ink/50">Properties rest easier</p>
          </div>
        </div>

        {!challenge ? (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            {message && <p className="rounded-input bg-status-confirmed/10 px-3 py-2 text-sm text-status-confirmed">{message}</p>}
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-ink/65">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-sage-600 accent-sage-600"
                />
                Remember me
              </label>
              <Link to="/forgot-password" className="font-medium text-sage-700 hover:text-sage-800">
                Forgot password?
              </Link>
            </div>
            <p className="text-xs leading-relaxed text-ink/45">
              Remember me keeps a secure sign-in cookie on this device. NightSafe does not store your password in browser storage.
            </p>
            {error && <p className="text-sm text-status-overdue">{error}</p>}
            <Button type="submit" className="mt-1 w-full" loading={loading}>
              Sign in
            </Button>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleTwoFactor}>
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sage-100">
                <KeyRound className="h-5 w-5 text-sage-700" />
              </div>
              <h2 className="font-semibold text-ink">{t("login.twoFactorTitle")}</h2>
              <p className="mt-1 text-sm text-ink/60">{t("login.twoFactorDescription")}</p>
            </div>
            <Input
              label={t("common.verificationCode")}
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            {error && <p className="text-sm text-status-overdue">{error}</p>}
            <Button type="submit" className="w-full" loading={loading}>{t("login.verifyAndSignIn")}</Button>
            <Button
              type="button"
              className="w-full"
              variant="ghost"
              onClick={() => { setChallenge(null); setCode(""); setError(null); }}
            >
              {t("login.back")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
