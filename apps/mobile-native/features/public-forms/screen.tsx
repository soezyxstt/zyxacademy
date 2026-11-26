import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from "react-native";
import type { ReactNode } from "react";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { NativeCompactShell, NativeStatusPanel, SharedUiActionButton } from "../shared-ui/layout";
import { formClosureMessage, publicFormCopy } from "./copy";
import { formStyles } from "./fields";
import type { FormLocale, PublicFormLoad } from "./model";
import { PublicFormPageFrame, PublicFormStatus } from "./status";

type Access = "waiting" | "anonymous" | "signed-in" | "unavailable";

export function PublicFormScreen({ state, locale, access, opening, browserFailed, onRetry, onLogin, onWeb, onMeet, onBack, onHome, children, insideSafeArea }: {
  state: PublicFormLoad | null; locale: FormLocale; access: Access; opening?: boolean; browserFailed?: boolean;
  insideSafeArea?: boolean;
  onRetry(): void; onLogin(): void; onWeb(): void; onMeet(): void; onBack(): void; onHome(): void; children?: ReactNode;
}) {
  const copy = publicFormCopy(locale);
  const theme = useColorScheme() ?? "light";
  const colors = nativeColors[theme];
  const ready = state?.status === "ready";
  const requiresAccount = ready && (state.form.settings.requireLogin || state.form.settings.collectEmail === "verified");
  const browserNotice = browserFailed && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
    style={[formStyles.meta, { color: colors.destructive }]}>{copy.browserFailed}</Text>;
  if (state?.status === "missing" || state?.status === "closed") {
    const common = { theme, home: copy.home, onHome, notice: browserNotice };
    return <PublicFormPageFrame theme={theme} insideSafeArea={insideSafeArea}>
      {state.status === "missing"
        ? <PublicFormStatus {...common} kind="missing" title={copy.notFoundTitle} description={copy.notFoundDescription} />
        : <PublicFormStatus {...common} kind="closed" title={state.title} label={copy.closed} description={formClosureMessage(locale, state.closure)}
          recheck={state.closure?.kind === "scheduled" ? { label: copy.checkStatus, run: onRetry } : undefined} />}
    </PublicFormPageFrame>;
  }
  if (ready && children && !(requiresAccount && access === "anonymous")) {
    return <PublicFormPageFrame theme={theme} insideSafeArea={insideSafeArea} ornamentOpacity={0.3}>
      {browserNotice ? <View style={styles.browserNotice}>{browserNotice}</View> : null}
      {children}
    </PublicFormPageFrame>;
  }

  let contents: ReactNode;
  if (!state || (ready && access === "waiting" && !children)) {
    const loading = copy.loading.replace("...", "…");
    contents = <View style={styles.loading} accessible accessibilityLabel={loading} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <Text style={[formStyles.body, { color: colors.mutedForeground }]}>{loading}</Text>
    </View>;
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

  const title = state?.status === "meeting" ? "Google Meet" : copy.formTitle;
  return <NativeCompactShell back={{ label: copy.back, onPress: onBack }} navigationTitle={title} edges={insideSafeArea ? [] : undefined}>
    {browserNotice}
    {contents}
  </NativeCompactShell>;
}

const styles = StyleSheet.create({
  loading: { flexDirection: "row", alignItems: "center", gap: 8 },
  browserNotice: { paddingHorizontal: 16, paddingVertical: 8 },
});
