import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Copy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useOwnerAgents } from "@/lib/owner-agents-context";
import { ApiError } from "@/lib/api";

export function OwnerCreateAgent() {
  const navigate = useNavigate();
  const { createAgent } = useOwnerAgents();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name || !email) {
      setError("Name and email are required.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await createAgent({ name, email, phone: phone || undefined });
      setInviteLink(data.inviteLink);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (inviteLink) {
    return (
      <div className="animate-fade-in-up flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-status-confirmed/10">
          <CheckCircle2 className="h-7 w-7 text-status-confirmed" />
        </div>
        <h1 className="text-lg font-semibold text-ink">Agent created</h1>
        <p className="mt-1.5 max-w-sm text-sm text-ink/60">
          Share this activation link with {name} — they'll use it to set their own password.
        </p>
        <div className="mt-4 flex w-full max-w-sm items-center gap-2 rounded-input border border-border bg-white px-3.5 py-2.5">
          <span className="min-w-0 flex-1 truncate text-sm text-ink/80">{inviteLink}</span>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(inviteLink)}
            aria-label="Copy invite link"
            className="shrink-0 text-ink/40 hover:text-ink"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <Button className="mt-6" onClick={() => navigate("/owner/people")}>
          Back to people
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <Link
        to="/owner/people"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        People
      </Link>

      <PageHeader title="Add agent" description="Invite an agent to help manage your properties." />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Card>

        {error && <p className="text-sm text-status-overdue">{error}</p>}

        <Button type="submit" loading={submitting} className="w-full">
          Create agent
        </Button>
      </form>
    </div>
  );
}
