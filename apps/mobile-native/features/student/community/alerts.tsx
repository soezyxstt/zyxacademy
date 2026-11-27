import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { useNativeAppearance } from "../../../device/appearance";
import { nativeTypography } from "../../../typography";

const AlertContext = createContext<((message: string) => void) | null>(null);
export const useStudentAlert = () => useContext(AlertContext);

export function StudentAlerts({ children, theme }: { children: ReactNode; theme: keyof typeof nativeColors }) {
  const { width } = useWindowDimensions();
  const { toastPosition } = useNativeAppearance();
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const announce = useCallback((next: string) => {
    clearTimeout(timer.current);
    setMessage(next);
    timer.current = setTimeout(() => setMessage(""), 5000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [vertical, horizontal] = (width < 768 ? "top-right" : toastPosition).split("-");
  const colors = nativeColors[theme];
  return <AlertContext.Provider value={announce}><View style={{ flex: 1 }}>
    {children}
    {message ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={{
      position: "absolute", left: 12, right: 12, ...(vertical === "top" ? { top: 12 } : { bottom: 12 }),
      alignItems: horizontal === "left" ? "flex-start" : horizontal === "center" ? "center" : "flex-end",
    }}><Text style={{ ...nativeTypography.bodyRegular, fontSize: 14, color: colors.foreground, backgroundColor: colors.card,
      borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 12, maxWidth: 360 }}>{message}</Text></View> : null}
  </View></AlertContext.Provider>;
}
