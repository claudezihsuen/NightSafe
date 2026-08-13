import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Copy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { FileUploader } from "@/components/FileUploader";
import { api, ApiError } from "@/lib/api";
import type { OwnerProperty } from "@/types";

export function OwnerCreateTenant() {
  const navigate = useNavigate();

  const [properties, setProperties] = useState<OwnerProperty[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [dueDay, setDueDay] = useState("1");
  const [deposit, setDeposit] = useState("");
  const [firstMonthRentPaid, setFirstMonthRentPaid] = useState(false);
  const [agreement, setAgreement] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ properties: OwnerProperty[] }>("/api/owner/properties")
      .then((data) => setProperties(data.properties))
      .catch(() => setProperties([]))
      .finally(() => setLoadingProperties(false));
  }, []);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const units = selectedProperty?.units ?? [];

  function handlePropertyChange(id: string) {
    setPropertyId(id);
    setUnitId("");
    setMonthlyRent("");
  }

  function handleUnitChange(id: string) {
    setUnitId(id);
    const unit = units.find((u) => u.id === id);
    if (unit) setMonthlyRent((unit.monthly_rent / 100).toString());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !email || !propertyId || !unitId || !leaseStartDate) {
      setError("Fill in all required fields.");
      return;
    }

    const form = new FormData();
    form.set("name", name);
    form.set("email", email);
    form.set("phone", phone);
    form.set("propertyId", propertyId);
    form.set("unitId", unitId);
    form.set("monthlyRent", monthlyRent);
    form.set("leaseStartDate", leaseStartDate);
    form.set("dueDay", dueDay);
    form.set("deposit", deposit || "0");
    form.set("firstMonthRentPaid", firstMonthRentPaid ? "true" : "false");
    if (agreement) form.set("agreement", agreement);

    setSubmitting(true);
    try {
      const data = await api.postForm<{ inviteLink: string }>("/api/owner/tenants", form);
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
        <h1 className="text-lg font-semibold text-ink">Tenant created</h1>
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

      <PageHeader title="Create tenant" description="Set up a tenant, lease, and activation invite." />

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-ink">Tenant</h2>
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

        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-ink">Lease</h2>

          <Select
            label="Property"
            value={propertyId}
            onChange={(e) => handlePropertyChange(e.target.value)}
            disabled={loadingProperties}
            required
          >
            <option value="">{loadingProperties ? "Loading…" : "Select a property"}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>

          <Select
            label="Unit"
            value={unitId}
            onChange={(e) => handleUnitChange(e.target.value)}
            disabled={!propertyId}
            required
          >
            <option value="">{propertyId ? "Select a unit" : "Select a property first"}</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Monthly rent"
              type="number"
              min="0"
              step="0.01"
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(e.target.value)}
              required
            />
            <Input
              label="Due day"
              type="number"
              min="1"
              max="31"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Lease start date"
              type="date"
              value={leaseStartDate}
              onChange={(e) => setLeaseStartDate(e.target.value)}
              required
            />
            <Input
              label="Deposit"
              type="number"
              min="0"
              step="0.01"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={firstMonthRentPaid}
              onChange={(e) => setFirstMonthRentPaid(e.target.checked)}
              className="h-4 w-4 rounded border-border text-sage-600 focus-visible:ring-2 focus-visible:ring-sage-500"
            />
            First month's rent already paid (e.g. with the deposit)
          </label>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink">Agreement (optional)</h2>
          <FileUploader label="Upload lease agreement" hint="PDF or image, up to 10MB" onFileSelect={setAgreement} />
        </Card>

        {error && <p className="text-sm text-status-overdue">{error}</p>}

        <Button type="submit" loading={submitting} className="w-full">
          Create tenant
        </Button>
      </form>
    </div>
  );
}
