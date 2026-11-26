import { Platform } from "react-native";

// Android HWUI truncates offscreen layer alpha to a byte. CSS 50% lands on
// byte 128 in Chromium, so give the Android compositor that byte explicitly.
export const disabledControlStyle = { opacity: Platform.OS === "android" ? 128 / 255 : 0.5 } as const;
