import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AuthUser } from "@/types";

type InviteState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; name: string; email: string };

export function ActivateAccountPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [invite, setInvite] = useState<InviteState>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ name: string; email: string }>(`/api/auth/invite/${token}`)
      .then((data) => setInvite({ kind: "ready", ...data }))
      .catch((err) =>
        setInvite({
          kind: "invalid",
          message: err instanceof ApiError ? err.message : "This invitation link is invalid.",
        }),
      );
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post<{ user: AuthUser }>(`/api/auth/activate/${token}`, { password });
      await refresh();
      navigate("/tenant", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-input bg-midnight-700">
            <ShieldCheck className="h-6 w-6 text-sage-200" />
          </div>
          <h1 className="text-lg font-semibold text-ink">Activate your account</h1>
          <p className="text-sm text-ink/60">Your space. Managed with care.</p>
        </div>

        {invite.kind === "loading" && (
          <p className="text-center text-sm text-ink/60">Checking your invitation…</p>
        )}

        {invite.kind === "invalid" && (
          <p className="text-center text-sm text-status-overdue">{invite.message}</p>
        )}

        {invite.kind === "ready" && (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <p className="text-sm text-ink/70">
              Welcome, <span className="font-medium text-ink">{invite.name}</span>. Set a password
              for <span className="font-medium text-ink">{invite.email}</span> to activate your
              account.
            </p>
            <Input
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Input
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error && <p className="text-sm text-status-overdue">{error}</p>}
            <Button type="submit" className="mt-2 w-full" loading={submitting}>
              Activate account
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
