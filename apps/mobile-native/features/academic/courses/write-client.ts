import type {
  AdminCourseEditResponse, CourseWriteTarget, PendingCourseWrite,
} from "../../../../../packages/native-parity/academic/courses/edit-contract";
import type { AcademicTransport } from "../client";

type Entry<Draft> = PendingCourseWrite<Draft> & {
  fingerprint: string;
  operation?: Promise<AdminCourseEditResponse>;
};

type Method = "POST" | "PATCH";

const retry = { status: "retry" } as const;
const saved = { status: "saved" } as const;

export function createCourseCommandTarget<Draft extends object>(send: NonNullable<AcademicTransport["command"]>, validate?: (draft: Draft) => boolean) {
  const entries = new Map<string, Entry<Draft>>();

  return function target(resource: string, method: Method): CourseWriteTarget<Draft> {
    const key = JSON.stringify([resource, method]);

    return {
      pending() {
        const entry = entries.get(key);
        return entry ? { requestId: entry.requestId, confirmed: entry.confirmed, draft: { ...entry.draft } } : null;
      },
      async submit(draft, requestId, signal) {
        if (validate && !validate(draft)) return { status: "invalid" };
        const fingerprint = JSON.stringify(draft, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
        const previous = entries.get(key);
        if (previous && (previous.fingerprint !== fingerprint || previous.requestId !== requestId)) return retry;
        if (previous?.operation) return previous.operation;

        const entry = previous ?? { requestId, fingerprint, draft: { ...draft }, confirmed: false };
        entries.set(key, entry);
        const clear = () => {
          if (entries.get(key) === entry) entries.delete(key);
        };
        const operation = (async (): Promise<AdminCourseEditResponse> => {
          try {
            const response = await send(`/api/native/academic/admin/courses${resource ? `/${resource}` : ""}`, {
              method, body: entry.draft, requestId: entry.requestId,
            }, signal);
            if (response.status === 200) {
              const result = await response.json();
              if (result && typeof result === "object" && "status" in result && "requestId" in result &&
                result.status === "saved" && result.requestId === entry.requestId) {
                entry.confirmed = true;
                return saved;
              }
              return retry;
            }
            if (response.status === 401 || response.status === 403) {
              if (!previous) clear();
              return { status: "denied" };
            }
            if ([400, 404, 409, 422].includes(response.status)) {
              clear();
              if (response.status === 404) return { status: "missing" };
              if (response.status === 409) {
                const result = await response.json().catch(() => null);
                const code = result && typeof result === "object" && "error" in result ? result.error : null;
                if (code === "COURSE_ALREADY_EXISTS") return { status: "exists" };
                if (code === "DEPENDENCIES_EXIST") return { status: "dependencies" };
                return { status: "conflict" };
              }
              return { status: "invalid" };
            }
            return retry;
          } catch {
            return retry;
          }
        })();
        entry.operation = operation;
        try {
          return await operation;
        } finally {
          entry.operation = undefined;
        }
      },
      acknowledge(requestId) {
        const entry = entries.get(key);
        if (entry?.requestId === requestId && entry.confirmed) entries.delete(key);
      },
    };
  };
}
