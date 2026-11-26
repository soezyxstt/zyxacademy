import { useLocalSearchParams, useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useRef, useState } from "react";
import { Text, View, useColorScheme } from "react-native";

import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { Button } from "../components/Button";
import { NativeCompactShell } from "../features/shared-ui/layout";
import { nativeTypography } from "../typography";
import { browserDestination, type BrowserDestination } from "./browser-destination";

const copy = {
  id: {
    authorize: "Izin aplikasi", connections: "Kelola koneksi MCP", meet: "Google Meet",
    open: "Buka di browser", back: "Kembali", invalid: "Tautan tidak valid.",
    failed: "Browser gagal dibuka. Coba lagi.",
  },
  en: {
    authorize: "App permissions", connections: "Manage MCP connections", meet: "Google Meet",
    open: "Open in browser", back: "Back", invalid: "Invalid link.",
    failed: "Could not open the browser. Try again.",
  },
};

function OpenDestination({ kind, url }: { kind: BrowserDestination; url: string | null }) {
  const router = useRouter();
  const strings = copy[Intl.DateTimeFormat().resolvedOptions().locale.startsWith("en") ? "en" : "id"];
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const opening = useRef(false);
  const [status, setStatus] = useState<"idle" | "opening" | "failed">("idle");

  const open = async () => {
    if (!url || opening.current) return;
    opening.current = true;
    setStatus("opening");
    try {
      await openBrowserAsync(url);
      setStatus("idle");
    } catch {
      setStatus("failed");
    } finally {
      opening.current = false;
    }
  };

  return (
    <NativeCompactShell navigationTitle={strings[kind]} back={{
      label: strings.back, onPress: () => router.canGoBack() ? router.back() : router.replace("/"),
    }}>
      <View style={{ gap: 8, paddingVertical: 16, alignItems: "flex-start" }}>
        {(!url || status === "failed") && <Text accessibilityRole="alert" style={[nativeTypography.bodyRegular, { color: colors.foreground }]}>
          {url ? strings.failed : strings.invalid}
        </Text>}
        {url && <Button isLoading={status === "opening"} onPress={() => void open()}>{strings.open}</Button>}
      </View>
    </NativeCompactShell>
  );
}

export function BrowserHandoff({ kind }: { kind: BrowserDestination }) {
  const url = browserDestination(kind, useLocalSearchParams());
  return <OpenDestination key={url} url={url} kind={kind} />;
}
