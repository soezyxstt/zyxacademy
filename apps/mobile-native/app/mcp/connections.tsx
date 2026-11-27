import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView } from "react-native";
import en from "../../../../messages/en/consent.json";
import id from "../../../../messages/id/consent.json";
import { authEntryHref } from "../../auth/login-intent";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeUiLocale } from "../../auth/use-account-context";
import { Button } from "../../components/Button";
import { NativeCompactShell } from "../../features/shared-ui/layout";
import { Copy, Message, Section } from "../../features/student/learning/ui";
import type { NativeSessionTransport } from "../../network/transport";

type Connection = { id: string; name: string; scopes: string[]; expiresAt: string };
const endpoint = "/api/native/mcp/connections";

function isConnection(row: unknown): row is Connection {
  return !!row && typeof row === "object" && "id" in row && typeof row.id === "string" &&
    "name" in row && typeof row.name === "string" && "expiresAt" in row && typeof row.expiresAt === "string" &&
    "scopes" in row && Array.isArray(row.scopes) && row.scopes.every(scope => typeof scope === "string");
}

function AccountConnections({ transport, english }: { transport: NativeSessionTransport; english: boolean }) {
  const t = (english ? en : id).authorize;
  const [rows, setRows] = useState<Connection[]>();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [revision, refresh] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const writing = useRef(false);
  const { accountId, sessionId } = transport.scope;
  useEffect(() => {
    const active = new AbortController();
    lifetime.current = active;
    setFailed(false);
    void transport.request(endpoint, { signal: active.signal, retry: "transient-read",
      headers: { "x-native-account": accountId, "x-native-session": sessionId } }).then(async response => {
      if (!response.ok) { response.dispose(); throw new Error(); }
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || !("connections" in payload) ||
        !Array.isArray(payload.connections) || !payload.connections.every(isConnection)) throw new Error();
      if (!active.signal.aborted) setRows(payload.connections);
    }).catch(() => { if (!active.signal.aborted) { setRows(undefined); setFailed(true); } });
    return () => { active.abort(); };
  }, [accountId, sessionId, transport, revision]);

  async function disconnect(connection: Connection) {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted || writing.current || !transport.isCurrent()) return;
    writing.current = true;
    setPending(connection.id);
    try {
      const response = await transport.request(endpoint, {
        method: "DELETE", signal, body: JSON.stringify({ id: connection.id }),
        headers: { "Content-Type": "application/json", "x-native-account": accountId, "x-native-session": sessionId },
      });
      const accepted = response.status === 204;
      response.dispose();
      if (!accepted) throw new Error();
      if (!signal.aborted) { setRows(undefined); refresh(value => value + 1); }
    } catch {
      if (!signal.aborted) { setRows(undefined); setFailed(true); }
    } finally {
      writing.current = false;
      if (!signal.aborted) setPending(null);
    }
  }
  if (failed) return <Message action={english ? "Reload" : "Muat ulang"} onAction={() => refresh(value => value + 1)}>
    {english ? "Reload to check which connections are active." : "Muat ulang untuk memeriksa koneksi yang masih aktif."}
  </Message>;
  if (!rows) return <ActivityIndicator />;
  return <ScrollView><Section>{rows.length === 0 && <Copy>{t.connectionsEmpty}</Copy>}
    {rows.map(row => <Section key={row.id} title={row.name}>
      <Copy muted>{t.connectionExpires.replace("{date}", row.expiresAt.slice(0, 10))}</Copy>
      <Copy muted>{row.scopes.join(", ")}</Copy>
      <Button variant="outline" accessibilityLabel={t.disconnect + ", " + row.name} disabled={pending !== null} isLoading={pending === row.id}
        onPress={() => void disconnect(row)}>{t.disconnect}</Button>
    </Section>)}
  </Section></ScrollView>;
}

export default function McpConnectionsRoute() {
  const router = useRouter();
  const locale = useNativeUiLocale();
  const english = locale === "en";
  const { state, transport, revalidating, refresh } = useNativeSession();
  const focused = useIsFocused();
  const t = (english ? en : id).authorize;
  return <NativeCompactShell navigationTitle={t.manageConnections} back={{ label: english ? "Back" : "Kembali",
    onPress: () => router.canGoBack() ? router.back() : router.replace("/") }}>
    {state.status === "signed-out" ? <Button onPress={() => router.replace(authEntryHref({ entry: "sign-in", locale, next: "/mcp/connections" }))}>
      {english ? "Sign in" : "Masuk"}</Button>
      : state.status === "unavailable" ? <Message action={english ? "Retry" : "Coba lagi"} onAction={() => void refresh()}>
        {english ? "Connect to check your session." : "Hubungkan perangkat untuk memeriksa sesi Anda."}</Message>
      : focused && state.status === "signed-in" && state.expiresAt > Date.now() && transport?.isCurrent() && !revalidating
        ? <AccountConnections key={JSON.stringify(transport.scope)} transport={transport} english={english} /> : <ActivityIndicator />}
  </NativeCompactShell>;
}
