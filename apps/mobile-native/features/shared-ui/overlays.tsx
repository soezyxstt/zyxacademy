import { Children, createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from "react";
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
import { SafeAreaListener, useSafeAreaInsets, type EdgeInsets } from "react-native-safe-area-context";

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

// Null means no anchor wrapper. Undefined means its first native frame is pending.
const PopoverAnchorFrame = createContext<LayoutRectangle | null | undefined>(null);
const POPOVER_ANCHOR_WAIT_MS = 250;

export function SharedPopoverAnchor({ children, style }: Pick<ViewProps, "children" | "style">) {
  const [frame, setFrame] = useState<LayoutRectangle>();
  if (Platform.OS !== "android") {
    return <View accessible={false} pointerEvents="box-none" style={[styles.anchor, style]}>{children}</View>;
  }
  return (
    <SafeAreaListener
      accessible={false}
      collapsable={false}
      pointerEvents="box-none"
      style={[styles.anchor, style]}
      onChange={({ frame }) => {
        setFrame(frame.width > 0 && frame.height > 0 ? frame : undefined);
      }}
    >
      <PopoverAnchorFrame.Provider value={frame}>{children}</PopoverAnchorFrame.Provider>
    </SafeAreaListener>
  );
}

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
  const nativeAnchor = useContext(PopoverAnchorFrame);
  const trackNativeAnchor = Platform.OS === "android" && kind === "popover" && nativeAnchor !== null;
  const restoreRef = returnFocusRef ?? anchorRef;
  const closeRef = useRef<ComponentRef<typeof Pressable>>(null);
  const headingRef = useRef<ComponentRef<typeof Text>>(null);
  const focusedOnOpen = useRef(false);
  const wasOpen = useRef(false);
  const openRef = useRef(open);
  const afterDismissRef = useRef(onAfterDismiss);
  const [shown, setShown] = useState(false);
  const [measuredAnchor, setMeasuredAnchor] = useState<LayoutRectangle>();
  const [viewport, setViewport] = useState<Pick<LayoutRectangle, "width" | "height">>();
  const [nativeViewport, setNativeViewport] = useState<{ frame: LayoutRectangle; insets: EdgeInsets }>();
  const [panelHeight, setPanelHeight] = useState(0);
  const [fallbackReady, setFallbackReady] = useState(false);

  useEffect(() => {
    if (!open || !anchorRef || trackNativeAnchor || !viewport) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      // Remeasure ref-only callers when the modal or safe-area geometry settles.
      anchorRef.current?.measure((_x, _y, anchorWidth, anchorHeight, x, y) => {
        if (!cancelled && anchorWidth > 0 && anchorHeight > 0) {
          setMeasuredAnchor({ x, y, width: anchorWidth, height: anchorHeight });
        }
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [anchorRef, height, insets.bottom, insets.left, insets.right, insets.top, open, shown, trackNativeAnchor, viewport, width]);

  useEffect(() => {
    if (!open || !trackNativeAnchor) return;
    const timeout = setTimeout(() => setFallbackReady(true), POPOVER_ANCHOR_WAIT_MS);
    return () => clearTimeout(timeout);
  }, [open, trackNativeAnchor]);

  useEffect(() => {
    afterDismissRef.current = onAfterDismiss;
  }, [onAfterDismiss]);

  useLayoutEffect(() => {
    openRef.current = open;
    if (!open) {
      focusedOnOpen.current = false;
      setShown(false);
      setMeasuredAnchor(undefined);
      setViewport(undefined);
      setNativeViewport(undefined);
      setPanelHeight(0);
      setFallbackReady(false);
    }
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
  const viewportWidth = nativeViewport?.frame.width ?? viewport?.width ?? width;
  const viewportHeight = nativeViewport?.frame.height ?? viewport?.height ?? height;
  const viewportInsets = nativeViewport?.insets ?? insets;
  // On Android both native frames are relative to their full-screen window decor.
  const anchor = trackNativeAnchor
    ? nativeAnchor && nativeViewport && {
        ...nativeAnchor,
        x: nativeAnchor.x - nativeViewport.frame.x,
        y: nativeAnchor.y - nativeViewport.frame.y,
      }
    : measuredAnchor;
  const panelWidth = Math.max(1, Math.min(popoverMaxWidth, viewportWidth - viewportInsets.left - viewportInsets.right - 32));
  const rightEdge = viewportWidth - viewportInsets.right - 16;
  const leftEdge = viewportInsets.left + 16;
  const topEdge = viewportInsets.top + 12;
  const bottomEdge = viewportHeight - viewportInsets.bottom - 12;
  let popoverPosition: ViewProps["style"];
  if (kind === "popover" && anchor) {
    const indicatedLeft = align === "start"
      ? anchor.x
      : align === "end" ? anchor.x + anchor.width - panelWidth : anchor.x + (anchor.width - panelWidth) / 2;
    const offset = placement.sideOffset ?? 4;
    const below = Math.max(topEdge, anchor.y + anchor.height + offset);
    const above = Math.min(bottomEdge, anchor.y - offset);
    const belowSpace = bottomEdge - below;
    const aboveSpace = above - topEdge;
    const showAbove = (panelHeight > belowSpace || belowSpace < 140) && aboveSpace > belowSpace;
    popoverPosition = {
      position: "absolute",
      width: panelWidth,
      left: Math.max(leftEdge, Math.min(rightEdge - panelWidth, indicatedLeft)),
      ...(showAbove ? { bottom: viewportHeight - above } : { top: below }),
      maxHeight: Math.max(1, showAbove ? aboveSpace : belowSpace),
    };
  }

  const panelReady = !trackNativeAnchor || Boolean(popoverPosition) || fallbackReady;
  useEffect(() => {
    if (!open || !shown || !panelReady || focusedOnOpen.current) return;
    const frame = requestAnimationFrame(() => {
      if (!openRef.current) return;
      focusedOnOpen.current = true;
      if (initialFocusRef?.current) {
        focusTarget(initialFocusRef.current);
      } else if (!dismissDisabled) {
        focusTarget(closeRef.current);
      } else if (headingRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(headingRef.current, "focus");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [dismissDisabled, initialFocusRef, open, panelReady, shown]);

  const viewportContent = (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" && kind !== "popover" ? "padding" : undefined}
      pointerEvents="box-none"
      onLayout={kind === "popover" && !trackNativeAnchor ? ({ nativeEvent: { layout } }) => {
        if (layout.width > 0 && layout.height > 0) setViewport({ width: layout.width, height: layout.height });
      } : undefined}
      style={[
        styles.viewport,
        kind === "sheet" && styles.viewportSheet,
        { paddingTop: viewportInsets.top + 16, paddingBottom: kind === "sheet" ? 0 : viewportInsets.bottom + 16 },
        { paddingLeft: viewportInsets.left + (kind === "sheet" ? 0 : 16), paddingRight: viewportInsets.right + (kind === "sheet" ? 0 : 16) },
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
      {panelReady ? (
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
      ) : null}
    </KeyboardAvoidingView>
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => { if (openRef.current) setShown(true); }}
      onDismiss={onNativeDismiss}
      onRequestClose={() => dismiss("back")}
    >
      {trackNativeAnchor ? (
        <SafeAreaListener
          accessible={false}
          collapsable={false}
          pointerEvents="box-none"
          onChange={({ frame, insets }) => {
            if (openRef.current && frame.width > 0 && frame.height > 0) setNativeViewport({ frame, insets });
          }}
        >
          {viewportContent}
        </SafeAreaListener>
      ) : viewportContent}
    </Modal>
  );
}

export function SharedDialog(props: SharedDialogProps) {
  return <OverlaySurface {...props} kind="dialog" />;
}

/** Pass actions in wide-layout order so compact dialogs show the primary action first. */
export function SharedDialogFooter({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const compact = width < 640;
  const actions = Children.toArray(children);
  return (
    <View style={[styles.dialogActions, compact && styles.dialogActionsCompact]}>
      {compact ? actions.reverse() : actions}
    </View>
  );
}

export function SharedSheet(props: SharedSheetProps) {
  return <OverlaySurface {...props} kind="sheet" />;
}

export function SharedPopover(props: SharedPopoverProps) {
  return <OverlaySurface {...props} kind="popover" />;
}

const styles = StyleSheet.create({
  anchor: { flex: 0 },
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
  dialogActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  dialogActionsCompact: { flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch" },
});
