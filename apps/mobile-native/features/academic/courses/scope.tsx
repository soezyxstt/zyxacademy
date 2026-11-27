import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import {
  createAdminCourseFixtureStore,
  type CourseFixtureScenario,
  type CourseFixtureStore,
  type CourseMutationResult,
} from "../../../../../packages/native-parity/academic/courses/fixture-store";
import type { AcademicActor } from "../contracts";
import { Action, CourseStatus } from "./ui";

export const AdminCourseFixtureContext = createContext<CourseFixtureStore | null>(null);

export function AdminCourseFixtureProvider({ scenario, children }: { scenario: CourseFixtureScenario; children: ReactNode }) {
  const [store] = useState(() => createAdminCourseFixtureStore(scenario));
  return <AdminCourseFixtureContext.Provider value={store}>{children}</AdminCourseFixtureContext.Provider>;
}

type Command = Omit<Parameters<CourseFixtureStore["mutate"]>[0], "requestId" | "role">;

export function useCourseMutation(actor: AcademicActor, onSaved: () => void) {
  const store = useContext(AdminCourseFixtureContext);
  const [result, setResult] = useState<CourseMutationResult | null>(null);
  const pending = useRef<Parameters<CourseFixtureStore["mutate"]>[0] | null>(null);

  function send(command: Parameters<CourseFixtureStore["mutate"]>[0]) {
    const response = store?.mutate(command) ?? { status: "denied" } as const;
    setResult(response);
    pending.current = response.status === "retry" ? command : null;
    if (response.status === "saved") onSaved();
  }

  return {
    result,
    submit(command: Command) {
      if (!store) return;
      send({ ...command, requestId: store.nextId(), role: actor.role });
    },
    clear() {
      pending.current = null;
      setResult(null);
    },
    retry() {
      if (pending.current) send(pending.current);
    },
  };
}

export function MutationStatus({ mutation, reload, success }: {
  mutation: ReturnType<typeof useCourseMutation>;
  reload?(): void;
  success?: string;
}) {
  const { result, retry } = mutation;
  switch (result?.status) {
    case "retry":
      return <CourseStatus label="Penyimpanan terputus. Perubahan masih tersedia." retry={retry} error />;
    case "denied":
      return <CourseStatus label="Akses ditolak." error />;
    case "validation":
      return <CourseStatus label={result.message} error />;
    case "conflict":
      return (
        <>
          <CourseStatus label="Data sudah berubah. Muat versi terbaru sebelum mengedit lagi." error />
          {reload ? <Action label="Muat versi terbaru" onPress={reload} /> : null}
        </>
      );
    case "saved":
      return success ? <CourseStatus label={success} /> : null;
    default:
      return null;
  }
}
