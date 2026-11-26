import { useRouter } from "expo-router";
import { Text, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { useNativeBrowserLogin } from "../../auth/browser-login";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { Button } from "../../components/Button";

export default function InternalSessionRoute() {
  const router = useRouter();
  const { state, logout, refresh } = useNativeSession();
  const account = useNativeAccountContext();
  const login = useNativeBrowserLogin();
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const busy = login.status === "opening" || login.status === "exchanging";
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: "center", gap: 12, paddingHorizontal: 20, backgroundColor: colors.background }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontFamily: "Lexend-Bold", fontSize: 24 }}>Akun staging</Text>
      {state.status === "signed-out" && login.isAvailable && <Button isLoading={busy} onPress={() => void login.signIn(undefined, true)}>Masuk dengan Google</Button>}
      {state.status === "signed-out" && !login.isAvailable &&
        <Text style={{ color: colors.foreground }}>Untuk masuk, buka build internal Zyx Academy.</Text>}
      {busy && <Button variant="ghost" onPress={login.cancel}>Batalkan</Button>}
      {state.status === "signed-in" && account.context &&
        <Text style={{ color: colors.foreground }}>Peran akun: {account.context.roles.join(", ")}</Text>}
      {state.status === "signed-in" && account.failed &&
        <Button variant="outline" onPress={account.retry}>Periksa kembali akses akun</Button>}
      {state.status === "signed-in" && <Button onPress={() => void logout()}>Keluar</Button>}
      {state.status === "loading" && <Text style={{ color: colors.foreground }}>Memeriksa sesi…</Text>}
      {(state.status === "unavailable" || (state.status === "logout-pending" && state.retry)) &&
        <Button onPress={() => void refresh()}>Coba lagi</Button>}
      {state.status === "logout-pending" && <Text style={{ color: colors.foreground }}>
        {state.retry ? "Sesi belum berhasil dicabut. Periksa koneksi lalu coba lagi." : "Sedang keluar…"}
      </Text>}
      {state.status === "unavailable" && <Text style={{ color: colors.foreground }}>Sesi belum dapat diperiksa.</Text>}
      {login.status === "error" && <Text accessibilityRole="alert" style={{ color: colors.foreground }}>Gagal masuk. Coba lagi.</Text>}
      <Button variant="ghost" onPress={() => router.replace("/")}>Kembali ke galeri</Button>
    </SafeAreaView>
  );
}
