import { useEffect, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import type { WebsiteMaterialAST } from "../../../../../lib/ast-validator";
import { evaluationRead, type EvaluationRequest } from "../../../../../packages/native-parity/operations/evaluation-contract";
import { matchEvaluationRoute, type EvaluationRedirect } from "../../../../../packages/native-parity/operations/evaluation-routes";
import { AstInspectorScreen, type EvaluationFiles } from "./AstInspectorScreen";
import { DistractorsScreen } from "./DistractorsScreen";
import { JobsScreen } from "./JobsScreen";
import { QuestionsScreen } from "./QuestionsScreen";
import { Failure, Heading, Load, Surface, httpStatus, language, useRead, type Presentation } from "./ui";

export { evaluationRoutes, matchEvaluationRoute } from "../../../../../packages/native-parity/operations/evaluation-routes";
export type { EvaluationRequest, EvaluationFiles };

export type EvaluationScreenProps = {
  href: string;
  accountKey: string;
  request: EvaluationRequest;
  navigate: (href: string, options?: { replace?: boolean }) => void;
  locale?: Presentation["locale"];
  theme?: Presentation["theme"];
  renderText?: Presentation["renderText"];
  renderAst?: (ast: WebsiteMaterialAST) => ReactNode;
  files?: EvaluationFiles;
};

export function EvaluationScreen({ theme, ...props }: EvaluationScreenProps) {
  const systemTheme = useColorScheme();
  return <EvaluationRouteScreen key={`${props.accountKey}:${props.href}`} theme={theme ?? systemTheme ?? "light"} {...props} />;
}

function EvaluationRouteScreen({ href, request, navigate, locale = "id", theme, files, renderText, renderAst }: EvaluationScreenProps & { theme: Presentation["theme"] }) {
  const presentation = { locale, theme, renderText };
  const match = matchEvaluationRoute(href);
  const alias = match?.route.kind === "alias";
  const redirect = useRead<EvaluationRedirect>(request, alias ? evaluationRead(href) : undefined);
  const grant = useRead<{ authorized: true }>(request, match?.route.id === "ast-inspector" ? evaluationRead(href) : undefined);
  const target = redirect.data?.kind === "redirect" ? redirect.data.href : undefined;
  const denied = [401, 403].includes(httpStatus(redirect.error) ?? 0);
  const aliasId = match?.route.id;
  const deniedTarget = denied
    ? aliasId === "leaderboard" || aliasId === "quiz-insights" || aliasId === "quiz-insight" ? "/admin"
      : aliasId === "quiz-edit" || aliasId === "quiz-new" || aliasId === "quizzes" ? "/" : undefined
    : undefined;
  useEffect(() => {
    if (target || deniedTarget) navigate(target ?? deniedTarget!, { replace: true });
  }, [target, deniedTarget, navigate]);

  return <Surface theme={theme}>
    {!match && <Heading theme={theme}>{language(locale, "Halaman tidak ditemukan", "Page not found")}</Heading>}
    {alias && !deniedTarget && <Load resource={redirect} presentation={presentation}>{(result) => result.kind === "not-found"
      ? <Failure error={{ status: 404 }} presentation={presentation} /> : null}</Load>}
    {match?.route.id === "distractors" && <DistractorsScreen request={request} presentation={presentation} />}
    {match?.route.id === "jobs" && <JobsScreen request={request} presentation={presentation} />}
    {match?.route.id === "questions" && <QuestionsScreen request={request} presentation={presentation} navigate={navigate} initialSearch={match.search} importMarkdown={files?.importMarkdown} />}
    {match?.route.id === "ast-inspector" && <Load resource={grant} presentation={presentation}>{() => <AstInspectorScreen presentation={presentation} files={files} renderAst={renderAst} initialTab={match.search.get("tab")} />}</Load>}
  </Surface>;
}
