import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, Check, Download, FileText, Lock, Plus, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { api, ApiError, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { SignaturePad } from "@/components/documentation/SignaturePad";
import type { DocumentField, DocumentationItem, DocumentValue, Role } from "@/types";
import { cn } from "@/lib/utils";

interface DetailResponse {
  document: DocumentationItem;
  fields: DocumentField[];
  values: DocumentValue[];
  versions?: Array<{ version_number: number; file_name: string | null; source: string; uploaded_at: string }>;
  submissions?: Array<{ id: string; version_number: number; status: string; completed_at: string | null; completed_by?: string | null; reopen_reason: string | null; created_at: string }>;
  submission?: { version_number: number; status: string; completed_at: string | null } | null;
}

type LocalValue = { value?: string; checked?: boolean; signed?: boolean };

function prefixFor(role: Role | undefined): "owner" | "agent" | "tenant" {
  if (role === "OWNER") return "owner";
  if (role === "AGENT") return "agent";
  return "tenant";
}

export function DocumentDetailPage() {
  const { documentId = "" } = useParams();
  const { user } = useAuth();
  const prefix = prefixFor(user?.role);
  const manager = prefix !== "tenant";
  const navigate = useNavigate();
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, LocalValue>>({});
  const [signingField, setSigningField] = useState<DocumentField | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [page, setPage] = useState(1);
  const [editingFields, setEditingFields] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopen, setShowReopen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    try {
      setError(null);
      const response = await api.get<DetailResponse>(`/api/${prefix}/documents/${documentId}`);
      setDetail(response);
      const next: Record<string, LocalValue> = {};
      for (const value of response.values ?? []) {
        next[value.field_id] = { value: value.value_text ?? "", checked: value.value_checked === 1, signed: Boolean(value.signature_key) };
      }
      setValues(next);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load this document.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [documentId, prefix]);

  const maxPage = useMemo(() => Math.max(1, ...(detail?.fields ?? []).map((field) => field.page_number)), [detail?.fields]);
  const pageFields = useMemo(() => (detail?.fields ?? []).filter((field) => field.page_number === page), [detail?.fields, page]);
  const completionAllowed = Boolean(detail && !manager && detail.document.status !== "COMPLETED" && (detail.document.tenantCanEdit || detail.document.tenantCanSign));

  useEffect(() => {
    if (!completionAllowed || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [completionAllowed, dirty]);

  function interactive(field: DocumentField) {
    if (!detail || manager || detail.document.status === "COMPLETED") return false;
    if (detail.document.tenantCanEdit) return true;
    return detail.document.tenantCanSign && (field.field_type === "SIGNATURE" || field.field_type === "INITIALS");
  }

  function leaveDocumentation() {
    if (dirty && !window.confirm("You have unsaved document changes. Leave without saving?")) return;
    navigate(`/${prefix}/documentation`);
  }

  async function saveProgress() {
    if (!detail) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/tenant/documents/${documentId}/progress`, {
        version: detail.document.currentVersion,
        values: detail.fields.map((field) => ({ fieldId: field.id, value: values[field.id]?.value ?? "", checked: values[field.id]?.checked ?? false })),
      });
      setDirty(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your progress.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSignature(file: File) {
    if (!detail || !signingField) return;
    const form = new FormData();
    form.set("fieldId", signingField.id);
    form.set("version", String(detail.document.currentVersion));
    form.set("file", file);
    setSaving(true);
    try {
      await api.postForm(`/api/tenant/documents/${documentId}/signature`, form);
      setValues((current) => ({ ...current, [signingField.id]: { ...current[signingField.id], signed: true } }));
      setDetail((current) => current ? {
        ...current,
        document: {
          ...current.document,
          status: current.document.status === "REVISION_REQUIRED" ? "REVISION_REQUIRED" : "IN_PROGRESS",
        },
      } : current);
      setSigningField(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the signature.");
    } finally {
      setSaving(false);
    }
  }

  function missingRequired(): string[] {
    if (!detail) return [];
    return detail.fields.filter((field) => {
      if (!field.required) return false;
      const value = values[field.id];
      if (field.field_type === "SIGNATURE" || field.field_type === "INITIALS") return !value?.signed;
      if (field.field_type === "CHECKBOX") return !value?.checked;
      return !value?.value?.trim();
    }).map((field) => field.label);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await saveProgress();
      await api.post(`/api/tenant/documents/${documentId}/submit`);
      setDirty(false);
      setShowSubmit(false);
      await load();
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      const details = apiError?.details as { missing?: string[] } | null;
      setError(details?.missing?.length ? `Please complete: ${details.missing.join(", ")}` : apiError?.message ?? "Couldn't submit this document.");
    } finally {
      setSaving(false);
    }
  }

  async function updateMetadata(form: HTMLFormElement) {
    const formData = new FormData(form);
    setSaving(true);
    try {
      await api.patch(`/api/${prefix}/documents/${documentId}/metadata`, {
        name: formData.get("name"), category: formData.get("category"), description: formData.get("description"), internalNotes: formData.get("internalNotes"),
        required: formData.get("required") === "on", tenantVisible: formData.get("tenantVisible") === "on", tenantDownload: formData.get("tenantDownload") === "on",
        tenantUpload: formData.get("tenantUpload") === "on", tenantCanEdit: formData.get("tenantCanEdit") === "on", tenantCanSign: formData.get("tenantCanSign") === "on",
        expiryDate: formData.get("expiryDate"),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update document settings.");
    } finally { setSaving(false); }
  }

  async function setReviewStatus(status: "APPROVED" | "REJECTED") {
    setSaving(true);
    try { await api.patch(`/api/${prefix}/documents/${documentId}/metadata`, { status }); await load(); }
    catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't update review status."); }
    finally { setSaving(false); }
  }

  async function reopen() {
    setSaving(true);
    try {
      await api.post(`/api/${prefix}/documents/${documentId}/reopen`, { reason: reopenReason });
      setShowReopen(false); setReopenReason(""); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Couldn't reopen the document."); }
    finally { setSaving(false); }
  }

  async function archive() {
    if (!window.confirm("Archive this document? It will no longer be available to the Tenant.")) return;
    await api.post(`/api/${prefix}/documents/${documentId}/archive`);
    navigate(`/${prefix}/documentation`);
  }

  async function remove() {
    if (!window.confirm("Permanently delete this document and its private stored files? This cannot be undone.")) return;
    await api.delete(`/api/${prefix}/documents/${documentId}`);
    navigate(`/${prefix}/documentation`);
  }

  if (loading) return <><Skeleton className="mb-4 h-10 w-64" /><Skeleton className="h-[60vh] w-full" /></>;
  if (!detail) return <div><Button variant="ghost" onClick={() => navigate(-1)} icon={<ArrowLeft className="h-4 w-4" />}>Back</Button><p className="mt-4 text-status-overdue">{error || "Document not found."}</p></div>;
  const doc = detail.document;
  const viewerUrl = `${API_URL}/api/${prefix}/documents/${doc.id}/view#page=${page}&toolbar=0`;
  const protectedView = !manager && !doc.tenantDownload;
  const latestCompleted = detail.submissions?.find((submission) => submission.status === "COMPLETED" && submission.completed_at);
  const signedFields = detail.fields.filter((field) => ["SIGNATURE", "INITIALS"].includes(field.field_type) && values[field.id]?.signed);

  return (
    <>
      <button onClick={leaveDocumentation} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"><ArrowLeft className="h-4 w-4" />Documentation</button>
      <PageHeader title={doc.name} description={`${doc.category || "Documentation"} · ${doc.status.replaceAll("_", " ")}`} />
      {error && <p className="mb-4 rounded-input bg-status-overdue/10 p-3 text-sm text-status-overdue">{error}</p>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,.7fr)]">
        <div>
          <Card className={cn("relative overflow-hidden p-0", protectedView && "protected-document")}>
            {!doc.hasFile ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center text-ink/50"><FileText className="mb-3 h-10 w-10" /><p>No source file uploaded yet.</p></div>
            ) : (
              <div className="relative min-h-[520px] bg-midnight-900/5" onContextMenu={protectedView ? (e) => e.preventDefault() : undefined}>
                <iframe key={page} src={viewerUrl} title={doc.name} className="h-[70vh] min-h-[520px] w-full bg-white" />
                {pageFields.length > 0 && (
                  <div className="pointer-events-none absolute inset-0 z-10">
                    {pageFields.map((field) => (
                      <FieldOverlay
                        key={field.id}
                        field={field}
                        value={values[field.id]}
                        editable={interactive(field)}
                        onChange={(value) => {
                          setValues((current) => ({ ...current, [field.id]: { ...current[field.id], ...value } }));
                          setDirty(true);
                        }}
                        onSign={() => setSigningField(field)}
                        prefix={prefix}
                        documentId={doc.id}
                      />
                    ))}
                  </div>
                )}
                {protectedView && <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-full bg-midnight-900/70 px-3 py-1 text-xs text-white">View only · download disabled</div>}
              </div>
            )}
          </Card>
          {maxPage > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous page</Button><span className="text-sm text-ink/60">Page {page} of {maxPage}</span><Button size="sm" variant="secondary" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>Next page</Button></div>
          )}
        </div>

        <div className="space-y-4">
          {!manager && (
            <Card>
              <h2 className="mb-2 font-semibold text-ink">Document status</h2>
              <p className="text-sm text-ink/60">{doc.description || "No additional description."}</p>
              {doc.status === "COMPLETED" && <p className="mt-3 flex items-center gap-2 text-sm font-medium text-status-confirmed"><Lock className="h-4 w-4" />Completed and locked {detail.submission?.completed_at ? `· ${new Date(detail.submission.completed_at).toLocaleString()}` : ""}</p>}
              {completionAllowed && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void saveProgress()} loading={saving} icon={<Save className="h-4 w-4" />}>Save progress</Button>
                  <Button size="sm" onClick={() => setShowSubmit(true)} icon={<Send className="h-4 w-4" />}>Review & submit</Button>
                </div>
              )}
              {doc.hasFile && doc.tenantDownload && <a href={`${API_URL}/api/tenant/documents/${doc.id}/download`}><Button className="mt-3" size="sm" variant="ghost" icon={<Download className="h-4 w-4" />}>Download</Button></a>}
            </Card>
          )}

          {manager && latestCompleted && (
            <Card>
              <div className="flex items-center gap-2 text-status-confirmed"><Check className="h-4 w-4" /><h2 className="font-semibold">COMPLETED</h2></div>
              <dl className="mt-3 grid gap-2 text-sm">
                <div><dt className="text-ink/50">Completed by</dt><dd className="font-medium text-ink">Tenant · {doc.tenantId}</dd></div>
                <div><dt className="text-ink/50">Completed</dt><dd className="font-medium text-ink">{new Date(latestCompleted.completed_at!).toLocaleString()}</dd></div>
                <div><dt className="text-ink/50">Document version</dt><dd className="font-medium text-ink">Version {latestCompleted.version_number}</dd></div>
              </dl>
            </Card>
          )}

          {manager && (
            <ManagerPanel detail={detail} prefix={prefix} saving={saving} onSave={updateMetadata} onEditFields={() => setEditingFields(true)} onReview={setReviewStatus} onReopen={() => setShowReopen(true)} onArchive={() => void archive()} onDelete={() => void remove()} />
          )}

          {manager && (detail.versions?.length ?? 0) > 0 && (
            <Card><h2 className="mb-3 font-semibold text-ink">Version history</h2><div className="space-y-2">{detail.versions?.map((version) => <div key={version.version_number} className="flex justify-between gap-3 text-sm"><span>Version {version.version_number} · {version.source.replaceAll("_", " ")}</span><span className="text-ink/50">{new Date(version.uploaded_at).toLocaleDateString()}</span></div>)}</div></Card>
          )}
        </div>
      </div>

      <SignaturePad open={Boolean(signingField)} title={signingField?.field_type === "INITIALS" ? "Add initials" : "Tenant signature"} onCancel={() => setSigningField(null)} onSave={saveSignature} />
      {manager && <FieldBuilder open={editingFields} onClose={() => setEditingFields(false)} doc={doc} initial={detail.fields} prefix={prefix} onSaved={load} />}

      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title="Review your document before submitting">
        <div className="space-y-3 text-sm">
          <p className="font-medium text-ink">{doc.name}</p>
          <p className="text-ink/60">Completed fields: {detail.fields.length - missingRequired().length} / {detail.fields.length}</p>
          {missingRequired().length > 0 ? (
            <div className="rounded-input bg-status-waiting/10 p-3"><p className="font-medium">Please complete:</p><ul className="mt-1 list-disc pl-5">{missingRequired().map((label) => <li key={label}>{label}</li>)}</ul></div>
          ) : (
            <p className="flex items-center gap-2 text-status-confirmed"><Check className="h-4 w-4" />All required fields are complete.</p>
          )}
          {signedFields.length > 0 && (
            <div>
              <p className="mb-2 font-medium text-ink">Signature preview</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {signedFields.map((field) => (
                  <div key={field.id} className="rounded-input border border-border bg-white p-2">
                    <p className="mb-1 text-xs text-ink/50">{field.label}</p>
                    <img src={`${API_URL}/api/tenant/documents/${doc.id}/signature/${field.id}`} alt={`${field.label} preview`} className="h-20 w-full object-contain" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowSubmit(false)}>Back</Button><Button onClick={() => void submit()} disabled={missingRequired().length > 0} loading={saving}>Final submit</Button></div>
      </Modal>

      <Modal open={showReopen} onClose={() => setShowReopen(false)} title="Reopen for Tenant">
        <Textarea label="Reason (optional)" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="What needs to be corrected?" />
        <p className="mt-3 text-sm text-ink/60">The completed version stays in history. The new version will require fresh signatures.</p>
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setShowReopen(false)}>Cancel</Button><Button onClick={() => void reopen()} loading={saving}>Reopen</Button></div>
      </Modal>
    </>
  );
}

function FieldOverlay({ field, value, editable, onChange, onSign, prefix, documentId }: {
  field: DocumentField; value?: LocalValue; editable: boolean; onChange: (value: LocalValue) => void; onSign: () => void; prefix: string; documentId: string;
}) {
  const style = { left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` };
  const base = "pointer-events-auto absolute min-h-8 overflow-hidden rounded border-2 border-sage-500 bg-white/95 shadow-subtle";
  if (field.field_type === "SIGNATURE" || field.field_type === "INITIALS") {
    return <div style={style} className={base}>{value?.signed ? <img src={`${API_URL}/api/${prefix}/documents/${documentId}/signature/${field.id}`} alt={field.label} className="h-full w-full object-contain" /> : editable ? <button onClick={onSign} className="h-full w-full p-1 text-xs font-semibold text-sage-700">{field.field_type === "INITIALS" ? "Add initials" : "Sign"}</button> : <span className="flex h-full items-center justify-center p-1 text-[10px] text-ink/50">{field.label}</span>}</div>;
  }
  if (field.field_type === "CHECKBOX") {
    return <label style={style} className={cn(base, "flex items-center justify-center")} title={field.label}><input type="checkbox" checked={Boolean(value?.checked)} disabled={!editable} onChange={(e) => onChange({ checked: e.target.checked })} className="h-5 w-5" /></label>;
  }
  return <input style={style} type={field.field_type === "DATE" ? "date" : "text"} aria-label={field.label} placeholder={field.label} value={value?.value ?? ""} disabled={!editable} onChange={(e) => onChange({ value: e.target.value })} className={cn(base, "px-2 text-xs text-ink disabled:bg-white/90")} />;
}

function ManagerPanel({ detail, prefix, saving, onSave, onEditFields, onReview, onReopen, onArchive, onDelete }: {
  detail: DetailResponse; prefix: string; saving: boolean; onSave: (form: HTMLFormElement) => Promise<void>; onEditFields: () => void; onReview: (status: "APPROVED" | "REJECTED") => Promise<void>; onReopen: () => void; onArchive: () => void; onDelete: () => void;
}) {
  const doc = detail.document;
  const canConfigureFields = doc.hasFile && doc.currentVersion > 0 && doc.status !== "COMPLETED" && doc.status !== "ARCHIVED";
  return <Card><h2 className="mb-3 font-semibold text-ink">Document controls</h2><form onSubmit={(event) => { event.preventDefault(); void onSave(event.currentTarget); }} className="space-y-3"><Input name="name" label="Name" defaultValue={doc.name} /><Input name="category" label="Category" defaultValue={doc.category ?? ""} /><Textarea name="description" label="Description" defaultValue={doc.description ?? ""} /><Textarea name="internalNotes" label="Internal notes" defaultValue={doc.internalNotes ?? ""} /><Input name="expiryDate" label="Expiry date" type="date" defaultValue={doc.expiryDate ?? ""} /><div className="grid gap-2 sm:grid-cols-2">{[["required","Required",doc.required],["tenantVisible","Tenant can view",doc.tenantVisible],["tenantDownload","Tenant can download",doc.tenantDownload],["tenantUpload","Tenant can upload",doc.tenantUpload],["tenantCanEdit","Tenant can edit",doc.tenantCanEdit],["tenantCanSign","Tenant can sign",doc.tenantCanSign]].map(([name,label,checked]) => <label key={String(name)} className="flex items-center gap-2 rounded-input border border-border px-3 py-2 text-sm"><input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} />{String(label)}</label>)}</div><Button type="submit" size="sm" loading={saving}>Save settings</Button></form><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={onEditFields} disabled={!canConfigureFields}>Configure fields</Button>{doc.status === "UNDER_REVIEW" && <><Button size="sm" onClick={() => void onReview("APPROVED")}>Approve</Button><Button size="sm" variant="danger" onClick={() => void onReview("REJECTED")}>Reject</Button></>}{doc.status === "COMPLETED" && <Button size="sm" variant="secondary" onClick={onReopen} icon={<RotateCcw className="h-4 w-4" />}>Reopen for Tenant</Button>}{doc.hasFile && <a href={`${API_URL}/api/${prefix}/documents/${doc.id}/download`}><Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />}>Download</Button></a>}<Button size="sm" variant="ghost" onClick={onArchive} icon={<Archive className="h-4 w-4" />}>Archive</Button><Button size="sm" variant="danger" onClick={onDelete} icon={<Trash2 className="h-4 w-4" />}>Delete</Button></div>{!doc.hasFile && <p className="mt-2 text-xs text-ink/50">Upload a source document before configuring fields.</p>}</Card>;
}

interface BuilderField { id: string; fieldType: DocumentField["field_type"]; label: string; required: boolean; pageNumber: number; x: number; y: number; width: number; height: number }

const FIELD_BUILDER_TYPES: Array<{ type: BuilderField["fieldType"]; label: string; defaultLabel: string; width: number; height: number }> = [
  { type: "TEXT", label: "Text", defaultLabel: "Text field", width: .36, height: .08 },
  { type: "DATE", label: "Date", defaultLabel: "Date", width: .28, height: .08 },
  { type: "CHECKBOX", label: "Checkbox", defaultLabel: "Checkbox", width: .12, height: .07 },
  { type: "SIGNATURE", label: "Signature", defaultLabel: "Tenant Signature", width: .38, height: .12 },
  { type: "INITIALS", label: "Initials", defaultLabel: "Tenant Initials", width: .22, height: .10 },
];

function FieldBuilder({ open, onClose, doc, initial, prefix, onSaved }: { open: boolean; onClose: () => void; doc: DocumentationItem; initial: DocumentField[]; prefix: string; onSaved: () => Promise<void> }) {
  const [fields, setFields] = useState<BuilderField[]>([]);
  const [saving, setSaving] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFields(initial.map((field) => ({ id: field.id, fieldType: field.field_type, label: field.label, required: Boolean(field.required), pageNumber: field.page_number, x: field.x, y: field.y, width: field.width, height: field.height })));
      setPreviewPage(1);
      setDirty(false);
      setBuilderError(null);
    }
  }, [open, initial]);

  const maxPreviewPage = Math.max(1, previewPage, ...fields.map((field) => field.pageNumber));

  function updateField(id: string, next: Partial<BuilderField>) {
    setFields((items) => items.map((item) => item.id === id ? { ...item, ...next } : item));
    setDirty(true);
  }

  function add(type: BuilderField["fieldType"]) {
    const preset = FIELD_BUILDER_TYPES.find((item) => item.type === type)!;
    const sameTypeCount = fields.filter((field) => field.fieldType === type).length;
    const label = sameTypeCount ? `${preset.defaultLabel} ${sameTypeCount + 1}` : preset.defaultLabel;
    const index = fields.length;
    setFields((current) => [...current, {
      id: crypto.randomUUID(), fieldType: type, label, required: true, pageNumber: previewPage,
      x: 0.08, y: Math.min(.84, .08 + (index % 6) * .13), width: preset.width, height: preset.height,
    }]);
    setDirty(true);
  }

  function removeField(id: string) {
    setFields((items) => items.filter((item) => item.id !== id));
    setDirty(true);
  }

  function requestClose() {
    if (dirty && !window.confirm("Discard unsaved field layout changes?")) return;
    onClose();
  }

  async function save() {
    setBuilderError(null);
    const badLabel = fields.find((field) => !field.label.trim() || field.label.trim().length > 160);
    if (badLabel) {
      setBuilderError("Every field needs a label between 1 and 160 characters.");
      return;
    }
    const invalid = fields.find((field) => field.pageNumber < 1 || field.pageNumber > 999 || field.x < 0 || field.y < 0 || field.width <= 0 || field.height <= 0 || field.x + field.width > 1.001 || field.y + field.height > 1.001);
    if (invalid) {
      setBuilderError("One or more fields are outside the document page. Move or resize them before saving.");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/${prefix}/documents/${doc.id}/fields`, { fields });
      setDirty(false);
      await onSaved();
      onClose();
    } catch (err) {
      setBuilderError(err instanceof ApiError ? err.message : "Couldn't save the field configuration.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={requestClose} title="Configure Tenant fields" className="max-w-5xl max-h-[92vh] overflow-y-auto">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink/60">Add fields, drag them into position, and resize them directly on the current page. Positions are stored against document version {doc.currentVersion}.</p>
          <p className="mt-1 text-xs text-ink/45">Fields are assigned to the Tenant completion workflow. Once the Tenant starts completing this version, the layout is locked.</p>
        </div>
        <span className="rounded-full bg-sage-50 px-3 py-1 text-xs font-medium text-sage-700">{fields.length} / 100 fields</span>
      </div>

      {builderError && <p className="mb-4 rounded-input bg-status-overdue/10 p-3 text-sm text-status-overdue">{builderError}</p>}

      <div className="mb-4 flex flex-wrap gap-2">
        {FIELD_BUILDER_TYPES.map((preset) => (
          <Button key={preset.type} size="sm" variant="secondary" onClick={() => add(preset.type)} disabled={fields.length >= 100} icon={<Plus className="h-4 w-4" />}>
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="relative mb-3 aspect-[3/4] max-h-[56vh] overflow-hidden rounded-card border border-border bg-sage-50">
        <iframe src={`${API_URL}/api/${prefix}/documents/${doc.id}/view#page=${previewPage}&toolbar=0`} title={`Field layout preview page ${previewPage}`} className="pointer-events-none h-full w-full bg-white" />
        {fields.filter((field) => field.pageNumber === previewPage).map((field, index) => (
          <DraggableMarker key={field.id} field={field} index={index} onChange={(next) => updateField(field.id, next)} />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
        <Button size="sm" variant="secondary" disabled={previewPage <= 1} onClick={() => setPreviewPage((value) => Math.max(1, value - 1))}>Previous page</Button>
        <label className="flex items-center gap-2 text-sm text-ink/60">Page <input aria-label="Preview page" type="number" min={1} max={999} value={previewPage} onChange={(event) => setPreviewPage(Math.max(1, Math.min(999, Number(event.target.value) || 1)))} className="w-16 rounded-input border border-border bg-white px-2 py-1 text-center text-ink" /> of {maxPreviewPage}</label>
        <Button size="sm" variant="secondary" disabled={previewPage >= 999} onClick={() => setPreviewPage((value) => Math.min(999, value + 1))}>Next page</Button>
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <Card key={field.id} className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Field {index + 1} · {field.fieldType}</p>
              <span className="text-xs text-ink/45">Page {field.pageNumber} · Tenant</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-6">
              <Select label="Type" value={field.fieldType} onChange={(e) => updateField(field.id, { fieldType: e.target.value as BuilderField["fieldType"] })}>{FIELD_BUILDER_TYPES.map((preset) => <option key={preset.type} value={preset.type}>{preset.label}</option>)}</Select>
              <Input label="Label" maxLength={160} className="sm:col-span-2" value={field.label} onChange={(e) => updateField(field.id, { label: e.target.value })} />
              <Input label="Page" type="number" min="1" max="999" value={field.pageNumber} onChange={(e) => updateField(field.id, { pageNumber: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })} />
              <Input label="Width %" type="number" min="5" max="100" value={Math.round(field.width * 100)} onChange={(e) => updateField(field.id, { width: Math.max(.05, Math.min(1 - field.x, Number(e.target.value) / 100 || .05)) })} />
              <Input label="Height %" type="number" min="3" max="100" value={Math.round(field.height * 100)} onChange={(e) => updateField(field.id, { height: Math.max(.03, Math.min(1 - field.y, Number(e.target.value) / 100 || .03)) })} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={(e) => updateField(field.id, { required: e.target.checked })} />Required</label>
              <Button size="sm" variant="ghost" onClick={() => removeField(field.id)}>Remove</Button>
            </div>
          </Card>
        ))}
        {fields.length === 0 && <div className="rounded-card border border-dashed border-border p-6 text-center text-sm text-ink/50">No fields configured yet. Add a field type above.</div>}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink/45">{dirty ? "Unsaved field layout changes" : "Field layout is up to date"}</p>
        <div className="flex gap-2"><Button variant="secondary" onClick={requestClose}>Cancel</Button><Button onClick={() => void save()} loading={saving} disabled={!dirty}>Save field configuration</Button></div>
      </div>
    </Modal>
  );
}

function DraggableMarker({ field, index, onChange }: { field: BuilderField; index: number; onChange: (value: Partial<BuilderField>) => void }) {
  function canvasRect(target: HTMLElement): DOMRect | null {
    const marker = target.parentElement;
    const canvas = marker?.parentElement;
    return canvas?.getBoundingClientRect() ?? null;
  }

  function move(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = canvasRect(event.currentTarget);
    if (!rect) return;
    const x = Math.max(0, Math.min(1 - field.width, (event.clientX - rect.left) / rect.width - field.width / 2));
    const y = Math.max(0, Math.min(1 - field.height, (event.clientY - rect.top) / rect.height - field.height / 2));
    onChange({ x, y });
  }

  function resize(event: React.PointerEvent<HTMLButtonElement>) {
    const rect = canvasRect(event.currentTarget);
    if (!rect) return;
    const width = Math.max(.05, Math.min(1 - field.x, (event.clientX - rect.left) / rect.width - field.x));
    const height = Math.max(.03, Math.min(1 - field.y, (event.clientY - rect.top) / rect.height - field.y));
    onChange({ width, height });
  }

  return (
    <div className="absolute z-10 touch-none rounded border-2 border-sage-600 bg-white/90 text-[10px] font-semibold text-sage-800 shadow-subtle" style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%`, minWidth: 28, minHeight: 24 }}>
      <button type="button" aria-label={`Move ${field.label}`} className="h-full w-full cursor-move overflow-hidden px-1 text-left" onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e); }} onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>{index + 1}. {field.label}</button>
      <button type="button" aria-label={`Resize ${field.label}`} className="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize rounded-tl bg-sage-600/90 text-[9px] text-white" onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) resize(e); }} onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>↘</button>
    </div>
  );
}
