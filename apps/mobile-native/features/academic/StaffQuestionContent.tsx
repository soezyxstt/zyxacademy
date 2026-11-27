import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { AdminMarkdownPreview } from "../shared-ui/AdminMarkdownPreview";
import { CourseMarkdown } from "../student/CourseMarkdown";

export function StaffQuestionContent({ source, role, theme, locale }: {
  source: string; role: "tutor" | "admin"; theme: "light" | "dark"; locale: "id" | "en";
}) {
  const { transport } = useNativeSession();
  const { context } = useNativeAccountContext();
  const origin = transport?.scope.origin ?? "";
  if (!transport || !context?.roles.includes(role) || context.accountId !== transport.scope.accountId ||
    context.sessionId !== transport.scope.sessionId || !transport.isCurrent()) {
    return <CourseMarkdown source={source} theme={theme} services={{ session: { origin, locale } }} allowLinks={false} />;
  }
  return <AdminMarkdownPreview audience="course" questionRole={role} source={source} session={transport}
    origin={origin} locale={locale} theme={theme} />;
}
