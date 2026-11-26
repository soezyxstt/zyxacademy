import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from "react-native";
import type { ReactNode } from "react";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { NativeCompactShell, NativeStatusPanel, SharedUiActionButton } from "../shared-ui/layout";
import { formClosureMessage, publicFormCopy } from "./copy";
import { formStyles } from "./fields";
import type { FormLocale, PublicFormLoad } from "./model";

type Access = "waiting" | "anonymous" | "signed-in" | "unavailable";

export function PublicFormScreen({ state, locale, access, opening, browserFailed, onRetry, onLogin, onWeb, onMeet, onBack, children }: {
  state: PublicFormLoad | null; locale: FormLocale; access: Access; opening?: boolean; browserFailed?: boolean;
  onRetry(): void; onLogin(): void; onWeb(): void; onMeet(): void; onBack(): void; children?: ReactNode;
}) {
  const copy = publicFormCopy(locale);
  const colors = nativeColors[useColorScheme() ?? "light"];
  const ready = state?.status === "ready";
  const requiresAccount = ready && (state.form.settings.requireLogin || state.form.settings.collectEmail === "verified");
  let contents: ReactNode;
  if (!state || (ready && access === "waiting" && !children)) {
    const loading = copy.loading.replace("...", "…");
    contents = <View style={styles.loading} accessible accessibilityLabel={loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <Text style={[formStyles.body, { color: colors.mutedForeground }]}>{loading}</Text>
    </View>;
  } else if (state.status === "closed") {
    const message = formClosureMessage(locale, state.closure);
    contents = state.closure?.kind === "scheduled"
      ? <NativeStatusPanel title={copy.closed} message={message}
        action={{ id: "retry", label: copy.checkStatus }} onAction={onRetry} />
      : <NativeStatusPanel title={copy.closed} message={message} />;
  } else if (state.status === "missing") {
    contents = <NativeStatusPanel title={copy.notFoundTitle} message={copy.notFoundDescription}
      action={{ id: "done", label: copy.home }} onAction={onBack} />;
  } else if (state.status === "meeting") {
    contents = <NativeStatusPanel title="Google Meet"
      action={{ id: "meet", label: opening ? copy.opening : state.url ? copy.meeting : copy.openWeb, pending: opening }}
      onAction={state.url ? onMeet : onWeb} />;
  } else if (state.status === "unsupported") {
    contents = <NativeStatusPanel title={copy.support}
      action={{ id: "web", label: opening ? copy.opening : copy.openWeb, pending: opening }} onAction={onWeb} />;
  } else if (state.status === "error" || (access === "unavailable" && !children)) {
    contents = <View style={formStyles.group}>
      <NativeStatusPanel tone="error" title={copy.loadError} action={{ id: "retry", label: copy.retry }} onAction={onRetry} />
      <View style={{ alignSelf: "flex-start" }}>
        <SharedUiActionButton action={{ id: "web", label: opening ? copy.opening : copy.openWeb, pending: opening, variant: "ghost" }}
          onAction={onWeb} />
      </View>
    </View>;
  } else if (requiresAccount && access === "anonymous") {
    contents = <NativeStatusPanel title={copy.loginRequired} message={copy.loginDescription}
      action={{ id: "login", label: copy.loginAction }} onAction={onLogin} />;
  } else {
    contents = children;
  }

  const title = state?.status === "closed" ? state.title : state?.status === "meeting" ? "Google Meet" : copy.formTitle;
  return <NativeCompactShell back={{ label: copy.back, onPress: onBack }} navigationTitle={title}>
    {browserFailed && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
      style={[formStyles.meta, { color: colors.destructive }]}>{copy.browserFailed}</Text>}
    {contents}
  </NativeCompactShell>;
}

const styles = StyleSheet.create({
  loading: { flexDirection: "row", alignItems: "center", gap: 8 },
});
