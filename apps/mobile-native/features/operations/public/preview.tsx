import { useEffect, useMemo, useState } from "react";
import { BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { nativeFontSources } from "../../../typography";
import type { PublicLocale, PublicTheme } from "../../../../../packages/native-parity/operations/public-contract";
import { createFixturePublicClient, type PublicScenario } from "../../../../../packages/native-parity/operations/public-fixtures";
import { PublicScreen } from "./index";

export function PublicPreview({
  initialHref = "/blog",
  locale = "id",
  theme = "light",
  scenario = "populated",
}: {
  initialHref?: string; locale?: PublicLocale; theme?: PublicTheme; scenario?: PublicScenario;
}) {
  const [loaded] = useFonts(nativeFontSources);
  const [history, setHistory] = useState([initialHref]);
  const client = useMemo(() => createFixturePublicClient(scenario), [scenario]);
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (history.length <= 1) return false;
      setHistory((current) => current.slice(0, -1));
      return true;
    });
    return () => listener.remove();
  }, [history.length]);
  if (!loaded) return null;
  return <SafeAreaView style={{ flex: 1 }}>
    <PublicScreen
      href={history[history.length - 1]}
      client={client}
      theme={theme}
      locale={locale}
      origin="https://example.test"
      brandEmail="hello@example.test"
      onOpenExternal={() => {}}
      pickFiles={async () => [{ name: "latihan.pdf", size: 1024 }]}
      onBack={(fallback) => setHistory((current) => current.length > 1 ? current.slice(0, -1) : [fallback])}
      onNavigate={(href) => setHistory((current) => current[current.length - 1] === href ? current : [...current, href])}
    />
  </SafeAreaView>;
}
