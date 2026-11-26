import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
  type LayoutRectangle,
  type TextInput,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import { NavigationIcon } from "./navigation-icons";

export type OverlayFocusTarget = ComponentRef<typeof View> | ComponentRef<typeof TextInput>;
export type OverlayDismissReason = "close-button" | "backdrop" | "back" | "accessibility-escape";

export type SharedOverlayProps = {
  open: boolean;
  onDismiss: (reason: OverlayDismissReason) => void;
  onAfterDismiss?: () => void;
  title: string;
  description?: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<OverlayFocusTarget | null>;
  returnFocusRef?: RefObject<OverlayFocusTarget | null>;
  dismissOnBackdrop?: boolean;
  dismissDisabled?: boolean;
  theme?: keyof typeof nativeColors;
  testID?: string;
};

export type SharedDialogProps = SharedOverlayProps;
export type SharedSheetProps = SharedOverlayProps;
export type PopoverHeaderControls = {
  headingRef: RefObject<ComponentRef<typeof Text> | null>;
  closeRef: RefObject<ComponentRef<typeof Pressable> | null>;
  closeLabel: string;
  dismissDisabled: boolean;
  onClose(): void;
};

type PopoverPlacement = {
  anchorRef: RefObject<OverlayFocusTarget | null>;
  align?: "start" | "center" | "end";
  maxWidth?: number;
  sideOffset?: number;
  panelStyle?: ViewProps["style"];
  bodyMaxHeight?: number;
  bodyInsets?: boolean;
  renderHeader?: (controls: PopoverHeaderControls) => ReactNode;
};
export type SharedPopoverProps = SharedOverlayProps & PopoverPlacement;

type OverlaySurfaceProps = SharedOverlayProps &
  ({ kind: "dialog" | "sheet" } | ({ kind: "popover" } & PopoverPlacement));

function focusTarget(target: OverlayFocusTarget | null | undefined) {
  if (!target) return;
  target.focus();
  AccessibilityInfo.sendAccessibilityEvent(target, "focus");
}

