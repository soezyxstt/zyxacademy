import { useFocusEffect, useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { Button } from "../../components/Button";
import { AcademicLiveScreen, AcademicMessage } from "../../features/academic/LiveScreen";
import { bindAcademicSession } from "../../features/academic/session-transport";

export default function AcademicSessionRoute() {
  const { path } = useLocalSearchParams<{ path?: string }>();
  const { state, transport } = useNativeSession();
  const { context, failed, retry } = useNativeAccountContext();
  const router = useRouter();
  const isFocused = useIsFocused();
  const focusedOnce = useRef(false);
  const [refresh, setRefresh] = useState(0);
  useFocusEffect(useCallback(() => {
    if (focusedOnce.current) setRefresh((value) => value + 1);
    else focusedOnce.current = true;
  }, []));
  const theme = useColorScheme() === "dark" ? "dark" : "light";
  const client = useMemo(() => transport && context ? bindAcademicSession(transport, context.locale) : null,
    [transport, context]);
  const back = () => router.canGoBack() ? router.back() : router.replace("/");
  const href = typeof path === "string" ? path : context?.roles.includes("admin") ? "/admin/courses" : "/tutor";
  const role = href.startsWith("/admin/") ? "admin" : "tutor";
  const target = (path: string) => ({ pathname: "/internal/academic", params: { path } } as const);
  if (failed) return <SafeAreaView style={{ flex: 1 }}>
    <AcademicMessage theme={theme} back={back}>Konteks akun belum tersedia.</AcademicMessage>
    <Button theme={theme} onPress={retry}>Coba lagi</Button>
  </SafeAreaView>;
  if (state.status !== "loading" && state.status !== "signed-in") {
    return <SafeAreaView style={{ flex: 1 }}>
      <AcademicMessage theme={theme} back={back}>Masuk untuk membuka halaman akademik.</AcademicMessage>
      <Button theme={theme} onPress={() => router.push("/internal/session")}>Buka sesi</Button>
    </SafeAreaView>;
  }
  if (!client || !context || !transport) return <ActivityIndicator accessibilityLabel="Memuat akun" />;
  if (!context.roles.includes(role)) return <AcademicMessage theme={theme} back={back}>Akses ditolak.</AcademicMessage>;
  // Keep the course list mounted so its filters survive Back. Re-enter every other
  // protected route through a fresh read before showing course or participant data.
  if (!isFocused && href.split("?")[0] !== "/admin/courses") return null;
  return <SafeAreaView style={{ flex: 1 }}>
    <AcademicLiveScreen key={context.sessionId} transport={client} theme={theme} actor={{ id: context.accountId, role }}
      href={href} refresh={refresh} back={back} navigate={p => router.push(target(p))} replace={p => router.replace(target(p))} />
  </SafeAreaView>;
}
