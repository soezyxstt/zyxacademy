import { useMemo } from "react";
import { NativeStatusPanel } from "../shared-ui/layout";
import { AdminMarkdownPreview } from "../shared-ui/AdminMarkdownPreview";
import { connectTutorDiscussionImages, TutorDiscussionImages } from "../academic/tutor/discussion-images";
import type { NativeAccountContext } from "../../../../packages/native-session/context";
import type { NativeSessionTransport } from "../../network/transport";
import { EvaluationScreen, type EvaluationScreenProps } from "./evaluation";
import { EvaluationAstPreview } from "./evaluation/AstPreview";
import { connectAstFiles } from "./evaluation/expo-ast-files";
import { createManagementClient, ManagementScreen, type ManagementScreenProps } from "./management";
import { connectFormAttachment, connectFormImagePicker } from "./management/form-media";
import { connectBlogMediaPicker } from "./management/expo-blog-upload";
import { createAdminDiscussionClient } from "./management/discussion-client";
import { AdminDiscussionContext } from "./management/discussion-context";
import { connectMediaFilePicker } from "./management/expo-media-upload";
import { useManagementLinkActions } from "./management/link-actions";
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
    pickBlogMedia: connectBlogMediaPicker(session),
    openFormAttachment: connectFormAttachment(session),
    pickFormImage: connectFormImagePicker(session),
    pickMediaFile: connectMediaFilePicker(session),
    evaluation: createEvaluationRequest(session),
    astFiles: connectAstFiles(session, context.locale),
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
      return <AdminManagement key={key} {...props} accountKey={key} client={clients.management} pickBlogMedia={clients.pickBlogMedia} pickMediaFile={clients.pickMediaFile} openFormAttachment={clients.openFormAttachment} pickFormImage={clients.pickFormImage} />;
    case "evaluation":
      return <EvaluationScreen {...props.evaluation} href={href} navigate={navigate} accountKey={key}
        request={clients.evaluation} files={props.evaluation?.files ?? clients.astFiles} locale={context.locale} theme={theme}
        renderText={props.evaluation?.renderText ?? (source => <AdminMarkdownPreview source={source} audience="course"
          session={session} locale={context.locale} theme={theme ?? "light"} origin={session.scope.origin} />)}
        renderAst={props.evaluation?.renderAst ?? (ast => <EvaluationAstPreview key={JSON.stringify([ast.documentMetadata.lastModified, ast.blocks.length])}
          ast={ast} session={session} locale={context.locale} theme={theme ?? "light"} />)} />;
    case "monitoring":
      return <MonitoringScreen links={{ origin: session.scope.origin, ...props.monitoring?.links }} href={href} onNavigate={navigate} sessionKey={key}
        access="allowed" reader={clients.monitoring} actions={{ ...clients.actions, ...props.monitoring?.actions }}
        locale={context.locale} theme={theme} />;
    default:
      return null;
  }
}

function AdminManagement({ session, href, context, management, navigate, theme, accountKey, client, pickBlogMedia, pickMediaFile, openFormAttachment, pickFormImage }: AdminOperationsScreenProps &
  Pick<ManagementScreenProps, "accountKey" | "client" | "pickBlogMedia" | "pickMediaFile" | "openFormAttachment" | "pickFormImage">) {
  const links = useManagementLinkActions(session, href, context.locale, management);
  const discussion = useMemo(() => createAdminDiscussionClient(session, context.locale), [session, context.locale]);
  const discussionImages = useMemo(() => connectTutorDiscussionImages(session, context.locale, "admin"), [session, context.locale]);
  return <AdminDiscussionContext.Provider value={discussion}><TutorDiscussionImages.Provider value={discussionImages}><ManagementScreen
    {...management} {...links} path={href} origin={session.scope.origin} navigate={navigate} accountKey={accountKey} client={client}
    renderMarkdown={management?.renderMarkdown ?? (source => <AdminMarkdownPreview source={source} audience="blog"
      session={session} locale={context.locale} theme={theme ?? "light"} origin={session.scope.origin} openExternal={links.openExternal} />)}
    pickBlogMedia={pickBlogMedia} pickMediaFile={pickMediaFile} openFormAttachment={openFormAttachment} pickFormImage={pickFormImage} access="admin" locale={context.locale} theme={theme}
  /></TutorDiscussionImages.Provider></AdminDiscussionContext.Provider>;
}
