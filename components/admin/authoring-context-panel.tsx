"use client";

import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ExportRow = {
  id: string;
  packId: string;
  action: string;
  correlationId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export function AuthoringContextPanel({ initialExports }: { initialExports: ExportRow[] }) {
  const [courseId, setCourseId] = useState("tutorial-pka");
  const [snapshotId, setSnapshotId] = useState("snapshot-tutorial-pka");
  const [runId, setRunId] = useState("authoring-context-local");
  const [exports, setExports] = useState(initialExports);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch("/api/admin/authoring-context", { cache: "no-store" });
    if (!response.ok) throw new Error("AUTHORING_CONTEXT_LIST_FAILED");
    const payload = (await response.json()) as { exports: ExportRow[] };
    setExports(payload.exports);
  }

  async function exportPack() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/authoring-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, snapshotId, runId }),
      });
      const payload = (await response.json()) as { result?: { packId: string; artifactChecksum: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "AUTHORING_CONTEXT_EXPORT_FAILED");
      setMessage(`Pack ${payload.result?.packId ?? ""} tersimpan dengan checksum artifact ${payload.result?.artifactChecksum ?? ""}.`);
      await refresh();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "AUTHORING_CONTEXT_EXPORT_FAILED");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative overflow-hidden space-y-8">
      <section className="space-y-3 border-b border-border pb-6">
        <h1 className="font-heading text-h4 font-bold text-foreground">Authoring Context Pack</h1>
        <p className="text-body-md text-muted-foreground">Ekspor Ideas terbit dan sumber yang aman untuk authoring eksternal tanpa holdout, data murid, atau rahasia.</p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-status-success" />
          <h2 className="font-heading text-h6 font-semibold text-foreground">Ekspor terproteksi</h2>
        </div>
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <Input value={courseId} onChange={(event) => setCourseId(event.target.value)} placeholder="Course ID" aria-label="Course ID" />
          <Input value={snapshotId} onChange={(event) => setSnapshotId(event.target.value)} placeholder="Snapshot ID" aria-label="Snapshot ID" />
          <Input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="Run ID" aria-label="Run ID" />
        </div>
        <Button type="button" disabled={!courseId || !snapshotId || !runId || loading} isLoading={loading} onClick={() => void exportPack()}>
          <Download className="size-4" />
          Ekspor dan simpan ke R2 staging
        </Button>
        {message && <p className="text-body-sm text-status-success">{message}</p>}
        {error && <p className="text-body-sm text-status-error">{error}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-h6 font-semibold text-foreground">Riwayat ekspor</h2>
        <div className="divide-y divide-border">
          {exports.length === 0 && <p className="py-4 text-body-sm text-muted-foreground">Belum ada pack.</p>}
          {exports.map((item) => (
            <div key={item.id} className="space-y-1 py-4">
              <p className="font-semibold text-foreground">{item.packId}</p>
              <p className="break-all font-mono text-body-sm text-muted-foreground">{String(item.metadata?.artifactChecksum ?? "checksum tidak tersedia")}</p>
              <p className="text-body-sm text-muted-foreground">{item.createdAt} · {item.action}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
