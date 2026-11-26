import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { openExpoOfflineMetadataStore } from "../../offline/metadata-expo";
import { inactiveCourseMetadata } from "../../offline/lifecycle";
import type { NativeOfflineScope } from "../../offline/sync-contract";
import { createStudentOfflineCourseLifecycle, selectAuthorizedOfflineMaterial, studentOfflineCourses, type AuthorizedOfflineMaterial, type OfflineCourseTarget } from "./offline-courses";

type ReadingScope = { scope: NativeOfflineScope | null; verifiedUntil: number };
type Driver = ReturnType<typeof createStudentOfflineCourseLifecycle>;
const inactiveSnapshot = () => inactiveCourseMetadata;
const inactiveSubscribe = () => () => {};

function keyFor(scope: NativeOfflineScope | null): string {
  return scope ? JSON.stringify([scope.origin, scope.accountId, scope.sessionId, scope.locale]) : "";
}

async function readMetadata(scope: NativeOfflineScope) {
  const repository = await openExpoOfflineMetadataStore();
  return repository.read(scope);
}

export function useStudentOfflineCourses({ scope, verifiedUntil }: ReadingScope) {
  const [binding, setBinding] = useState<{ scope: NativeOfflineScope; driver: Driver }>();
  const driver = binding?.scope === scope ? binding?.driver : undefined;
  const snapshot = useSyncExternalStore(driver?.subscribe ?? inactiveSubscribe, driver?.getSnapshot ?? inactiveSnapshot, inactiveSnapshot);

  useEffect(() => {
    if (!scope) return;
    const driver = createStudentOfflineCourseLifecycle(scope, readMetadata);
    setBinding({ scope, driver });
    const unregister = driver.register(null);
    return () => {
      unregister();
      driver.dispose();
    };
  }, [scope]);
  useEffect(() => {
    driver?.setEnvironment({ foreground: true, online: false, verified: true, expiresAt: verifiedUntil });
  }, [driver, verifiedUntil]);

  const now = Date.now();
  return {
    status: driver && verifiedUntil > now ? snapshot.status : "inactive",
    courses: driver && verifiedUntil > now ? studentOfflineCourses(snapshot.snapshot, now) : [],
    retry: () => driver?.retry(),
  };
}

export function useOpenAuthorizedOfflineMaterial({
  scope, verifiedUntil, target, open, onUnavailable,
}: ReadingScope & {
  target: OfflineCourseTarget;
  open?: (material: AuthorizedOfflineMaterial) => void | Promise<void>;
  onUnavailable(): void;
}) {
  const accessRef = useRef({ key: "", verifiedUntil: 0, target });
  const scopeKey = keyFor(scope);
  useLayoutEffect(() => {
    accessRef.current = { key: scopeKey, verifiedUntil, target };
    return () => { accessRef.current = { key: "", verifiedUntil: 0, target }; };
  }, [scopeKey, target, verifiedUntil]);

  if (!scope || !open || target.kind !== "material") return undefined;
  return (courseId: string, materialId: string) => {
    if (target.courseId !== courseId || target.materialId !== materialId) return;
    const isCurrent = () => accessRef.current.key === scopeKey
      && accessRef.current.target === target && accessRef.current.verifiedUntil > Date.now();
    if (!isCurrent()) return;
    void readMetadata(scope).then(snapshot => {
      if (!isCurrent()) return;
      const authorized = selectAuthorizedOfflineMaterial({ scope, target, snapshot, verifiedUntil: accessRef.current.verifiedUntil, now: Date.now() });
      if (authorized) return open(authorized);
      onUnavailable();
    }).catch(() => {
      if (isCurrent()) onUnavailable();
    });
  };
}
