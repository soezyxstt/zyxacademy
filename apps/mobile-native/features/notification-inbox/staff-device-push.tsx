import { useRef, useState } from "react";
import { AppState, Linking, StyleSheet, Text, View } from "react-native";

import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import type { StaffInboxPushAction } from "./access";

export function StaffDevicePush({ action, copy, theme, testID, isCurrent, requestPermission }: {
  action: StaffInboxPushAction;
  copy: { enable: string; settings: string; requestFailed: string; settingsFailed: string };
  theme: keyof typeof nativeColors;
  testID: string;
  isCurrent(): boolean;
  requestPermission(canPrompt: () => boolean): Promise<unknown>;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<StaffInboxPushAction | null>(null);
  const colors = nativeColors[theme];

  async function activate() {
    const canInteract = () => isCurrent() && AppState.currentState === "active";
    if (pending.current || !canInteract()) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      if (action === "request") await requestPermission(canInteract);
      else await Linking.openSettings();
    } catch {
      if (isCurrent()) setError(action);
    } finally {
      pending.current = false;
      if (isCurrent()) setBusy(false);
    }
  }

  return (
    <View style={[styles.footer, { borderColor: colors.border }]}>
      <Button variant="outline" size="sm" theme={theme} wrapLabel style={styles.action}
        hitSlop={0} isLoading={busy} testID={`${testID}-device-${action}`} onPress={() => void activate()}>
        {action === "request" ? copy.enable : copy.settings}
      </Button>
      {error && (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
          style={[nativeTypography.bodyRegular, styles.error, { color: colors.destructive }]}>
          {error === "request" ? copy.requestFailed : copy.settingsFailed}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  action: { alignSelf: "flex-start", height: "auto", minHeight: 44, paddingVertical: 8 },
  error: { fontSize: 12, lineHeight: 16 },
});
