import { useState } from "react";
import type { FormEvent } from "react";
import { Copy, Power, ShieldCheck, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAdmin } from "@/lib/admin-context";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import type { AdminUser } from "@/lib/admin-context";
import type { Role } from "@/types";

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
      <PageHeader
        title="Accounts"
        description={
          currentUser?.role === "SUPER_ADMIN"
            ? "Manage every account in NightSafe and invite additional administrators."
            : "Manage every account in NightSafe."
        }
      />

      {currentUser?.role === "SUPER_ADMIN" && <CreateAdminCard />}

      {loading && (
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!loading && error && <p className="mt-4 text-sm text-status-overdue">{error}</p>}

      {!loading && !error && users.length === 0 && (
        <div className="mt-4">
          <EmptyState icon={ShieldCheck} title="No accounts yet" description="Accounts will appear here once created." />
        </div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === currentUser?.id}
              viewerRole={currentUser?.role ?? "ADMIN"}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CreateAdminCard() {
  const { createAdmin } = useAdmin();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [activationLink, setActivationLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const data = await createAdmin({
        name: name.trim(),
        email: email.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      setActivationLink(data.activationLink);
      setName("");
      setEmail("");
      setPhone("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the admin account.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!activationLink) return;
    try {
      await navigator.clipboard.writeText(activationLink);
      setCopied(true);
    } catch {
      setError("Couldn't copy the link. Select and copy it manually.");
    }
  }

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink">Primary administrator</p>
          <p className="text-sm text-ink/60">Only this account can invite additional NightSafe admins.</p>
        </div>
        {!open && !activationLink && (
          <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Add Admin Account
          </Button>
        )}
      </div>

      {open && !activationLink && (
        <form className="mt-4 flex flex-col gap-3 border-t border-border pt-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Admin name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input
              label="Admin email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Input label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {error && <p className="text-sm text-status-overdue">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy}>
              Create Admin Invite
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {activationLink && (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-sm font-medium text-ink">Admin account created</p>
          <p className="text-xs text-ink/60">Send this one-time activation link to the new admin. It expires in 7 days.</p>
          <div className="flex items-center gap-2 rounded-input border border-border bg-white px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-ink/80">{activationLink}</span>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy activation link"
              className="shrink-0 text-ink/40 hover:text-ink"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          {copied && <p className="text-xs text-status-confirmed">Activation link copied.</p>}
          {error && <p className="text-xs text-status-overdue">{error}</p>}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setActivationLink(null);
              setOpen(false);
              setError(null);
              setCopied(false);
            }}
          >
            Done
          </Button>
        </div>
      )}
    </Card>
  );
}

function UserRow({ user, isSelf, viewerRole }: { user: AdminUser; isSelf: boolean; viewerRole: Role }) {
  const { resetPassword, setStatus } = useAdmin();
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"reset" | "status" | null>(null);
  const [copied, setCopied] = useState(false);

  const isPrimaryAdmin = user.role === "SUPER_ADMIN";
  const canManage = !isPrimaryAdmin || viewerRole === "SUPER_ADMIN";

  async function handleReset() {
    if (!canManage) return;
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
    if (isSelf || isPrimaryAdmin) return;
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

  const roleLabel = isPrimaryAdmin ? "PRIMARY ADMIN" : user.role;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">
            {user.name}
            {isSelf ? <span className="ml-2 text-xs font-normal text-ink/50">You</span> : null}
          </p>
          <p className="truncate text-sm text-ink/60">
            {user.email} · {roleLabel}
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
          {canManage && user.status !== "WAITING_FOR_ACTIVATION" && (
            <Button size="sm" variant="secondary" loading={busy === "reset"} onClick={handleReset}>
              Reset password
            </Button>
          )}
          {!isSelf && !isPrimaryAdmin && user.status !== "WAITING_FOR_ACTIVATION" && (
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
          {!canManage && <span className="self-center text-xs text-ink/50">Primary admin account is protected.</span>}
        </div>
      )}
    </Card>
  );
}
