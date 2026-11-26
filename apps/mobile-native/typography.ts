import { Platform, type TextStyle } from "react-native";

const interRegular = "Inter-Regular";
const interMedium = "Inter-Medium";
const interSemibold = "Inter-SemiBold";
const lexendSemibold = "Lexend-SemiBold";
const lexendBold = "Lexend-Bold";

export const nativeFontSources = {
  [interRegular]: require("./assets/fonts/Inter-Regular.ttf"),
  [interMedium]: require("./assets/fonts/Inter-Medium.ttf"),
  [interSemibold]: require("./assets/fonts/Inter-SemiBold.ttf"),
  [lexendSemibold]: require("./assets/fonts/Lexend-SemiBold.ttf"),
  [lexendBold]: require("./assets/fonts/Lexend-Bold.ttf"),
};

export const nativeTypography = {
  bodyRegular: { fontFamily: interRegular, fontWeight: "400" },
  bodyMedium: { fontFamily: interMedium, fontWeight: "500" },
  bodySemibold: { fontFamily: interSemibold, fontWeight: "600" },
  headingSemibold: { fontFamily: lexendSemibold, fontWeight: "600" },
  headingBold: { fontFamily: lexendBold, fontWeight: "700" },
} as const;

// Android rounds the centered Inter line down by one pixel relative to CSS.
export const nativeControlLabelPosition = Platform.select<TextStyle>({
  android: { transform: [{ translateY: -1 }] },
});
