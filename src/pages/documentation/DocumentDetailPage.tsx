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
  submissions?: Array<{ id: string; version_number: number; status: string; completed_at: string | null; reopen_reason: string | null; created_at: string }>;
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

  function interactive(field: DocumentField) {
    if (!detail || manager || detail.document.status === "COMPLETED") return false;
    if (detail.document.tenantCanEdit) return true;
    return detail.document.tenantCanSign && (field.field_type === "SIGNATURE" || field.field_type === "INITIALS");
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
      setSigningField(null);
      await load();
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

  return (
    <>
      <button onClick={() => navigate(`/${prefix}/documentation`)} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-ink"><ArrowLeft className="h-4 w-4" />Documentation</button>
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
                      <FieldOverlay key={field.id} field={field} value={values[field.id]} editable={interactive(field)} onChange={(value) => setValues((current) => ({ ...current, [field.id]: { ...current[field.id], ...value } }))} onSign={() => setSigningField(field)} prefix={prefix} documentId={doc.id} />
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
        <div className="space-y-3 text-sm"><p className="font-medium text-ink">{doc.name}</p><p className="text-ink/60">Completed fields: {detail.fields.length - missingRequired().length} / {detail.fields.length}</p>{missingRequired().length > 0 ? <div className="rounded-input bg-status-waiting/10 p-3"><p className="font-medium">Please complete:</p><ul className="mt-1 list-disc pl-5">{missingRequired().map((label) => <li key={label}>{label}</li>)}</ul></div> : <p className="flex items-center gap-2 text-status-confirmed"><Check className="h-4 w-4" />All required fields are complete.</p>}</div>
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
  return <Card><h2 className="mb-3 font-semibold text-ink">Document controls</h2><form onSubmit={(event) => { event.preventDefault(); void onSave(event.currentTarget); }} className="space-y-3"><Input name="name" label="Name" defaultValue={doc.name} /><Input name="category" label="Category" defaultValue={doc.category ?? ""} /><Textarea name="description" label="Description" defaultValue={doc.description ?? ""} /><Textarea name="internalNotes" label="Internal notes" defaultValue={doc.internalNotes ?? ""} /><Input name="expiryDate" label="Expiry date" type="date" defaultValue={doc.expiryDate ?? ""} /><div className="grid gap-2 sm:grid-cols-2">{[["required","Required",doc.required],["tenantVisible","Tenant can view",doc.tenantVisible],["tenantDownload","Tenant can download",doc.tenantDownload],["tenantUpload","Tenant can upload",doc.tenantUpload],["tenantCanEdit","Tenant can edit",doc.tenantCanEdit],["tenantCanSign","Tenant can sign",doc.tenantCanSign]].map(([name,label,checked]) => <label key={String(name)} className="flex items-center gap-2 rounded-input border border-border px-3 py-2 text-sm"><input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} />{String(label)}</label>)}</div><Button type="submit" size="sm" loading={saving}>Save settings</Button></form><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={onEditFields}>Configure fields</Button>{doc.status === "UNDER_REVIEW" && <><Button size="sm" onClick={() => void onReview("APPROVED")}>Approve</Button><Button size="sm" variant="danger" onClick={() => void onReview("REJECTED")}>Reject</Button></>}{doc.status === "COMPLETED" && <Button size="sm" variant="secondary" onClick={onReopen} icon={<RotateCcw className="h-4 w-4" />}>Reopen for Tenant</Button>}{doc.hasFile && <a href={`${API_URL}/api/${prefix}/documents/${doc.id}/download`}><Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />}>Download</Button></a>}<Button size="sm" variant="ghost" onClick={onArchive} icon={<Archive className="h-4 w-4" />}>Archive</Button><Button size="sm" variant="danger" onClick={onDelete} icon={<Trash2 className="h-4 w-4" />}>Delete</Button></div></Card>;
}

