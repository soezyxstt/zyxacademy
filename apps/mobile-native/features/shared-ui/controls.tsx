import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode, type Ref } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type TextInput,
  type TextInputKeyPressEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";

import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { Input, Textarea } from "../../components/Input";
import { nativeTypography } from "../../typography";
import type { SharedUiAction, SharedUiActionGroup, SharedUiActionHandler, SharedUiTheme } from "./actions";
import { SharedUiActionButton } from "./layout";

type CommonProps = {
  testID?: string;
  theme?: SharedUiTheme;
};

function renderSearch(color: string, size: number) {
  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function renderClose(color: string, size: number) {
  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m18 6-12 12M6 6l12 12" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function renderSend(color: string, size: number) {
  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function renderStatus(kind: StatusKind, color: string, size: number) {
  if (kind === "loading") return <ActivityIndicator accessible={false} size="small" color={color} />;
  if (kind === "status") return null;

  const path = kind === "error"
    ? "M10.3 4.9 2.8 18a1.5 1.5 0 0 0 1.3 2.2h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.9a2 2 0 0 0-3.4 0ZM12 10v3.5m0 3h.01"
    : "M4 4h16l2 10v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-5L4 4Zm-2 10h6l2 3h4l2-3h6";

  return (
    <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={path} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export type SharedUiSearchProps = CommonProps & {
  label: string;
  placeholder?: string;
  clearLabel: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  pending?: boolean;
  disabled?: boolean;
  /** Supply expansion for a controlled compact trigger. A nonempty query keeps the input visible. */
  expansion?: {
    expanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    closeLabel: string;
  };
};

export function SharedUiSearch({
  label,
  placeholder,
  clearLabel,
  value,
  onValueChange,
  onSubmit,
  pending = false,
  disabled = false,
  expansion,
  theme,
  testID,
}: SharedUiSearchProps) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const trigger = useRef<ComponentRef<typeof Button>>(null);
  const focusAfterChange = useRef<"input" | "trigger" | null>(null);
  const [focused, setFocused] = useState(false);
  const expanded = !expansion || expansion.expanded || value.length > 0;

  useLayoutEffect(() => {
    const target = focusAfterChange.current;
    if (disabled) {
      focusAfterChange.current = null;
      return;
    }
    if (target === "input" && expanded) {
      input.current?.focus();
    } else if (target === "trigger" && !expanded) {
      const button = trigger.current;
      button?.focus();
      if (button && Platform.OS !== "web") AccessibilityInfo.sendAccessibilityEvent(button, "focus");
    } else {
      return;
    }
    focusAfterChange.current = null;
  }, [disabled, expanded]);

  function openSearch() {
    if (!expansion || disabled) return;
    focusAfterChange.current = "input";
    expansion.onExpandedChange(true);
  }

  function closeSearch() {
    if (!expansion || disabled) return;
    focusAfterChange.current = "trigger";
    setFocused(false);
    if (value) onValueChange("");
    expansion.onExpandedChange(false);
  }

  function clearQuery() {
    if (disabled) return;
    onValueChange("");
    input.current?.focus();
  }

  function handleKeyPress(event: TextInputKeyPressEvent) {
    const nativeEvent = event.nativeEvent;
    if (("isComposing" in nativeEvent && nativeEvent.isComposing) || nativeEvent.key !== "Escape" || !expansion) return;
    event.preventDefault();
    event.stopPropagation();
    closeSearch();
  }

  if (!expanded) {
    return (
      <Button
        accessibilityLabel={label}
        accessibilityState={{ expanded: false }}
        disabled={disabled}
        onPress={openSearch}
        ref={trigger}
        renderIcon={pending ? (color) => <ActivityIndicator accessible={false} color={color} size="small" /> : renderSearch}
        aria-busy={pending}
        size="icon-lg"
        style={styles.touchIcon}
        testID={testID && `${testID}-trigger`}
        theme={theme}
        variant="outline"
      />
    );
  }

  return (
    <View
      style={[
        styles.search,
        { backgroundColor: colors.background, borderColor: focused ? colors.primary : colors.border },
        focused && !disabled && { boxShadow: `0 0 0 2px ${colors.ring}` },
        disabled && styles.disabled,
      ]}
    >
      <View accessible={false} style={styles.searchIcon}>
        {pending ? <ActivityIndicator accessible={false} color={colors.primary} size="small" /> : renderSearch(colors.mutedForeground, 16)}
      </View>
      <Input
        accessibilityLabel={label}
        accessibilityState={{ busy: pending }}
        autoCapitalize="none"
        disabled={disabled}
        onBlur={() => setFocused(false)}
        onChangeText={onValueChange}
        onFocus={() => setFocused(true)}
        onKeyPress={handleKeyPress}
        onSubmitEditing={onSubmit ? ({ nativeEvent }) => onSubmit(nativeEvent.text) : undefined}
        placeholder={placeholder ?? label}
        ref={input}
        returnKeyType="search"
        role="searchbox"
        style={styles.searchInput}
        submitBehavior={onSubmit ? "submit" : "blurAndSubmit"}
        testID={testID && `${testID}-input`}
        theme={theme}
        value={value}
      />
      {!!value && (
        <Button
          accessibilityLabel={clearLabel}
          disabled={disabled}
          onPress={clearQuery}
          renderIcon={renderClose}
          size="icon-lg"
          style={styles.touchIcon}
          testID={testID && `${testID}-clear`}
          theme={theme}
          variant="ghost"
        />
      )}
      {!value && expansion && (
        <Button
          accessibilityLabel={expansion.closeLabel}
          accessibilityState={{ expanded: true }}
          disabled={disabled}
          onPress={closeSearch}
          renderIcon={renderClose}
          size="icon-lg"
          style={styles.touchIcon}
          testID={testID && `${testID}-close`}
          theme={theme}
          variant="ghost"
        />
      )}
    </View>
  );
}

type StatusKind = "status" | "empty" | "error" | "loading";

export type SharedUiStatusProps<Id extends string = string> = CommonProps & {
  kind: StatusKind;
  message: string;
  description?: string;
  layout?: "inline" | "center";
} & (
  | { action: SharedUiAction<Id>; onAction: SharedUiActionHandler<Id> }
  | { action?: undefined; onAction?: undefined }
);

function useStatusAnnouncement(message: string | undefined) {
  // Android and web announce the live region. VoiceOver needs an explicit update.
  const previous = useRef(message);
  useEffect(() => {
    if (Platform.OS === "ios" && message && message !== previous.current) {
      AccessibilityInfo.announceForAccessibility(message);
    }
    previous.current = message;
  }, [message]);
}

export function SharedUiStatus<Id extends string = string>({
  kind,
  message,
  description,
  action,
  onAction,
  layout = "inline",
  theme,
  testID,
}: SharedUiStatusProps<Id>) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const centered = layout === "center";
  const color = kind === "error" ? colors.destructive : colors.mutedForeground;
  useStatusAnnouncement(description ? `${message}. ${description}` : message);

  return (
    <View style={centered ? styles.statusCenter : styles.statusInline} testID={testID}>
      <View style={centered ? styles.statusCenterBody : styles.statusBody}>
        {renderStatus(kind, color, centered ? 24 : 16)}
        <View
          accessibilityLiveRegion={kind === "error" ? "assertive" : "polite"}
          accessibilityState={{ busy: kind === "loading" }}
          style={centered ? styles.statusCenterCopy : styles.statusCopy}
        >
          <Text style={[styles.body, kind === "empty" ? nativeTypography.bodySemibold : nativeTypography.bodyRegular, { color: colors.foreground }, centered && styles.textCenter]}>
            {message}
          </Text>
          {description && (
            <Text style={[styles.small, nativeTypography.bodyRegular, { color: colors.mutedForeground }, centered && styles.textCenter]}>
              {description}
            </Text>
          )}
        </View>
      </View>
      {action && onAction && <SharedUiActionButton action={action} onAction={onAction} theme={theme} testID={testID && `${testID}-action`} />}
    </View>
  );
}

export type SharedUiToolbarProps<Id extends string = string> = CommonProps & SharedUiActionGroup<Id> & {
  label: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export function SharedUiToolbar<Id extends string = string>({
  label,
  leading,
  trailing,
  actions,
  onAction,
  theme,
  testID,
}: SharedUiToolbarProps<Id>) {
  return (
    <View role="group" aria-label={label} style={styles.toolbar} testID={testID}>
      {leading != null && <View style={styles.toolbarLeading}>{leading}</View>}
      {trailing}
      {actions && onAction && actions.map((action) => (
        <SharedUiActionButton
          action={action}
          key={action.id}
          onAction={onAction}
          testID={testID && `${testID}-${action.id}`}
          theme={theme}
        />
      ))}
    </View>
  );
}

type ComposerSelection = { start: number; end: number };

export type SharedUiComposerProps<Id extends string = string> = CommonProps & {
  label: string;
  placeholder?: string;
  draft: string;
  onDraftChange: (draft: string) => void;
  submitLabel: string;
  pendingLabel?: string;
  onSubmit: (draft: string) => void;
  /** Allow submission with only attachments or other caller-owned content. */
  canSubmitEmpty?: boolean;
  disabled?: boolean;
  editingDisabled?: boolean;
  submitDisabled?: boolean;
  pending?: boolean;
  maxLength?: number;
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  selection?: ComposerSelection;
  onSelectionChange?: (selection: ComposerSelection) => void;
  beforeInput?: ReactNode;
  toolsLabel?: string;
  tools?: readonly SharedUiAction<Id>[];
  onTool?: SharedUiActionHandler<Id>;
  recovery?: {
    message: string;
    /** When delivery is uncertain, lock editing and retain the original request ID and payload in this callback. */
    retry?: { label: string; onRetry: () => void };
  };
};

export function SharedUiComposer<Id extends string = string>({
  label,
  placeholder,
  draft,
  onDraftChange,
  submitLabel,
  pendingLabel,
  onSubmit,
  canSubmitEmpty = false,
  disabled = false,
  editingDisabled = false,
  submitDisabled = false,
  pending = false,
  maxLength,
  inputRef,
  selection,
  onSelectionChange,
  beforeInput,
  toolsLabel,
  tools,
  onTool,
  recovery,
  theme,
  testID,
}: SharedUiComposerProps<Id>) {
  const systemTheme = useColorScheme();
  const colors = nativeColors[theme ?? systemTheme ?? "light"];
  const [focused, setFocused] = useState(false);
  const writingBlocked = disabled || editingDisabled || pending;
  const sendingBlocked = disabled || submitDisabled || pending || (!canSubmitEmpty && !draft.trim());
  const retry = recovery?.retry;
  useStatusAnnouncement(recovery?.message);

  function send() {
    if (sendingBlocked) return;
    if (retry) retry.onRetry();
    else onSubmit(draft);
  }

  function handleKeyPress(event: TextInputKeyPressEvent) {
    const key = event.nativeEvent;
    if (Platform.OS !== "web" || key.key !== "Enter" || ("isComposing" in key && key.isComposing)) return;
    if (("ctrlKey" in key && key.ctrlKey) || ("metaKey" in key && key.metaKey)) {
      event.preventDefault();
      if (!("repeat" in key && key.repeat)) send();
    }
  }

  return (
    <View style={styles.composer} testID={testID}>
      <View
        style={[
          styles.composerSurface,
          { backgroundColor: colors.background, borderColor: focused && !writingBlocked ? colors.primary : colors.border },
        ]}
      >
        {beforeInput}
        <Textarea
          accessibilityLabel={label}
          disabled={writingBlocked}
          maxLength={maxLength}
          onBlur={() => setFocused(false)}
          onChangeText={onDraftChange}
          onFocus={() => setFocused(true)}
          onKeyPress={handleKeyPress}
          onSelectionChange={onSelectionChange ? ({ nativeEvent }) => onSelectionChange(nativeEvent.selection) : undefined}
          placeholder={placeholder ?? label}
          ref={inputRef}
          selection={selection}
          style={styles.composerInput}
          testID={testID && `${testID}-input`}
          theme={theme}
          value={draft}
        />
        <View style={styles.composerFooter}>
          {tools && onTool && (
            <View style={styles.composerTools}>
              <SharedUiToolbar
                actions={tools.map((tool) => writingBlocked ? { ...tool, disabled: true } : tool)}
                label={toolsLabel ?? label}
                onAction={onTool}
                testID={testID && `${testID}-tools`}
                theme={theme}
              />
            </View>
          )}
          <Button
            accessibilityLabel={pending && pendingLabel ? pendingLabel : retry?.label ?? submitLabel}
            disabled={sendingBlocked}
            isLoading={pending}
            onPress={send}
            renderIcon={retry ? undefined : renderSend}
            size={retry ? "lg" : "icon-lg"}
            style={retry ? styles.touchLabel : styles.touchIcon}
            testID={testID && `${testID}-submit`}
            theme={theme}
          >
            {retry?.label}
          </Button>
        </View>
      </View>
      <View accessibilityLiveRegion="assertive">
        {recovery && (
          <Text style={[styles.small, nativeTypography.bodyRegular, { color: colors.destructive }]} testID={testID && `${testID}-error`}>
            {recovery.message}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20, includeFontPadding: false },
  small: { fontSize: 12, lineHeight: 18, includeFontPadding: false },
  textCenter: { textAlign: "center" },
  touchIcon: { width: 44, height: 44 },
  touchLabel: { minHeight: 44, height: "auto", paddingVertical: 8 },
  search: { minWidth: 0, minHeight: 44, flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12 },
  searchIcon: { width: 36, alignItems: "center", justifyContent: "center" },
  searchInput: { flex: 1, minWidth: 0, width: undefined, minHeight: 42, height: "auto", paddingStart: 0, backgroundColor: "transparent", borderWidth: 0, outlineWidth: 0, boxShadow: "none" },
  disabled: { opacity: 0.5 },
  statusInline: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  statusBody: { flexDirection: "row", alignItems: "flex-start", minWidth: 0, flexGrow: 1, flexShrink: 1, gap: 8 },
  statusCopy: { minWidth: 0, flexShrink: 1, gap: 4 },
  statusCenter: { alignItems: "center", gap: 8, paddingVertical: 32, paddingHorizontal: 16 },
  statusCenterBody: { alignItems: "center", gap: 8 },
  statusCenterCopy: { alignItems: "center", gap: 4 },
  toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  toolbarLeading: { flexBasis: 148, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  composer: { gap: 8 },
  composerSurface: { borderWidth: 1, borderRadius: 16, minWidth: 0, padding: 6, gap: 4 },
  composerInput: { borderWidth: 0, borderRadius: nativeRadii.md, outlineWidth: 0, boxShadow: "none", paddingHorizontal: 6, minHeight: 64 },
  composerFooter: { flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end", gap: 8 },
  composerTools: { flex: 1, minWidth: 0 },
});
