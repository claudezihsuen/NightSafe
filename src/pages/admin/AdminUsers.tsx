import { useState } from "react";
import { Copy, Power, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAdmin } from "@/lib/admin-context";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { AdminUser } from "@/lib/admin-context";

const statusLabel: Record<AdminUser["status"], string> = {
  ACTIVE: "Active",
  WAITING_FOR_ACTIVATION: "Waiting for activation",
  INACTIVE: "Disabled",
};

const statusClasses: Record<AdminUser["status"], string> = {
  ACTIVE: "bg-status-confirmed/10 text-status-confirmed",
  WAITING_FOR_ACTIVATION: "bg-status-waiting/10 text-status-waiting",
  INACTIVE: "bg-status-overdue/10 text-status-overdue",
};

export function AdminUsers() {
  const { users, loading, error } = useAdmin();
  const { user: currentUser } = useAuth();

  return (
    <>
      <PageHeader title="Accounts" description="Manage every account in NightSafe." />

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!loading && error && <p className="text-sm text-status-overdue">{error}</p>}

      {!loading && !error && users.length === 0 && (
        <EmptyState icon={ShieldCheck} title="No accounts yet" description="Accounts will appear here once created." />
      )}

      {!loading && !error && users.length > 0 && (
        <div className="flex flex-col gap-3">
          {users.map((u) => (
            <UserRow key={u.id} user={u} isSelf={u.id === currentUser?.id} />
          ))}
        </div>
      )}
    </>
  );
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { resetPassword, setStatus } = useAdmin();
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reset" | "status" | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleReset() {
    setBusy("reset");
    setError(null);
    setCopied(false);
    try {
      const data = await resetPassword(user.id);
      setResetLink(data.resetLink);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create a reset link.");
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleStatus() {
    if (isSelf) return;
    setBusy("status");
    setError(null);
    try {
      await setStatus(user.id, user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update this account.");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    if (!resetLink) return;
    try {
      await navigator.clipboard.writeText(resetLink);
      setCopied(true);
    } catch {
      setError("Couldn't copy the link. Select and copy it manually.");
    }
  }

  const whatsappMessage = resetLink
    ? `NightSafe password reset\n\nSet your password here:\n${resetLink}\n\nThis link expires in 1 hour.`
    : "";

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {user.name}
            {isSelf ? <span className="ml-2 text-xs font-normal text-ink/50">You</span> : null}
          </p>
          <p className="truncate text-sm text-ink/60">
            {user.email} · {user.role}
            {user.phone ? ` · ${user.phone}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${statusClasses[user.status]}`}>
          {statusLabel[user.status]}
        </span>
      </div>

      {error && <p className="mt-2 text-xs text-status-overdue">{error}</p>}

      {resetLink ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-2 rounded-input border border-border bg-white px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-ink/80">{resetLink}</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy reset link"
              className="shrink-0 text-ink/40 hover:text-ink"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          {copied && <p className="text-xs text-status-confirmed">Reset link copied.</p>}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-sage-700 hover:text-sage-800"
          >
            Share via WhatsApp
          </a>
          <Button size="sm" variant="secondary" onClick={() => setResetLink(null)}>
            Done
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {user.status !== "WAITING_FOR_ACTIVATION" && (
            <Button size="sm" variant="secondary" loading={busy === "reset"} onClick={handleReset}>
              Reset password
            </Button>
          )}
          {!isSelf && user.status !== "WAITING_FOR_ACTIVATION" && (
            <Button
              size="sm"
              variant={user.status === "ACTIVE" ? "danger" : "primary"}
              icon={<Power className="h-3.5 w-3.5" />}
              loading={busy === "status"}
              onClick={handleToggleStatus}
            >
              {user.status === "ACTIVE" ? "Disable" : "Enable"}
            </Button>
          )}
          {isSelf && <span className="self-center text-xs text-ink/50">Your own account can't be disabled here.</span>}
        </div>
      )}
    </Card>
  );
}
