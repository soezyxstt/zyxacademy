import { useState, type ReactNode } from "react";
import { Linking, useColorScheme, View } from "react-native";
import { matchManagementPath, type ManagementClient } from "../../../../../packages/native-parity/operations/management-contract";
import { createManagementFixture, type ManagementFixtureOptions } from "../../../../../packages/native-parity/operations/management-fixtures";
import { BlogEditorRoute, BlogList } from "./blog";
import { Documentation } from "./docs";
import { FormBuilderRoute, FormDetailRoute } from "./forms";
import { Pricing } from "./pricing";
import { Discussions, ImportantLinks, MediaLibrary, MeetDetails, MeetList } from "./tools";
import { Action, Copy, ManagementContext, Screen, type ManagementDraftStore, type ManagementTheme } from "./ui";

export { isManagementPath, managementRoutes, matchManagementPath } from "../../../../../packages/native-parity/operations/management-contract";
export { createManagementFixture, managementCases } from "../../../../../packages/native-parity/operations/management-fixtures";
export type { ManagementAction, ManagementClient, ManagementReads } from "../../../../../packages/native-parity/operations/management-contract";
export type { ManagementDraftStore } from "./ui";

export type ManagementScreenProps = {
  path: string;
  navigate: (path: string) => void;
  client: ManagementClient;
  access: "admin" | "denied" | "signed-out";
  accountKey: string;
  theme?: ManagementTheme;
  locale?: "id" | "en";
  openExternal?: (url: string) => void;
  share?: (message: string) => void;
  renderMarkdown?: (markdown: string) => ReactNode;
};

export function ManagementScreen(props: ManagementScreenProps) {
  return <AccountManagement key={`${props.accountKey}:${props.access}`} {...props} />;
}

function AccountManagement({ path, navigate, client, access, theme, locale = "id", openExternal, share, renderMarkdown }: ManagementScreenProps) {
  const systemTheme = useColorScheme();
  const [drafts] = useState<ManagementDraftStore>(() => new Map());
  const match = matchManagementPath(path);
  if (!match) return null;
  const { route, id, query } = match;
  const tab = query.get("tab") ?? undefined;
  let screen: ReactNode;
  if (access !== "admin") {
    screen = <Screen title="Akses ditolak"><Copy status="error">Akses admin diperlukan.</Copy><View><Action onPress={() => navigate(access === "signed-out" ? "/sign-in" : "/")}>{access === "signed-out" ? "Masuk" : "Kembali"}</Action></View></Screen>;
  } else {
    switch (route) {
      case "/admin/blog": screen = <BlogList />; break;
      case "/admin/blog/new": screen = <BlogEditorRoute />; break;
      case "/admin/blog/[id]/edit": screen = <BlogEditorRoute id={id} />; break;
      case "/admin/forms": screen = <FormBuilderRoute id={query.get("edit") ?? undefined} tab={tab} />; break;
      case "/admin/forms/[id]": screen = <FormDetailRoute id={id!} tab={tab} />; break;
      case "/admin/media": screen = <MediaLibrary initialSpace={tab} />; break;
      case "/admin/docs":
      case "/admin/docs/[slug]": screen = <Documentation slug={id} />; break;
      case "/admin/meet": screen = <MeetList />; break;
      case "/admin/meet/[id]": screen = <MeetDetails id={id!} />; break;
      case "/admin/discussions": screen = <Discussions />; break;
      case "/admin/pricing": screen = <Pricing initialTab={tab} />; break;
      case "/admin/tautan": screen = <ImportantLinks />; break;
    }
  }
  return <ManagementContext.Provider value={{ client, navigate, theme: theme ?? systemTheme ?? "light", locale, drafts, openExternal, share, renderMarkdown }}>
    <View key={path} style={{ flex: 1 }}>{screen}</View>
  </ManagementContext.Provider>;
}

export function ManagementFixtureScreen({ initialPath = "/admin/blog", mode = "populated", admin = true, theme }: ManagementFixtureOptions & { initialPath?: string; theme?: ManagementTheme }) {
  const [paths, setPaths] = useState([initialPath]);
  const [client] = useState(() => createManagementFixture({ mode, admin }));
  return <ManagementScreen
    path={paths.at(-1)!}
    navigate={next => {
      if (!matchManagementPath(next)) return;
      setPaths(previous => previous.at(-2) === next ? previous.slice(0, -1) : [...previous, next]);
    }}
    accountKey="operations-management-fixture"
    access={admin ? "admin" : "denied"}
    client={client}
    theme={theme}
  />;
}
