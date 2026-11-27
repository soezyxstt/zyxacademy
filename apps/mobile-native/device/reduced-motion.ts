import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

import { useNativeAppearance } from "./appearance";

export function useReducedMotion() {
  const { animations } = useNativeAppearance();
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let applyInitialPreference = true;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      applyInitialPreference = false;
      setReduceMotion(enabled);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (applyInitialPreference) setReduceMotion(enabled);
    }, () => undefined);

    return () => {
      applyInitialPreference = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion || !animations;
}
