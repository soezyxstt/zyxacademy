import { useIsFocused, useNavigation } from "expo-router";
import { useContext } from "react";
import { Platform } from "react-native";
import { useNativeAccountContext } from "../../../auth/use-account-context";
import { useNativeSession } from "../../../auth/session-provider";
import { scopedFiles } from "../../../device/files";
import type { MaterialPdfRequest } from "../../../device/file-controller";
import { ProtectedInteractionContext } from "../../../routing/protected-interaction";
import { MaterialPdf } from "../../student/courses/MaterialPdf";
import { CourseTheme } from "./ui";

export function AdminCoursePdfPreview({ courseId, materialId, title }: {
  courseId: string; materialId: string; title: string;
}) {
  const theme = useContext(CourseTheme);
  const { context } = useNativeAccountContext();
  const { state, transport, getSnapshot, revalidating } = useNativeSession();
  const screen = useNavigation();
  const focused = useIsFocused();
  const verified = (Platform.OS === "android" || Platform.OS === "ios") && focused && !revalidating &&
    state.status === "signed-in" && transport && transport.isCurrent() && context && context.roles.includes("admin") &&
    context.accountId === transport.scope.accountId && context.sessionId === transport.scope.sessionId;
  if (!verified || !transport || !context || state.status !== "signed-in") return null;

  const isTargetCurrent = () => {
    const current = getSnapshot();
    return screen.isFocused() && current.state === state && current.transport === transport &&
      !current.revalidating && state.expiresAt > Date.now() && context.roles.includes("admin");
  };
  const makeRequest = (target: MaterialPdfRequest["target"], signal: AbortSignal): MaterialPdfRequest => ({
    audience: "admin", session: transport, target, signal, sessionExpiresAt: state.expiresAt,
    isTargetCurrent: () => target.courseId === courseId && target.materialId === materialId && isTargetCurrent(),
  });
  const locale = context.locale;
  return <ProtectedInteractionContext.Provider value={{ suspended: false, canInteract: isTargetCurrent }}>
    <MaterialPdf courseId={courseId} materialId={materialId} title={title} locale={locale} theme={theme}
      testIDPrefix="admin" buttonLabel={locale === "en" ? "Preview PDF" : "Pratinjau PDF"}
      reader={{
        open: (target, signal) => scopedFiles.prepareMaterialPdf(makeRequest(target, signal)),
        renew: (target, revision, signal) => scopedFiles.renewMaterialPdf(makeRequest(target, signal), revision),
      }} />
  </ProtectedInteractionContext.Provider>;
}
