import { randomUUID } from "expo-crypto";
import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { getZyraAvatar } from "../../../../../packages/student-community/zyra-cosmetics";
import { getZyraGlbMascot } from "../../../../../packages/student-community/zyra-glb-mascots";
import { useReducedMotion } from "../../../device/reduced-motion";
import { Action, Copy, useCommunity } from "../community/ui";
import { petSceneDocument, petSceneOptions } from "./preview-document";
import { petSceneScript } from "./scene.generated";

export type PetEquipment = { pet: string; suit?: string; action?: string };
export function PetViewer({ pet, suit, action, pose, replay = 0, posterOnly = false }: PetEquipment & {
  pose?: string; replay?: number; posterOnly?: boolean;
}) {
  const { session, tr } = useCommunity();
  const focused = useIsFocused();
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ source: object; status: string }>();
  const [failedPoster, setFailedPoster] = useState<string>();
  const web = useRef<WebView>(null);
  useEffect(() => {
    const sub = AppState.addEventListener("change", state => setForeground(state === "active"));
    return () => sub.remove();
  }, []);
  const active = focused && foreground && !posterOnly;
  const scene = useMemo(() => petSceneOptions(pet, suit, action), [pet, suit, action]);
  const source = useMemo(() => active && scene ? { baseUrl: session.origin + "/",
    html: petSceneDocument(scene, session.origin, randomUUID(), petSceneScript, false) } : null,
  [active, scene, session.origin, attempt]);
  const status = result?.source === source ? result?.status : undefined;
  const avatar = getZyraAvatar(pet);
  const glb = getZyraGlbMascot(avatar?.glbCharacter);
  const animation = pose === "happy" || glb?.previewAnimations.some(name => name === pose) ? pose : scene?.animation;
  useEffect(() => {
    if (status === "ready") web.current?.injectJavaScript("window.updatePetMotion?.(" + JSON.stringify(animation ?? "idle") + "," + !reduced + ");true;");
  }, [animation, reduced, replay, source, status]);
  if (!avatar) return null;
  const artwork = glb?.poster ?? avatar.src;
  return <View style={{ alignItems: "center" }}>
    <View style={{ width: 240, maxWidth: "100%", height: 240 }}>
      {source && status !== "unavailable" && <WebView key={attempt} testID="pet-scene" ref={web} source={source}
        style={{ flex: 1, backgroundColor: "transparent" }} scrollEnabled={false} incognito sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false} originWhitelist={["*"]} setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={request => request.url === source.baseUrl || request.url === "about:blank"}
        onMessage={event => {
          const message = event.nativeEvent.data;
          if (message === "ready" || message === "unavailable") setResult({ source, status: message });
        }}
        onError={() => setResult({ source, status: "unavailable" })} />}
      {status !== "ready" && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
        {failedPoster !== artwork ? <Image style={StyleSheet.absoluteFill} source={{ uri: new URL(artwork, session.origin).href }}
          resizeMode="contain" onError={() => setFailedPoster(artwork)} accessible accessibilityLabel={avatar.name[session.locale === "en" ? "en" : "id"]} />
          : <Copy>{avatar.name[session.locale === "en" ? "en" : "id"]}</Copy>}
        {source && !status && <ActivityIndicator />}
      </View>}
    </View>
    {source && status === "unavailable" && <Action label={tr("Muat ulang maskot 3D", "Reload 3D mascot")} onPress={() => setAttempt(n => n + 1)} />}
  </View>;
}
