import { useEffect, useLayoutEffect } from "react";
import { AppState, Platform } from "react-native";

import { useNativeSession } from "../auth/session-provider";
import { scopedPhotos } from "./photo";

export function FormPhotoLifecycle() {
  const { subscribeBeforeLocalLogout } = useNativeSession();
  const discard = scopedPhotos.discardOrphanedFormCapture;

  useLayoutEffect(() => {
    if (Platform.OS === "android") return subscribeBeforeLocalLogout(discard);
  }, [discard, subscribeBeforeLocalLogout]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void discard();
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void discard();
    });
    return () => subscription.remove();
  }, [discard]);

  return null;
}
