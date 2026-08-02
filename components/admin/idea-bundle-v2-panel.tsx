"use client";

import { useState } from "react";
import { Check, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BundleRow = {
  id: string;
  bundleId: string;
  checksum: string;
  courseId: string | null;
  status: string;
  validationReport: Record<string, unknown>;
  createdAt: string;
};

type Props = { initialImports: BundleRow[] };

export function IdeaBundleV2Panel({ initialImports }: Props) {
  const [imports, setImports] = useState(initialImports);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/bundles/idea", { cache: "no-store" });
    if (!response.ok) throw new Error("IDEA_BUNDLE_LIST_FAILED");
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
      const response = await fetch("/api/admin/bundles/idea", { method: "POST", body: form });
      const payload = (await response.json()) as { result?: { status: string; bundleId: string }; error?: string; reasonCodes?: string[] };
      if (!response.ok) throw new Error(payload.reasonCodes?.join(", ") || payload.error || "IDEA_BUNDLE_UPLOAD_FAILED");
      setMessage(`Bundle ${payload.result?.bundleId ?? ""} ${payload.result?.status === "existing" ? "sudah ada" : "masuk staging"}.`);
      setFile(null);
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "IDEA_BUNDLE_UPLOAD_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "IDEA_BUNDLE_REVIEW_FAILED");
      setMessage(decision === "approved" ? "Bundle disetujui." : "Bundle ditolak.");
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "IDEA_BUNDLE_REVIEW_FAILED");
    } finally {
      setLoading(false);
    }
  }

  async function publish(id: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/idea/${id}/publish`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "IDEA_BUNDLE_PUBLISH_FAILED");
      setMessage("Bundle dipublikasikan secara atomik.");
      await refresh();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "IDEA_BUNDLE_PUBLISH_FAILED");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3 border-b border-border pb-6">
        <h1 className="font-heading text-h4 font-bold text-foreground">Idea Bundle V2</h1>
        <p className="text-body-md text-muted-foreground">
          Unggah ZIP yang tervalidasi, tinjau metadata, lalu publikasikan ke domain Idea secara atomik.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-h6 font-semibold text-foreground">Unggah bundle</h2>
        <form
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            void upload();
          }}
        >
          <Input type="file" accept=".zip,application/zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          <Button type="submit" disabled={!file || loading} isLoading={loading}>
            <Upload className="size-4" />
            Validasi dan staging
          </Button>
        </form>
        {message && <p className="text-body-sm text-status-success">{message}</p>}
        {error && <p className="text-body-sm text-status-error">{error}</p>}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
          <h2 className="font-heading text-h6 font-semibold text-foreground">Import yang sudah distaging</h2>
          <span className="text-body-sm text-muted-foreground">{imports.length} bundle</span>
        </div>
        <div className="divide-y divide-border">
          {imports.length === 0 && <p className="py-4 text-body-sm text-muted-foreground">Belum ada Idea Bundle.</p>}
          {imports.map((item) => (
            <div key={item.id} className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="min-w-0 space-y-1">
                <p className="truncate font-semibold text-foreground">{item.bundleId}</p>
                <p className="break-all font-mono text-body-sm text-muted-foreground">{item.checksum}</p>
                <p className="text-body-sm text-muted-foreground">Course {item.courseId ?? "tidak tercatat"} · Status {item.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {item.status === "validated" && (
                  <>
                    <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void decide(item.id, "approved")}>
                      <Check className="size-4" />
                      Setujui
                    </Button>
                    <Button type="button" size="sm" variant="destructive" disabled={loading} onClick={() => void decide(item.id, "rejected")}>
                      <X className="size-4" />
                      Tolak
                    </Button>
                  </>
                )}
                {item.status === "approved" && (
                  <Button type="button" size="sm" disabled={loading} onClick={() => void publish(item.id)}>
                    Publikasikan
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
