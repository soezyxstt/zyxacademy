import { ManagementFailure, type FormDefinition, type FormDetails, type ManagementClient, type ManagementReads, type MediaFile, type MeetingDirectory, type PublicLink } from "../../../../../packages/native-parity/operations/management-contract";

export type ManagementRequest = (path: string, init: RequestInit) => Promise<Response>;

type RawForm = Omit<FormDefinition, "revision" | "description" | "totalResponses"> & { revisedAt?: string; updatedAt?: string; createdAt: string; description: string | null; totalResponses?: number; deletedAt?: string | null };
type RawLink = Omit<PublicLink, "description" | "category" | "icon" | "color"> & { description: string | null; category: string | null; icon: string | null; color: string | null };
export function createManagementHttpClient({ request, userId }: { request: ManagementRequest; userId: string }): ManagementClient {
  if (!userId) throw new ManagementFailure("forbidden");
  async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      response = await request(path, { method: "GET", headers: { Accept: "application/json", "x-native-operations-user-id": userId }, signal });
    } catch {
      throw new ManagementFailure("unavailable");
    }
    if (response.status === 401 || response.status === 403 || response.status === 409) throw new ManagementFailure("forbidden");
    if (response.status === 404) throw new ManagementFailure("not-found");
    if (!response.ok) throw new ManagementFailure("unavailable");
    try { return await response.json() as T; }
    catch { throw new ManagementFailure("unavailable"); }
  }
  const formDefinition = (form: RawForm, responses = form.totalResponses ?? 0): FormDefinition => ({
    id: form.id, slug: form.slug, title: form.title, description: form.description ?? "", category: form.category,
    questions: form.questions, settings: form.settings ?? {}, totalResponses: responses,
    revision: form.updatedAt ?? form.createdAt,
  });
  const read = async <K extends keyof ManagementReads>(view: K, input: ManagementReads[K][0], signal?: AbortSignal): Promise<ManagementReads[K][1]> => {
    const reads: { [T in keyof ManagementReads]: (value: ManagementReads[T][0]) => Promise<ManagementReads[T][1]> } = {
      articles: () => get(`/api/native/operations/management?view=articles`, signal),
      article: id => get(`/api/native/operations/management?view=article&id=${encodeURIComponent(id)}`, signal),
      forms: async () => (await get<{ forms: RawForm[] }>("/api/admin/custom-forms", signal)).forms.map(form => formDefinition(form)),
      form: async id => {
        const result = await get<{ form: RawForm; responses: FormDetails["responses"]; totalSubmissions?: number }>(`/api/admin/custom-forms/${encodeURIComponent(id)}`, signal);
        if (result.form.deletedAt) throw new ManagementFailure("not-found");
        return { form: formDefinition(result.form, result.totalSubmissions ?? result.responses.length), responses: result.responses };
      },
      media: async ({ folder, space }) => {
        const basePath = space === "media" ? "/api/admin/media" : "/api/admin/media/storage";
        const relative = space === "media" ? folder.replace(/^media\/?/, "") : folder;
        const result = await get<{ folders: { path: string }[]; files: MediaFile[] }>(`${basePath}?folder=${encodeURIComponent(relative)}`, signal);
        return { folders: result.folders.map(item => space === "media" ? `media/${item.path}` : item.path), files: result.files };
      },
      meetings: () => get(`/api/native/operations/management?view=meetings`, signal),
      meeting: id => get(`/api/native/operations/management?view=meeting&id=${encodeURIComponent(id)}`, signal),
      meetingDirectory: () => get<MeetingDirectory>("/api/admin/meet/users", signal),
      discussions: () => get(`/api/native/operations/management?view=discussions`, signal),
      discussion: id => get(`/api/native/operations/management?view=discussion&id=${encodeURIComponent(id)}`, signal),
      pricing: () => get(`/api/native/operations/management?view=pricing`, signal),
      links: async () => (await get<{ links: RawLink[] }>("/api/admin/links", signal)).links.map(link => ({ ...link, category: link.category ?? "", description: link.description ?? "", icon: link.icon ?? "🔗", color: link.color ?? "neutral" })),
    };
    return reads[view](input);
  };
  return { read, mutate: async () => { throw new ManagementFailure("unsupported"); } };
}
