"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, HardDriveDownload, Loader2, RefreshCw } from "lucide-react";
import { z } from "zod";
import { AdminErrorState } from "@/components/admin/state-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormattedDate } from "@/components/ui/formatted-date";
import { useTranslations } from "@/lib/i18n/client";
import { ApiError, requestJson } from "@/lib/query/http";
import {
  offlinePolicySchema, offlinePolicySettingsSchema, offlineResourceKindSchema,
  type OfflinePolicyResponse, type OfflinePolicySettings,
} from "@/lib/offline/sync-contract";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
const MIB = 1024 * 1024;
const responseSchema = z.object({
  policy: offlinePolicySchema,
  revision: z.number().int().nonnegative(),
  status: z.object({ cursor: z.string(), lastChangedAt: z.number().nullable() }),
});
const catalogSchema = z.object({
  courses: z.array(z.object({ id: z.string(), title: z.string() })).default([]),
  resources: z.array(z.object({ key: z.string(), id: z.string(), title: z.string(), kind: offlineResourceKindSchema, courseId: z.string().nullable() })).default([]),
});
type Catalog = z.infer<typeof catalogSchema>;
type Scope = "all" | "course" | "resource";

function settingsFrom(value: OfflinePolicyResponse): OfflinePolicySettings {
  return offlinePolicySettingsSchema.parse(Object.fromEntries(
    Object.entries(value.policy).filter(([key]) => key !== "revision" && key !== "updatedAt"),
  ));
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

export function OfflineCacheSettings({ initialData }: { initialData?: OfflinePolicyResponse }) {
  const t = useTranslations("adminOps.offlineCache");
  const [saved, setSaved] = useState(initialData ?? null);
  const [draft, setDraft] = useState<OfflinePolicySettings | null>(() => initialData ? settingsFrom(initialData) : null);
  const [loading, setLoading] = useState(!initialData);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [courseId, setCourseId] = useState("");
  const [resourceKey, setResourceKey] = useState("");
  const [catalog, setCatalog] = useState<Catalog>({ courses: [], resources: [] });
  const [catalogPending, setCatalogPending] = useState(false);
  const [catalogError, setCatalogError] = useState(false);
  const [catalogAttempt, setCatalogAttempt] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const value = await requestJson("/api/admin/offline/policy", responseSchema, { signal });
      if (signal?.aborted) return;
      setSaved(value); setDraft(settingsFrom(value)); setError(null); setConflict(false);
    } catch {
      if (!signal?.aborted) setError(t("loadFailed"));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [t]);

  useEffect(() => {
    if (initialData) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [initialData, load]);

  useEffect(() => {
    if (scope === "all") return;
    const controller = new AbortController();
    setCatalogPending(true); setCatalogError(false);
    const query = courseId ? `?${new URLSearchParams({ courseId })}` : "";
    void requestJson(`/api/admin/offline/catalog${query}`, catalogSchema, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setCatalog(value); })
      .catch(() => { if (!controller.signal.aborted) setCatalogError(true); })
      .finally(() => { if (!controller.signal.aborted) setCatalogPending(false); });
    return () => controller.abort();
  }, [scope, courseId, catalogAttempt]);

  function update<K extends keyof OfflinePolicySettings>(key: K, value: OfflinePolicySettings[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setNotice(null);
  }

  async function save() {
    if (!draft || !saved || saving) return;
    const parsed = offlinePolicySettingsSchema.safeParse(draft);
    if (!parsed.success) { setError(t("invalid")); return; }
    setSaving(true); setError(null); setNotice(null);
    try {
      const value = await requestJson("/api/admin/offline/policy", responseSchema, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: saved.revision, policy: parsed.data }),
      });
      setSaved(value); setDraft(settingsFrom(value)); setNotice(t("saved")); setConflict(false);
    } catch (cause) {
      const changed = cause instanceof ApiError && cause.status === 409;
      setConflict(changed); setError(t(changed ? "conflict" : "saveFailed"));
    } finally { setSaving(false); }
  }

  const selectedResource = catalog.resources.find(item => item.key === resourceKey);
  const canRefresh = scope === "all" || (Boolean(courseId) && (scope === "course" || Boolean(selectedResource)) && !catalogPending && !catalogError);
  async function refresh() {
    if (!canRefresh || refreshing) return;
    setRefreshing(true); setError(null); setNotice(null);
    try {
      const result = await requestJson("/api/admin/offline/revalidate", z.object({ cursor: z.string() }), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, ...(scope !== "all" ? { courseId } : {}), ...(scope === "resource" && selectedResource ? { kind: selectedResource.kind, resourceId: selectedResource.id } : {}) }),
      });
      setSaved(current => current ? { ...current, status: { ...current.status, cursor: result.cursor } } : current);
      setNotice(t("refreshQueued"));
    } catch { setError(t("refreshFailed")); }
    finally { setRefreshing(false); }
  }

  if (loading && !draft) return <div role="status" className="flex items-center gap-2 py-10 text-body-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t("loading")}</div>;
  if (!draft || !saved) return <AdminErrorState message={t("loadFailed")} onRetry={() => void load()} />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(settingsFrom(saved));
  const valid = offlinePolicySettingsSchema.safeParse(draft).success;
  function numberField(key: keyof Pick<OfflinePolicySettings, "metadataMaxAgeMs" | "contentMaxAgeMs" | "retentionMs" | "accessLeaseMs" | "activeCheckIntervalMs" | "maxBytes" | "maxEntries">, divisor: number, min: number, max: number, step = 1) {
    const id = `offline-${key}`;
    return <Field id={id} label={t(key)}><Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={draft![key] / divisor} onChange={event => update(key, Number(event.target.value) * divisor)} /></Field>;
  }

  return <div className="space-y-8" data-offline-cache-settings>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2 text-body-xs text-muted-foreground">
        <HardDriveDownload className="size-4 shrink-0" aria-hidden />
        <span>{t("revision", { revision: saved.revision })}</span>
        {saved.policy.updatedAt > 0 && <FormattedDate date={saved.policy.updatedAt} options={{ dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }} />}
      </div>
      <Button type="button" onClick={() => void save()} disabled={!dirty || !valid || saving || conflict} className="gap-2">
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
        {t(saving ? "saving" : "save")}
      </Button>
    </div>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-body-sm"><p>{error}</p>{conflict && <Button variant="outline" onClick={() => void load()} disabled={loading}>{t("reload")}</Button>}</div>}
    {notice && <p role="status" className="text-body-sm">{notice}</p>}
    {!valid && <p role="alert" className="text-body-sm text-destructive">{t("invalid")}</p>}
    <fieldset disabled={saving || loading} className="min-w-0 space-y-8 disabled:opacity-70">
      <section aria-labelledby="offline-schedule-title" className="space-y-4">
        <div className="space-y-1"><h2 id="offline-schedule-title" className="text-body-base font-bold">{t("scheduleTitle")}</h2><p className="text-body-xs text-muted-foreground">{t("scheduleHelp")}</p></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="offline-frequency" label={t("frequency")}><Select value={draft.schedule.frequency} onValueChange={value => update("schedule", { ...draft.schedule, frequency: value as "daily" | "weekly" })}><SelectTrigger id="offline-frequency"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">{t("daily")}</SelectItem><SelectItem value="weekly">{t("weekly")}</SelectItem></SelectContent></Select></Field>
          {draft.schedule.frequency === "weekly" && <Field id="offline-weekday" label={t("weekday")}><Select value={String(draft.schedule.weekday)} onValueChange={value => update("schedule", { ...draft.schedule, weekday: Number(value) })}><SelectTrigger id="offline-weekday"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 7 }, (_, day) => <SelectItem key={day} value={String(day)}>{t(`days.${day}`)}</SelectItem>)}</SelectContent></Select></Field>}
          <Field id="offline-hour" label={t("hour")}><Select value={String(draft.schedule.hour)} onValueChange={value => update("schedule", { ...draft.schedule, hour: Number(value) })}><SelectTrigger id="offline-hour"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, hour) => <SelectItem key={hour} value={String(hour)}>{String(hour).padStart(2, "0")}:00</SelectItem>)}</SelectContent></Select></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">{numberField("metadataMaxAgeMs", HOUR, 1, 168)}{numberField("contentMaxAgeMs", DAY, 1, 30)}{numberField("activeCheckIntervalMs", 60_000, 0.5, 15, 0.5)}</div>
      </section>
      <section aria-labelledby="offline-storage-title" className="space-y-4 border-t pt-6">
        <h2 id="offline-storage-title" className="text-body-base font-bold">{t("storageTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{numberField("maxBytes", MIB, 8, 1024)}{numberField("maxEntries", 1, 25, 1000)}{numberField("retentionMs", DAY, 1, 90)}{numberField("accessLeaseMs", HOUR, 1, 168)}</div>
        <p className="text-body-xs text-muted-foreground">{t("accessHelp")}</p>
        <div className="divide-y">
          <div className="flex items-center justify-between gap-4 py-3"><Label htmlFor="offline-auto-cache">{t("autoCache")}</Label><Switch id="offline-auto-cache" checked={draft.autoCache} onCheckedChange={value => update("autoCache", value)} /></div>
          <div className="flex items-center justify-between gap-4 py-3"><Label htmlFor="offline-wifi">{t("wifiOnly")}</Label><Switch id="offline-wifi" checked={draft.wifiOnly} onCheckedChange={value => update("wifiOnly", value)} /></div>
        </div>
      </section>
    </fieldset>
    <section aria-labelledby="offline-refresh-title" className="space-y-4 border-t pt-6">
      <div className="space-y-1"><h2 id="offline-refresh-title" className="text-body-base font-bold">{t("refreshTitle")}</h2><p className="text-body-xs text-muted-foreground">{t("refreshHelp")}</p></div>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="offline-scope" label={t("scope")}><Select value={scope} onValueChange={value => { setScope(value as Scope); setResourceKey(""); }}><SelectTrigger id="offline-scope"><SelectValue /></SelectTrigger><SelectContent>{(["all", "course", "resource"] as const).map(value => <SelectItem key={value} value={value}>{t(`scopes.${value}`)}</SelectItem>)}</SelectContent></Select></Field>
        {scope !== "all" && <Field id="offline-course" label={t("course")}><Select value={courseId} onValueChange={value => { setCourseId(value); setResourceKey(""); }} disabled={catalogPending}><SelectTrigger id="offline-course"><SelectValue placeholder={t("chooseCourse")} /></SelectTrigger><SelectContent>{catalog.courses.map(course => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent></Select></Field>}
        {scope === "resource" && <Field id="offline-resource" label={t("resource")}><Select value={resourceKey} onValueChange={setResourceKey} disabled={!courseId || catalogPending}><SelectTrigger id="offline-resource"><SelectValue placeholder={t("chooseResource")} /></SelectTrigger><SelectContent>{catalog.resources.map(resource => <SelectItem key={resource.key} value={resource.key}>{resource.title}</SelectItem>)}</SelectContent></Select></Field>}
        <Button variant="outline" onClick={() => void refresh()} disabled={refreshing || !canRefresh} className="gap-2">{refreshing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}{t(refreshing ? "refreshing" : "refresh")}</Button>
      </div>
      {catalogError && <div role="alert" className="flex flex-wrap items-center gap-3 text-body-sm"><span>{t("catalogFailed")}</span><Button variant="outline" onClick={() => setCatalogAttempt(value => value + 1)}>{t("retry")}</Button></div>}
    </section>
  </div>;
}
