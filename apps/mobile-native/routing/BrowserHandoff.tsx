import { useLocalSearchParams, useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useRef, useState } from "react";
import { Text, View, useColorScheme } from "react-native";

import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { useNativeUiLocale } from "../auth/use-account-context";
import { Button } from "../components/Button";
import { NativeCompactShell } from "../features/shared-ui/layout";
import { nativeTypography } from "../typography";
import { consentIntake } from "./consent-intent";
import { browserDestination, type BrowserDestination } from "./browser-destination";

type AccountDestination = Exclude<BrowserDestination, "meet">;

const copy = {
  id: {
    authorize: "Izin aplikasi", connections: "Kelola koneksi MCP",
    open: "Buka di browser", back: "Kembali", invalid: "Tautan tidak valid.",
    failed: "Browser gagal dibuka. Coba lagi.", browserAccount: "Periksa akun yang aktif di browser sebelum melanjutkan.",
    expired: "Buka kembali tautan izin dari aplikasi yang meminta akses.",
  },
  en: {
    authorize: "App permissions", connections: "Manage MCP connections",
    open: "Open in browser", back: "Back", invalid: "Invalid link.",
    failed: "Could not open the browser. Try again.", browserAccount: "Check the account signed in to your browser before continuing.",
    expired: "Reopen the permission link from the app requesting access.",
  },
};

function OpenDestination({ kind, url, handoff }: { kind: AccountDestination; url: string | null; handoff?: string }) {
  const router = useRouter();
  const strings = copy[useNativeUiLocale()];
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const opening = useRef(false);
  const [status, setStatus] = useState<"idle" | "opening" | "failed" | "expired">("idle");

  const open = async () => {
    if (!url || opening.current) return;
    if (kind === "authorize" && consentIntake.resolve(handoff) !== url) {
      setStatus("expired");
      return;
    }
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
        {url && status !== "expired" && <Text style={[nativeTypography.bodyRegular, { color: colors.foreground }]}>{strings.browserAccount}</Text>}
        {(!url || status === "failed" || status === "expired") && <Text accessibilityRole="alert" style={[nativeTypography.bodyRegular, { color: colors.foreground }]}>
          {kind === "authorize" && (!url || status === "expired") ? strings.expired : url ? strings.failed : strings.invalid}
        </Text>}
        {url && status !== "expired" && <Button isLoading={status === "opening"} onPress={() => void open()}>{strings.open}</Button>}
      </View>
    </NativeCompactShell>
  );
}

export function BrowserHandoff({ kind }: { kind: AccountDestination }) {
  const params = useLocalSearchParams();
  const handoff = typeof params.handoff === "string" ? params.handoff : undefined;
  const url = kind === "authorize" ? consentIntake.resolve(handoff) : browserDestination(kind, params);
  return <OpenDestination key={handoff ?? url} url={url} kind={kind} handoff={handoff} />;
}
