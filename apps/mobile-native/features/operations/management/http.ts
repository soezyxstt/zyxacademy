import { ManagementFailure, type FormDefinition, type FormDetails, type ManagementClient, type ManagementReads, type ManagementReceipt, type MediaFile, type MeetingDirectory, type PublicLink } from "../../../../../packages/native-parity/operations/management-contract";

import { readFormSheetReceipt, validFormSheetUrl } from "../../../../../packages/native-parity/operations/form-sheets";
import type { NativeRequestInit, NativeResponse, NativeSessionTransport } from "../../../network/transport";

export type ManagementRequest = (path: string, init: NativeRequestInit) => Promise<Pick<NativeResponse, "status" | "ok" | "json" | "dispose">>;

export function createManagementClient(transport: NativeSessionTransport): ManagementClient {
  return createManagementHttpClient({ request: transport.request, userId: transport.scope.accountId, sessionId: transport.scope.sessionId, assertCurrent: transport.assertCurrent });
}

type RawForm = Omit<FormDefinition, "revision" | "description" | "totalResponses"> & { revisedAt?: string; updatedAt?: string; createdAt: string; description: string | null; totalResponses?: number; deletedAt?: string | null };
type RawLink = Omit<PublicLink, "description" | "category" | "icon" | "color"> & { description: string | null; category: string | null; icon: string | null; color: string | null };
export function createManagementHttpClient({ request, userId, sessionId, assertCurrent }: { request: ManagementRequest; userId: string; sessionId: string; assertCurrent?: () => void }): ManagementClient {
  if (!userId) throw new ManagementFailure("forbidden");
  async function query<T>(path: string, init: NativeRequestInit): Promise<T> {
    let response: Awaited<ReturnType<ManagementRequest>> | undefined;
    try {
      response = await request(path, { ...init, headers: { Accept: "application/json", "x-native-operations-user-id": userId, "x-native-operations-session-id": sessionId, ...init.headers } });
      if (response.status === 401 || response.status === 403) throw new ManagementFailure("forbidden");
      if (response.status === 404) throw new ManagementFailure("not-found");
      if (response.status === 424) throw new ManagementFailure("uncertain");
      if (response.status === 425) throw new ManagementFailure("pending");
      if (response.status === 409) throw new ManagementFailure("conflict");
      if (response.status === 413) throw new ManagementFailure("payload-too-large");
      if (response.status === 400 || response.status === 415) throw new ManagementFailure("invalid");
      if (!response.ok) throw new ManagementFailure("unavailable");
      const data = await response.json();
      assertCurrent?.();
      return data as T;
    } catch (error) {
      if (error instanceof ManagementFailure) throw error;
      throw new ManagementFailure("unavailable");
    } finally {
      response?.dispose();
    }
  }
  const get = <T,>(path: string, signal?: AbortSignal) => query<T>(path, { method: "GET", signal, retry: "transient-read" });
  const nativeRead = <T,>(view: string, parameters: Record<string, string | undefined>, signal?: AbortSignal) => {
    const query = new URLSearchParams({ view });
    for (const [key, value] of Object.entries(parameters)) if (value) query.set(key, value);
    return get<T>(`/api/native/operations/management?${query}`, signal);
  };
  const formDefinition = (form: RawForm, responses = form.totalResponses ?? 0): FormDefinition => ({
    id: form.id, slug: form.slug, title: form.title, description: form.description ?? "", category: form.category,
    questions: form.questions, settings: form.settings ?? {}, totalResponses: responses,
    revision: form.updatedAt ?? form.createdAt, spreadsheetUrl: form.spreadsheetUrl ?? null,
  });
  const read = async <K extends keyof ManagementReads>(view: K, input: ManagementReads[K][0], signal?: AbortSignal): Promise<ManagementReads[K][1]> => {
    const reads: { [T in keyof ManagementReads]: (value: ManagementReads[T][0]) => Promise<ManagementReads[T][1]> } = {
      articles: () => get(`/api/native/operations/management?view=articles`, signal),
      article: id => get(`/api/native/operations/management?view=article&id=${encodeURIComponent(id)}`, signal),
      forms: async () => (await get<{ forms: RawForm[] }>("/api/admin/custom-forms", signal)).forms.map(form => formDefinition(form)),
      form: async id => {
        const result = await get<{ form: RawForm; responses: FormDetails["responses"]; totalSubmissions?: number }>(`/api/admin/custom-forms/${encodeURIComponent(id)}`, signal);
        if (result.form.deletedAt) throw new ManagementFailure("not-found");
        const form = formDefinition(result.form, result.totalSubmissions ?? result.responses.length);
        if (!validFormSheetUrl(form.spreadsheetUrl)) {
          const sheet = await get<{ spreadsheetUrl?: unknown }>(`/api/admin/export-spreadsheet?entityType=form&entityId=${encodeURIComponent(id)}`, signal).catch(() => null);
          form.spreadsheetUrl = validFormSheetUrl(sheet?.spreadsheetUrl);
        }
        return { form, responses: result.responses };
      },
      presets: ({ cursor, settingsOnly }) => nativeRead("form-presets", { cursor, settingsOnly: settingsOnly ? "true" : undefined }, signal),
      preset: id => nativeRead("form-preset", { id }, signal),
      media: async ({ folder, space }) => {
        const basePath = space === "media" ? "/api/admin/media" : "/api/admin/media/storage";
        const relative = space === "media" ? folder.replace(/^media\/?/, "") : folder;
        type Folder = { path: string; children?: Folder[] };
        const result = await get<{ folders: Folder[]; files: MediaFile[]; tree?: Folder[] }>(`${basePath}?folder=${encodeURIComponent(relative)}`, signal);
        const flatten = (tree: Folder[]): string[] => tree.flatMap(item => [`media/${item.path}`, ...flatten(item.children ?? [])]);
        return { folders: result.folders.map(item => space === "media" ? `media/${item.path}` : item.path),
          files: result.files, ...(space === "media" && result.tree ? { destinations: flatten(result.tree) } : {}) };
      },
      meetings: cursor => nativeRead("meetings", { cursor }, signal),
      meeting: id => get(`/api/native/operations/management?view=meeting&id=${encodeURIComponent(id)}`, signal),
      transcript: parameters => nativeRead("transcript", parameters, signal),
      meetingDirectory: () => get<MeetingDirectory>("/api/admin/meet/users", signal),
      discussions: parameters => nativeRead("discussions", parameters, signal),
      discussion: parameters => nativeRead("discussion", parameters, signal),
      discussionReports: parameters => nativeRead("discussion-reports", parameters, signal),
      pricing: () => get(`/api/native/operations/management?view=pricing`, signal),
      links: async () => (await get<{ links: RawLink[] }>("/api/admin/links", signal)).links.map(link => ({ ...link, category: link.category ?? "", description: link.description ?? "", icon: link.icon ?? "🔗", color: link.color ?? "neutral" })),
    };
    return reads[view](input);
  };
  return {
    read,
    async mutate(action, requestKey) {
      const receipt = await query<ManagementReceipt>("/api/native/operations/management", {
        method: "POST", headers: { "Content-Type": "application/json", "x-native-operations-request-key": requestKey }, body: JSON.stringify(action),
      });
      if (action.type !== "form.export") return receipt;
      const formSheet = readFormSheetReceipt(receipt, action.id);
      if (!formSheet) throw new ManagementFailure("uncertain");
      return { id: action.id, formSheet };
    },
  };
}
