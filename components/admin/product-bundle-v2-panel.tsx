"use client";

import { useState } from "react";
import { Check, Eye, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathText } from "@/components/course/math-text";

type BundleRow = {
  id: string;
  bundleId: string;
  checksum: string;
  courseId: string | null;
  status: string;
  validationReport: Record<string, unknown>;
  createdAt: string;
};

type ProductPreview = {
  id: string;
  productType: string;
  version: number;
  title: string;
  traceability: { ideaIds: string[]; sourceIds: string[] };
  sections: { label: string; content: string }[];
};

type Props = { initialImports: BundleRow[] };

export function ProductBundleV2Panel({ initialImports }: Props) {
  const [imports, setImports] = useState(initialImports);
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<{ id: string; previews: ProductPreview[]; blocked: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/bundles/product", { cache: "no-store" });
    if (!response.ok) throw new Error("PRODUCT_BUNDLE_LIST_FAILED");
    const payload = (await response.json()) as { imports: BundleRow[] };
    setImports(payload.imports);
  }

  async function upload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/admin/bundles/product", { method: "POST", body: form });
      const payload = (await response.json()) as { result?: { status: string; bundleId: string }; error?: string; reasonCodes?: string[] };
      if (!response.ok) throw new Error(payload.reasonCodes?.join(", ") || payload.error || "PRODUCT_BUNDLE_UPLOAD_FAILED");
      setMessage(`Bundle ${payload.result?.bundleId ?? ""} ${payload.result?.status === "existing" ? "sudah ada" : "masuk staging"}.`);
      setFile(null);
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "PRODUCT_BUNDLE_UPLOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function inspect(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${id}`, { cache: "no-store" });
      const payload = (await response.json()) as { bundle?: { id: string }; previews?: ProductPreview[]; publicationBlocked?: boolean; error?: string };
      if (!response.ok || !payload.bundle) throw new Error(payload.error || "PRODUCT_BUNDLE_DETAIL_FAILED");
      setSelected({ id: payload.bundle.id, previews: payload.previews ?? [], blocked: payload.publicationBlocked ?? false });
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : "PRODUCT_BUNDLE_DETAIL_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "PRODUCT_BUNDLE_REVIEW_FAILED");
      setMessage(decision === "approved" ? "Bundle disetujui." : "Bundle ditolak.");
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "PRODUCT_BUNDLE_REVIEW_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function publish(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${id}/publish`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "PRODUCT_BUNDLE_PUBLISH_FAILED");
      setMessage("Product Bundle dipublikasikan secara atomik.");
      await refresh();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "PRODUCT_BUNDLE_PUBLISH_FAILED");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3 border-b border-border pb-6">
        <h1 className="font-heading text-h4 font-bold text-foreground">Product Bundle V2</h1>
        <p className="text-body-md text-muted-foreground">Unggah produk akademik bertipe, lihat preview dan traceability, lalu review dan publikasikan secara atomik.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-h6 font-semibold text-foreground">Unggah bundle</h2>
        <form className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center" onSubmit={(event) => { event.preventDefault(); void upload(); }}>
          <Input type="file" accept=".zip,application/zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <Button type="submit" disabled={!file || loading} isLoading={loading}><Upload className="size-4" />Validasi dan staging</Button>
        </form>
        {message && <p className="text-body-sm text-status-success">{message}</p>}
        {error && <p className="text-body-sm text-status-error">{error}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
          <h2 className="font-heading text-h6 font-semibold text-foreground">Import product yang sudah distaging</h2>
          <span className="text-body-sm text-muted-foreground">{imports.length} bundle</span>
        </div>
        <div className="divide-y divide-border">
          {imports.length === 0 && <p className="py-4 text-body-sm text-muted-foreground">Belum ada Product Bundle.</p>}
          {imports.map((item) => (
            <div key={item.id} className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-semibold text-foreground">{item.bundleId}</p>
                <p className="break-all font-mono text-body-sm text-muted-foreground">{item.checksum}</p>
                <p className="text-body-sm text-muted-foreground">Course {item.courseId ?? "tidak tercatat"} ; Status {item.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void inspect(item.id)}><Eye className="size-4" />Preview</Button>
                {item.status === "validated" && <>
                  <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void decide(item.id, "approved")}><Check className="size-4" />Setujui</Button>
                  <Button type="button" size="sm" variant="destructive" disabled={loading} onClick={() => void decide(item.id, "rejected")}><X className="size-4" />Tolak</Button>
                </>}
                {item.status === "approved" && <Button type="button" size="sm" disabled={loading} onClick={() => void publish(item.id)}>Publikasikan</Button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {selected && (
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-heading text-h6 font-semibold text-foreground">Preview dan traceability</h2>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>Tutup</Button>
          </div>
          {selected.blocked && <p className="text-body-sm text-status-warning">Publikasi tertahan karena dependency memerlukan review.</p>}
          <div className="divide-y divide-border">
            {selected.previews.map((preview) => (
              <article key={`${preview.id}:${preview.version}`} className="space-y-2 py-4">
                <p className="font-semibold text-foreground">{preview.title} <span className="font-normal text-muted-foreground">({preview.productType} v{preview.version})</span></p>
                <p className="text-body-sm text-muted-foreground">Ideas: {preview.traceability.ideaIds.join(", ")} ; sumber: {preview.traceability.sourceIds.join(", ")}</p>
                {preview.sections.slice(0, 2).map((section) => <p key={section.label} className="line-clamp-3 text-body-sm text-muted-foreground"><span className="font-medium text-foreground">{section.label}:</span> <MathText as="span">{section.content}</MathText></p>)}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
