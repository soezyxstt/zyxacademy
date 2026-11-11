"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useOpsAiContext } from "./ops-ai-context";
import type { OpsAiMessageV2 } from "./ops-ai-storage";

const LazyOpsAiPanel = dynamic(
  () => import("./ops-ai-panel").then((module) => module.OpsAiPanel),
  { ssr: false },
);

export function OpsAiDrawer(props: { initialMessages?: OpsAiMessageV2[] } = {}) {
  const { isOpen } = useOpsAiContext();
  const [hasOpened, setHasOpened] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  // Keep the panel mounted after its first opening so a stream or draft survives closing it.
  return isOpen || hasOpened ? <LazyOpsAiPanel {...props} /> : null;
}

export const OpsAiPanel = OpsAiDrawer;
export default OpsAiDrawer;
