import { usePageTitle } from "../../../routing/visible-navbar-title";
import { ScrollView, useColorScheme } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import {
  isMonitoringPath, MonitoringError,
  type MonitoringActions, type MonitoringLocale, type MonitoringPath, type MonitoringRange, type MonitoringReader,
} from "../../../../../packages/native-parity/operations/monitoring-contract";
import { AiAnalyticsScreen, FeatureUsageScreen, HomeDashboardScreen, WebAnalyticsScreen } from "./analytics";
import { KeyDiagnosticsScreen, ModelsScreen, OpsMonitorScreen } from "./diagnostics";
import { OfflineCacheScreen, ShortLinksScreen, type LinkCapabilities } from "./configuration";
import { TutorActivityScreen } from "./tutor-activity";
import { Heading, MonitoringContext, ReadState, styles, type Theme } from "./ui";

export { createMonitoringReader, createSessionMonitoringReader, createSessionMonitoringActions, type MonitoringFetch } from "./transport";
export { isMonitoringPath, monitoringPaths } from "../../../../../packages/native-parity/operations/monitoring-contract";
export type { MonitoringReader, MonitoringPath, MonitoringLocale, MonitoringActions, MonitoringRange } from "../../../../../packages/native-parity/operations/monitoring-contract";

type MonitoringAccess = "allowed" | "denied" | "signed-out";
export type MonitoringScreenProps = {
  href: string;
  access: MonitoringAccess;
  /** Changes when the authenticated account, session or origin changes. */
  sessionKey: string;
  reader: MonitoringReader;
  actions?: MonitoringActions;
  links?: LinkCapabilities;
  locale?: MonitoringLocale;
  theme?: Theme;
  onNavigate: (href: string) => void;
};

const pageTitles: Record<MonitoringPath, Record<MonitoringLocale, string>> = {
  "/admin": { id: "Admin", en: "Admin" },
  "/admin/ops/web-analytics": { id: "Analitik web, 30 hari", en: "Web analytics, 30 days" },
  "/admin/ops": { id: "Operasional", en: "Operations" },
  "/admin/ops/analytics": { id: "Analitik", en: "Analytics" },
  "/admin/ops/feature-usage": { id: "Penggunaan fitur", en: "Feature usage" },
  "/admin/ops/tutor-activity": { id: "Aktivitas tutor", en: "Tutor activity" },
  "/admin/ops/keys": { id: "Kunci API", en: "API keys" },
  "/admin/ops/models": { id: "Model AI", en: "AI models" },
  "/admin/ops/offline": { id: "Data offline", en: "Offline data" },
  "/admin/ops/short-links": { id: "Tautan pendek", en: "Short links" },
};

function ScreenContents({ path, reader, actions, links, range, navigate }: {
  path: MonitoringPath; reader: MonitoringReader; actions?: MonitoringActions; links?: LinkCapabilities;
  range: MonitoringRange; navigate: (href: string) => void;
}) {
  switch (path) {
    case "/admin": return <HomeDashboardScreen reader={reader} actions={actions} navigate={navigate} />;
    case "/admin/ops/web-analytics": return <WebAnalyticsScreen reader={reader} actions={actions} navigate={navigate} />;
    case "/admin/ops": return <OpsMonitorScreen reader={reader} actions={actions} navigate={navigate} />;
    case "/admin/ops/analytics": return <AiAnalyticsScreen reader={reader} />;
    case "/admin/ops/feature-usage": return <FeatureUsageScreen reader={reader} initialRange={range} navigate={navigate} />;
    case "/admin/ops/tutor-activity": return <TutorActivityScreen reader={reader} />;
    case "/admin/ops/keys": return <KeyDiagnosticsScreen reader={reader} />;
    case "/admin/ops/models": return <ModelsScreen reader={reader} actions={actions} />;
    case "/admin/ops/offline": return <OfflineCacheScreen reader={reader} actions={actions} />;
    case "/admin/ops/short-links": return <ShortLinksScreen reader={reader} actions={actions} links={links} />;
  }
}

export function MonitoringScreen({
  href, access, sessionKey, reader, actions, links, locale = "id", theme: themeOverride, onNavigate,
}: MonitoringScreenProps) {
  const scheme = useColorScheme();
  const theme = themeOverride ?? scheme ?? "light";
  const [rawPath, query] = href.split(/[?#]/, 2);
  const path = rawPath.replace(/\/$/, "");
  const title = usePageTitle(isMonitoringPath(path) ? pageTitles[path][locale] : "");
  if (!isMonitoringPath(path)) return null;
  const requestedRange = new URLSearchParams(query).get("range");
  const range = requestedRange === "7" ? 7 : requestedRange === "90" ? 90 : 30;
  return <MonitoringContext.Provider value={{ theme, locale }}>
    <ScrollView key={JSON.stringify([sessionKey, href, locale, access])}
      testID="operations-monitoring-screen" keyboardShouldPersistTaps="handled"
      style={[styles.screen, { backgroundColor: nativeColors[theme].background }]} contentContainerStyle={styles.container}>
      {title && <Heading>{title}</Heading>}
      {access === "allowed"
        ? <ScreenContents path={path} reader={reader} actions={actions} links={links} range={range} navigate={onNavigate} />
        : <ReadState error={new MonitoringError(access === "signed-out" ? 401 : 403)} />}
    </ScrollView>
  </MonitoringContext.Provider>;
}