interface BuilderField { id: string; fieldType: DocumentField["field_type"]; label: string; required: boolean; pageNumber: number; x: number; y: number; width: number; height: number }
function FieldBuilder({ open, onClose, doc, initial, prefix, onSaved }: { open: boolean; onClose: () => void; doc: DocumentationItem; initial: DocumentField[]; prefix: string; onSaved: () => Promise<void> }) {
  const [fields, setFields] = useState<BuilderField[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setFields(initial.map((field) => ({ id: field.id, fieldType: field.field_type, label: field.label, required: Boolean(field.required), pageNumber: field.page_number, x: field.x, y: field.y, width: field.width, height: field.height }))); }, [open, initial]);
  function add() { const index = fields.length; setFields((current) => [...current, { id: crypto.randomUUID(), fieldType: "TEXT", label: `Field ${index + 1}`, required: true, pageNumber: 1, x: 0.08, y: Math.min(.82, .08 + (index % 6) * .13), width: .36, height: .08 }]); }
  async function save() { setSaving(true); try { await api.put(`/api/${prefix}/documents/${doc.id}/fields`, { fields }); await onSaved(); onClose(); } finally { setSaving(false); } }
  return <Modal open={open} onClose={onClose} title="Configure Tenant fields" className="max-w-4xl max-h-[92vh] overflow-y-auto"><p className="mb-4 text-sm text-ink/60">Positions use percentages of the document page. Drag each marker in the preview, then adjust size and label below.</p><div className="relative mb-4 aspect-[3/4] max-h-[52vh] overflow-hidden rounded-card border border-border bg-sage-50"><iframe src={`${API_URL}/api/${prefix}/documents/${doc.id}/view#toolbar=0`} title="Field layout preview" className="pointer-events-none h-full w-full bg-white" />{fields.filter((f) => f.pageNumber === 1).map((field, index) => <DraggableMarker key={field.id} field={field} index={index} onChange={(next) => setFields((items) => items.map((item) => item.id === field.id ? { ...item, ...next } : item))} />)}</div><div className="space-y-3">{fields.map((field, index) => <Card key={field.id} className="p-3"><div className="grid gap-2 sm:grid-cols-6"><Select label="Type" value={field.fieldType} onChange={(e) => setFields((items) => items.map((item) => item.id === field.id ? { ...item, fieldType: e.target.value as BuilderField["fieldType"] } : item))}>{["TEXT","DATE","SIGNATURE","CHECKBOX","INITIALS"].map((type) => <option key={type}>{type}</option>)}</Select><Input label="Label" className="sm:col-span-2" value={field.label} onChange={(e) => setFields((items) => items.map((item) => item.id === field.id ? { ...item, label: e.target.value } : item))} /><Input label="Page" type="number" min="1" value={field.pageNumber} onChange={(e) => setFields((items) => items.map((item) => item.id === field.id ? { ...item, pageNumber: Math.max(1, Number(e.target.value)) } : item))} /><Input label="Width %" type="number" min="5" max="100" value={Math.round(field.width * 100)} onChange={(e) => setFields((items) => items.map((item) => item.id === field.id ? { ...item, width: Math.max(.05, Math.min(1 - item.x, Number(e.target.value) / 100)) } : item))} /><Input label="Height %" type="number" min="3" max="50" value={Math.round(field.height * 100)} onChange={(e) => setFields((items) => items.map((item) => item.id === field.id ? { ...item, height: Math.max(.03, Math.min(1 - item.y, Number(e.target.value) / 100)) } : item))} /></div><div className="mt-2 flex justify-between"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={(e) => setFields((items) => items.map((item) => item.id === field.id ? { ...item, required: e.target.checked } : item))} />Required</label><Button size="sm" variant="ghost" onClick={() => setFields((items) => items.filter((_, i) => i !== index))}>Remove</Button></div></Card>)}</div><div className="mt-4 flex flex-wrap justify-between gap-2"><Button variant="secondary" onClick={add} icon={<Plus className="h-4 w-4" />}>Add field</Button><div className="flex gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} loading={saving}>Save fields</Button></div></div></Modal>;
}

function DraggableMarker({ field, index, onChange }: { field: BuilderField; index: number; onChange: (value: Partial<BuilderField>) => void }) {
  function move(event: React.PointerEvent<HTMLButtonElement>) { const parent = event.currentTarget.parentElement; if (!parent) return; const rect = parent.getBoundingClientRect(); const x = Math.max(0, Math.min(1 - field.width, (event.clientX - rect.left) / rect.width - field.width / 2)); const y = Math.max(0, Math.min(1 - field.height, (event.clientY - rect.top) / rect.height - field.height / 2)); onChange({ x, y }); }
  return <button type="button" className="absolute z-10 touch-none rounded border-2 border-sage-600 bg-white/90 px-1 text-[10px] font-semibold text-sage-800 shadow-subtle" style={{ left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.width * 100}%`, height: `${field.height * 100}%` }} onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) move(e); }} onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}>{index + 1}. {field.label}</button>;
}
