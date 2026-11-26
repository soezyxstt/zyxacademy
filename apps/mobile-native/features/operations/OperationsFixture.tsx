import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { createFixturePublicClient } from "../../../../packages/native-parity/operations/public-fixtures";
import { PublicScreen } from "./public";
import { createEvaluationFixtureRequest } from "../../../../packages/native-parity/operations/evaluation-fixtures";
import { createMonitoringFixture } from "../../../../packages/native-parity/operations/monitoring-fixtures";
import { createManagementFixture, ManagementScreen } from "./management";
import { EvaluationScreen } from "./evaluation";
import { isMonitoringPath, MonitoringScreen } from "./monitoring";
import { resolveOperationsArea } from "./routes";

type Mode = "populated" | "empty" | "recoverable" | "denied";
type Session = { path: string; mode: Mode; locale: "id" | "en"; theme: "light" | "dark" };

function FixtureSession({ path, mode, locale, theme }: Session) {
  const [stack, setStack] = useState([path]);
  const [external, setExternal] = useState<string | null>(null);
  const href = stack[stack.length - 1];
  const area = resolveOperationsArea(href);
  const colors = nativeColors[theme];
  const publicClient = useMemo(() => createFixturePublicClient(mode === "denied" ? "empty" : mode), [mode]);
  const initialPath = path.split(/[?#]/, 1)[0];
  const monitoring = useMemo(() => createMonitoringFixture(
    mode === "recoverable" ? "retry" : mode, isMonitoringPath(initialPath) ? initialPath : undefined,
  ), [mode, initialPath]);
  const evaluation = useMemo(() => createEvaluationFixtureRequest(mode === "recoverable" ? "recovery" : mode), [mode]);
  const management = useMemo(() => createManagementFixture({
    admin: mode !== "denied",
    mode: mode === "recoverable" ? "recoverable-error" : mode === "empty" ? "empty" : "populated",
  }), [mode]);
  const navigate = useCallback((next: string, options?: { replace?: boolean }) => {
    setStack(history => next === history[history.length - 1] ? history :
      [...(options?.replace ? history.slice(0, -1) : history), next]);
  }, []);
  const goBack = useCallback((fallback: string) => {
    setExternal(null);
    setStack(history => history.length > 1 ? history.slice(0, -1) : [fallback]);
  }, []);
  useEffect(() => {
    const event = BackHandler.addEventListener("hardwareBackPress", () => {
      if (external) { setExternal(null); return true; }
      if (stack.length <= 1) return false;
      goBack(path);
      return true;
    });
    return () => event.remove();
  }, [external, stack.length, goBack, path]);
  let screen;
  if (!external && area === "public") {
    screen = <PublicScreen
      href={href} locale={locale} theme={theme} client={publicClient} origin="https://example.test"
      onNavigate={navigate} onBack={goBack} onOpenExternal={setExternal}
      pickFiles={async () => [{ name: "latihan.pdf", size: 1024 }]}
    />;
  } else if (!external && area === "monitoring") {
    screen = <MonitoringScreen href={href} access={mode === "denied" ? "denied" : "allowed"} sessionKey="operations-local"
      {...monitoring} theme={theme} locale={locale} onNavigate={navigate} />;
  } else if (!external && area === "evaluation") {
    screen = <EvaluationScreen href={href} accountKey="operations-local" request={evaluation}
      theme={theme} locale={locale} navigate={navigate} />;
  } else if (!external && area === "management") {
    screen = <ManagementScreen path={href} navigate={navigate} client={management} accountKey="operations-local"
      access={mode === "denied" ? "denied" : "admin"} theme={theme} locale={locale} openExternal={setExternal} share={setExternal} />;
  } else {
    screen = <View style={{ padding: 16, gap: 12 }}>
      <Text style={{ color: colors.foreground }} accessibilityRole="header">{external ?? href}</Text>
      <Button theme={theme} onPress={() => external ? setExternal(null) : goBack(path)}>
        {locale === "id" ? "Kembali" : "Back"}
      </Button>
    </View>;
  }
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>{screen}</SafeAreaView>;
}

export default function OperationsFixture() {
  const params = useLocalSearchParams<{ path?: string; mode?: string; theme?: string; locale?: string }>();
  const session: Session = {
    path: typeof params.path === "string" ? params.path : "/admin",
    mode: params.mode === "empty" || params.mode === "recoverable" || params.mode === "denied" ? params.mode : "populated",
    locale: params.locale === "en" ? "en" : "id",
    theme: params.theme === "dark" ? "dark" : "light",
  };
  return <FixtureSession key={JSON.stringify(session)} {...session} />;
}
