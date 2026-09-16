import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, Download, Eye, FilePlus2, FileText, Pencil, Upload, ShieldCheck } from "lucide-react";
import { api, ApiError, API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { DocumentScanner } from "@/components/documentation/DocumentScanner";
import { DocumentCanvasEditor } from "@/components/documentation/DocumentCanvasEditor";
import type { DocumentationItem, DocumentationTenancy, DocumentStatus, Role } from "@/types";
import { cn } from "@/lib/utils";

interface DocumentationResponse {
  documents: DocumentationItem[];
  tenancies?: DocumentationTenancy[];
}

function rolePrefix(role: Role | undefined): "owner" | "agent" | "tenant" {
  if (role === "OWNER") return "owner";
  if (role === "AGENT") return "agent";
  return "tenant";
}

const statusClasses: Record<DocumentStatus, string> = {
  REQUIRED: "bg-status-waiting/10 text-status-waiting",
  NOT_UPLOADED: "bg-midnight-100 text-midnight-600",
  UPLOADED: "bg-sage-100 text-sage-800",
  UNDER_REVIEW: "bg-status-waiting/10 text-status-waiting",
  APPROVED: "bg-status-confirmed/10 text-status-confirmed",
  REJECTED: "bg-status-overdue/10 text-status-overdue",
  EXPIRED: "bg-status-overdue/10 text-status-overdue",
  ARCHIVED: "bg-midnight-100 text-midnight-500",
  IN_PROGRESS: "bg-sage-100 text-sage-800",
  COMPLETED: "bg-status-confirmed/10 text-status-confirmed",
  REVISION_REQUIRED: "bg-status-waiting/10 text-status-waiting",
};

function humanStatus(status: DocumentStatus) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function DocumentationPage() {
  const { user } = useAuth();
  const prefix = rolePrefix(user?.role);
  const manager = prefix !== "tenant";
  const navigate = useNavigate();
  const [data, setData] = useState<DocumentationResponse>({ documents: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [scannerDoc, setScannerDoc] = useState<DocumentationItem | null>(null);
  const [editorDoc, setEditorDoc] = useState<DocumentationItem | null>(null);
  const [editorFile, setEditorFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingDeviceDoc, setPendingDeviceDoc] = useState<DocumentationItem | null>(null);

  const load = async () => {
    try {
      setError(null);
      const response = await api.get<DocumentationResponse>(`/api/${prefix}/documentation`);
      setData(response);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load Documentation.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [prefix]);

  const grouped = useMemo(() => {
    const groups = new Map<string, DocumentationItem[]>();
    for (const doc of data.documents) {
      const key = doc.category?.trim() || (doc.tenantUpload ? "My Documents" : "Other");
      groups.set(key, [...(groups.get(key) ?? []), doc]);
    }
    return [...groups.entries()];
  }, [data.documents]);

  async function upload(doc: DocumentationItem, file: File) {
    setUploadingId(doc.id);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      await api.postForm(`/api/${prefix}/documents/${doc.id}/file`, form);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't upload this document.");
    } finally {
      setUploadingId(null);
      setEditorDoc(null);
      setEditorFile(null);
    }
  }

  function selectDevice(doc: DocumentationItem) {
    setPendingDeviceDoc(doc);
    fileInputRef.current?.click();
  }

  function prepareFile(doc: DocumentationItem, file: File) {
    if (file.type.startsWith("image/")) {
      setEditorDoc(doc);
      setEditorFile(file);
    } else {
      void upload(doc, file);
    }
  }

  async function createRequirement(form: HTMLFormElement) {
    const values = new FormData(form);
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg"].filter((type) => values.get(type) === "on");
    setCreating(true);
    setError(null);
    try {
      await api.post(`/api/${prefix}/documentation`, {
        leaseId: values.get("leaseId"),
        name: values.get("name"),
        category: values.get("category"),
        description: values.get("description"),
        internalNotes: values.get("internalNotes"),
        required: values.get("required") === "on",
        tenantUpload: values.get("tenantUpload") === "on",
        tenantVisible: values.get("tenantVisible") === "on",
        tenantDownload: values.get("tenantDownload") === "on",
        tenantCanEdit: values.get("tenantCanEdit") === "on",
        tenantCanSign: values.get("tenantCanSign") === "on",
        expiryDate: values.get("expiryDate"),
        maxFileSizeMb: Number(values.get("maxFileSizeMb") || 10),
        allowedTypes,
      });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the document requirement.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Documentation"
        description={manager ? "Private tenancy documents, requirements, completion and version history." : "Your rental documents and required uploads in one secure place."}
        action={manager ? <Button size="sm" onClick={() => setShowCreate(true)} icon={<FilePlus2 className="h-4 w-4" />}>New document</Button> : undefined}
      />

      {error && <p className="mb-4 rounded-input bg-status-overdue/10 p-3 text-sm text-status-overdue">{error}</p>}

      {!manager && (
        <Card className="mb-5 flex items-start gap-3 bg-sage-50/60">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sage-700" />
          <div>
            <p className="font-medium text-ink">Private by default</p>
            <p className="text-sm text-ink/60">Documents open through your signed-in NightSafe session. Storage links are never public.</p>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-44" /><Skeleton className="h-44" /><Skeleton className="h-44" /></div>
      ) : data.documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents yet" description={manager ? "Create a document or tenant requirement for a tenancy." : "Documents shared with you will appear here."} />
      ) : manager ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              manager
              busy={uploadingId === doc.id}
              onOpen={() => navigate(`/${prefix}/documentation/${doc.id}`)}
              onUpload={() => selectDevice(doc)}
              onScan={() => undefined}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map(([category, documents]) => (
            <section key={category}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-ink/50">{category}</h2>
                <span className="text-xs text-ink/40">{documents.length}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    manager={false}
                    busy={uploadingId === doc.id}
                    onOpen={() => navigate(`/tenant/documentation/${doc.id}`)}
                    onUpload={() => selectDevice(doc)}
                    onScan={() => setScannerDoc(doc)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && pendingDeviceDoc) prepareFile(pendingDeviceDoc, file);
          event.currentTarget.value = "";
          setPendingDeviceDoc(null);
        }}
      />

      <DocumentScanner
        open={Boolean(scannerDoc)}
        onClose={() => setScannerDoc(null)}
        onReady={(file) => {
          const doc = scannerDoc;
          setScannerDoc(null);
          if (doc) prepareFile(doc, file);
        }}
      />

      <DocumentCanvasEditor
        open={Boolean(editorDoc && editorFile)}
        file={editorFile}
        onClose={() => { setEditorDoc(null); setEditorFile(null); }}
        onSave={(file) => { const doc = editorDoc; if (doc) void upload(doc, file); }}
      />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New document requirement" className="max-w-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={(event) => { event.preventDefault(); void createRequirement(event.currentTarget); }} className="space-y-4">
          <Select name="leaseId" label="Tenancy" required defaultValue="">
            <option value="" disabled>Select tenancy</option>
            {(data.tenancies ?? []).filter((t) => t.status === "ACTIVE").map((tenancy) => (
              <option key={tenancy.leaseId} value={tenancy.leaseId}>{tenancy.tenantName} · {tenancy.propertyName} · {tenancy.unitLabel}</option>
            ))}
          </Select>
          <Input name="name" label="Document name" required placeholder="Identity Card — Front" />
          <Input name="category" label="Category" placeholder="Rental, Property, My Documents…" />
          <Textarea name="description" label="Description" placeholder="What this document is for" />
          <Textarea name="internalNotes" label="Internal notes" placeholder="Owner/Agent only — never shown to Tenant" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Check name="required" label="Required" />
            <Check name="tenantUpload" label="Tenant can upload" />
            <Check name="tenantVisible" label="Tenant can view" defaultChecked />
            <Check name="tenantDownload" label="Tenant can download" defaultChecked />
            <Check name="tenantCanEdit" label="Tenant can edit fields" />
            <Check name="tenantCanSign" label="Tenant can sign only" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="expiryDate" label="Expiry date (optional)" type="date" />
            <Input name="maxFileSizeMb" label="Maximum file size (MB)" type="number" min="1" max="10" defaultValue="10" />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Allowed file types</p>
            <div className="flex flex-wrap gap-3">
              <Check name="application/pdf" label="PDF" defaultChecked />
              <Check name="image/png" label="PNG" defaultChecked />
              <Check name="image/jpeg" label="JPG" defaultChecked />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" loading={creating}>Create</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

function Check({ name, label, defaultChecked = false }: { name: string; label: string; defaultChecked?: boolean }) {
  return <label className="flex min-h-10 items-center gap-2 rounded-input border border-border px-3 text-sm text-ink"><input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4" />{label}</label>;
}

function DocumentCard({ doc, manager, busy, onOpen, onUpload, onScan }: {
  doc: DocumentationItem;
  manager: boolean;
  busy: boolean;
  onOpen: () => void;
  onUpload: () => void;
  onScan: () => void;
}) {
  const canTenantUpload = !manager && doc.tenantUpload && doc.status !== "COMPLETED" && doc.status !== "ARCHIVED";
  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", statusClasses[doc.status])}>{humanStatus(doc.status)}</span>
            {doc.required && <span className="rounded-full bg-status-waiting/10 px-2.5 py-1 text-xs font-medium text-status-waiting">Required</span>}
          </div>
          <h3 className="truncate font-semibold text-ink">{doc.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-ink/60">{doc.description || (doc.hasFile ? doc.fileName : "No file uploaded yet.")}</p>
        </div>
        <div className="rounded-card bg-sage-50 p-2 text-sage-700"><FileText className="h-5 w-5" /></div>
      </div>
      {manager && <p className="text-xs text-ink/50">{doc.tenantName} · {doc.propertyName} · {doc.unitLabel}</p>}
      {!manager && doc.expiryDate && <p className="text-xs text-ink/50">Expiry: {doc.expiryDate}</p>}
      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onOpen} icon={<Eye className="h-4 w-4" />}>{doc.hasFile || doc.currentVersion ? "Open" : "Details"}</Button>
        {manager && <Button size="sm" variant="secondary" onClick={onUpload} loading={busy} icon={<Upload className="h-4 w-4" />}>{doc.hasFile ? "Replace file" : "Upload file"}</Button>}
        {canTenantUpload && <Button size="sm" variant="secondary" onClick={onUpload} loading={busy} icon={<Upload className="h-4 w-4" />}>Upload</Button>}
        {canTenantUpload && <Button size="sm" variant="secondary" onClick={onScan} icon={<Camera className="h-4 w-4" />}>Scan</Button>}
        {doc.hasFile && doc.tenantDownload && !manager && (
          <a href={`${API_URL}/api/tenant/documents/${doc.id}/download`}><Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />}>Download</Button></a>
        )}
        {manager && <Button size="sm" variant="ghost" onClick={onOpen} icon={<Pencil className="h-4 w-4" />}>Manage</Button>}
      </div>
    </Card>
  );
}
