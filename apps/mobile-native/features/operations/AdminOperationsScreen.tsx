import { useMemo } from "react";
import { NativeStatusPanel } from "../shared-ui/layout";
import type { NativeAccountContext } from "../../../../packages/native-session/context";
import type { NativeSessionTransport } from "../../network/transport";
import { EvaluationScreen, type EvaluationScreenProps } from "./evaluation";
import { createManagementClient, ManagementScreen, type ManagementScreenProps } from "./management";
import { connectBlogThumbnailPicker } from "./management/expo-blog-upload";
import { createSessionMonitoringActions, createSessionMonitoringReader, MonitoringScreen, type MonitoringScreenProps } from "./monitoring";
import { resolveOperationsArea } from "./routes";
import { createEvaluationRequest, operationsAccountKey } from "./session";

export type AdminOperationsScreenProps = {
  href: string;
  session: NativeSessionTransport;
  context: NativeAccountContext;
  navigate: EvaluationScreenProps["navigate"];
  theme?: "light" | "dark";
  management?: Pick<ManagementScreenProps, "openExternal" | "share" | "renderMarkdown">;
  evaluation?: Pick<EvaluationScreenProps, "files" | "renderAst" | "renderText">;
  monitoring?: Pick<MonitoringScreenProps, "actions" | "links">;
};

/** Mount from the host's verified account context. Anonymous public pages have a separate entry. */
export function AdminOperationsScreen(props: AdminOperationsScreenProps) {
  const { context, session, href, navigate, theme } = props;
  const clients = useMemo(() => ({
    management: createManagementClient(session),
    pickBlogThumbnail: connectBlogThumbnailPicker(session),
    evaluation: createEvaluationRequest(session),
    monitoring: createSessionMonitoringReader(session, context.locale),
    actions: createSessionMonitoringActions(session),
  }), [session, context.locale]);

  if (!session.isCurrent() || session.scope.accountId !== context.accountId ||
      session.scope.sessionId !== context.sessionId || !context.roles.includes("admin")) {
    return <NativeStatusPanel tone="error" theme={theme} title={context.locale === "id" ? "Akses ditolak" : "Access denied"} />;
  }
  const key = operationsAccountKey(session, context);
  switch (resolveOperationsArea(href)) {
    case "management":
      return <ManagementScreen {...props.management} path={href} navigate={navigate} accountKey={key} pickBlogThumbnail={clients.pickBlogThumbnail}
        access="admin" client={clients.management} locale={context.locale} theme={theme} />;
    case "evaluation":
      return <EvaluationScreen {...props.evaluation} href={href} navigate={navigate} accountKey={key}
        request={clients.evaluation} locale={context.locale} theme={theme} />;
    case "monitoring":
      return <MonitoringScreen links={{ origin: session.scope.origin, ...props.monitoring?.links }} href={href} onNavigate={navigate} sessionKey={key}
        access="allowed" reader={clients.monitoring} actions={{ ...clients.actions, ...props.monitoring?.actions }}
        locale={context.locale} theme={theme} />;
    default:
      return null;
  }
}
