"use client";

import { useEffect } from "react";
import { registerOfflineServiceWorker } from "@/lib/offline/register-sw";

export function OfflineShellRegister() {
  useEffect(() => {
    void registerOfflineServiceWorker();
  }, []);

  return null;
}