function OverlaySurface({
  open,
  onDismiss,
  onAfterDismiss,
  title,
  description,
  closeLabel,
  children,
  footer,
  initialFocusRef,
  returnFocusRef,
  dismissOnBackdrop = true,
  dismissDisabled = false,
  theme,
  testID,
  ...placement
}: OverlaySurfaceProps) {
  const systemTheme = useColorScheme();
  const resolvedTheme = theme ?? systemTheme ?? "light";
  const colors = nativeColors[resolvedTheme];
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { kind } = placement;
  const anchorRef = kind === "popover" ? placement.anchorRef : undefined;
  const align = kind === "popover" ? (placement.align ?? "center") : "center";
  const restoreRef = returnFocusRef ?? anchorRef;
  const closeRef = useRef<ComponentRef<typeof Pressable>>(null);
  const headingRef = useRef<ComponentRef<typeof Text>>(null);
  const focusFrame = useRef<number | null>(null);
  const wasOpen = useRef(false);
  const openRef = useRef(open);
  const afterDismissRef = useRef(onAfterDismiss);
  const [anchor, setAnchor] = useState<LayoutRectangle>();
  const [panelHeight, setPanelHeight] = useState(0);

  useEffect(() => {
    if (!open || !anchorRef) return;
    const frame = requestAnimationFrame(() => {
      anchorRef.current?.measureInWindow((x, y, anchorWidth, anchorHeight) => {
        if (anchorWidth > 0 && anchorHeight > 0) {
          setAnchor({ x, y, width: anchorWidth, height: anchorHeight });
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorRef, height, open, width]);

  useEffect(() => {
    afterDismissRef.current = onAfterDismiss;
  }, [onAfterDismiss]);

  useLayoutEffect(() => {
    openRef.current = open;
    if (!open && wasOpen.current && Platform.OS !== "ios") {
      const frame = requestAnimationFrame(() => {
        focusTarget(restoreRef?.current);
        afterDismissRef.current?.();
      });
      wasOpen.current = false;
      return () => cancelAnimationFrame(frame);
    }
    if (open) wasOpen.current = true;
  }, [open, restoreRef]);

  useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
  }, []);

  function onShow() {
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      if (!openRef.current) return;
      if (initialFocusRef?.current) {
        focusTarget(initialFocusRef.current);
      } else if (!dismissDisabled) {
        focusTarget(closeRef.current);
      } else if (headingRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(headingRef.current, "focus");
      }
    });
  }

  function onNativeDismiss() {
    if (!wasOpen.current || openRef.current) return;
    wasOpen.current = false;
    focusTarget(restoreRef?.current);
    afterDismissRef.current?.();
  }

  function dismiss(reason: OverlayDismissReason) {
    if (!dismissDisabled) onDismiss(reason);
  }

  const popover = kind === "popover" ? placement : null;
  const popoverMaxWidth = popover?.maxWidth ?? 288;
  const panelWidth = Math.max(1, Math.min(popoverMaxWidth, width - insets.left - insets.right - 32));
  const rightEdge = width - insets.right - 16;
  const leftEdge = insets.left + 16;
  const topEdge = insets.top + 12;
  const bottomEdge = height - insets.bottom - 12;
  let popoverPosition: ViewProps["style"];
  if (kind === "popover" && anchor) {
    const indicatedLeft = align === "start"
      ? anchor.x
      : align === "end" ? anchor.x + anchor.width - panelWidth : anchor.x + (anchor.width - panelWidth) / 2;
    const offset = placement.sideOffset ?? 4;
    const below = anchor.y + anchor.height + offset;
    const above = anchor.y - offset;
    const belowSpace = bottomEdge - below;
    const aboveSpace = above - topEdge;
    const showAbove = (panelHeight > belowSpace || belowSpace < 140) && aboveSpace > belowSpace;
    popoverPosition = {
      position: "absolute",
      width: panelWidth,
      left: Math.max(leftEdge, Math.min(rightEdge - panelWidth, indicatedLeft)),
      ...(showAbove ? { bottom: height - above } : { top: Math.max(topEdge, below) }),
      maxHeight: Math.max(1, showAbove ? aboveSpace : belowSpace),
    };
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={onShow}
      onDismiss={onNativeDismiss}
      onRequestClose={() => dismiss("back")}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" && kind !== "popover" ? "padding" : undefined}
        pointerEvents="box-none"
        style={[
          styles.viewport,
          kind === "sheet" && styles.viewportSheet,
          { paddingTop: insets.top + 16, paddingBottom: kind === "sheet" ? 0 : insets.bottom + 16 },
          { paddingLeft: insets.left + (kind === "sheet" ? 0 : 16), paddingRight: insets.right + (kind === "sheet" ? 0 : 16) },
        ]}
      >
        <Pressable
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          disabled={!dismissOnBackdrop || dismissDisabled}
          onPress={() => dismiss("backdrop")}
          testID={testID ? `${testID}-backdrop` : undefined}
          style={[
            StyleSheet.absoluteFill,
            kind === "dialog" && styles.dialogBackdrop,
            kind === "sheet" && styles.sheetBackdrop,
          ]}
        />
        <View
          role="dialog"
          accessibilityViewIsModal
          onAccessibilityEscape={() => dismiss("accessibility-escape")}
          testID={testID}
          onLayout={kind === "popover" ? (event) => setPanelHeight(event.nativeEvent.layout.height) : undefined}
          style={[
            styles.panel,
            { backgroundColor: colors.background, borderColor: colors.border },
            kind === "sheet" && [styles.sheet, { paddingBottom: Math.max(12, insets.bottom) }],
            popover && [styles.popover, { maxWidth: popoverMaxWidth }, popover.panelStyle],
            popoverPosition,
          ]}
        >
          {popover?.renderHeader ? popover.renderHeader({
            headingRef, closeRef, closeLabel, dismissDisabled, onClose: () => dismiss("close-button"),
          }) : <View style={[styles.headingRow, kind === "sheet" && { borderBottomWidth: 1, borderColor: colors.border }]}>
            <View style={styles.headingText}>
              <Text
                ref={headingRef}
                accessible
                accessibilityRole="header"
                style={[styles.title, kind === "dialog" ? nativeTypography.headingBold : nativeTypography.bodySemibold, { color: colors.foreground }]}
              >
                {title}
              </Text>
              {description ? (
                <Text style={[styles.description, nativeTypography.bodyRegular, { color: colors.mutedForeground }]}>
                  {description}
                </Text>
              ) : null}
            </View>
            <Button
              ref={closeRef}
              theme={resolvedTheme}
              accessibilityLabel={closeLabel}
              disabled={dismissDisabled}
              testID={testID ? `${testID}-close` : undefined}
              variant="ghost"
              size="icon"
              renderIcon={(color, size) => <NavigationIcon name="close" color={color} size={size} />}
              style={styles.close}
              onPress={() => dismiss("close-button")}
            />
          </View>}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={[styles.scroll, popover?.bodyMaxHeight === undefined ? null : { maxHeight: popover.bodyMaxHeight }]}
            contentContainerStyle={popover?.bodyInsets === false ? undefined : styles.content}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SharedDialog(props: SharedDialogProps) {
  return <OverlaySurface {...props} kind="dialog" />;
}

export function SharedSheet(props: SharedSheetProps) {
  return <OverlaySurface {...props} kind="sheet" />;
}

export function SharedPopover(props: SharedPopoverProps) {
  return <OverlaySurface {...props} kind="popover" />;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, justifyContent: "center", alignItems: "center" },
  viewportSheet: { justifyContent: "flex-end" },
  dialogBackdrop: { backgroundColor: "#00000066" },
  sheetBackdrop: { backgroundColor: "#00000033" },
  panel: {
    width: "100%",
    maxWidth: 512,
    maxHeight: "92%",
    borderWidth: 1,
    borderRadius: 12,
    boxShadow: "0 10px 20px #00000030",
    overflow: "hidden",
  },
  sheet: { maxWidth: "100%", maxHeight: "80%", borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  popover: { maxHeight: "80%", borderRadius: nativeRadii.sm, boxShadow: "0 4px 12px #00000024" },
  headingRow: { flexDirection: "row", alignItems: "flex-start", paddingStart: 16, paddingEnd: 8, paddingVertical: 8, gap: 8 },
  headingText: { flex: 1, minWidth: 0, gap: 4, paddingVertical: 6 },
  title: { fontSize: 16, lineHeight: 21 },
  description: { fontSize: 13, lineHeight: 18 },
  close: { width: 44, height: 44 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 8, padding: 16, paddingTop: 8 },
  footer: { flexShrink: 0, paddingHorizontal: 16, paddingBottom: 16 },
});
