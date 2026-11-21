"use client";

import { useEffect } from "react";
import { subscribeNativeAuthDeepLinks } from "@/lib/native/auth";

export function NativeAuthListener() {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    void subscribeNativeAuthDeepLinks((finishPath) => {
      window.location.replace(finishPath);
    }).then((unsub) => {
      if (disposed) {
        unsub();
        return;
      }
      cleanup = unsub;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return null;
}
