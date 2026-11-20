import type { ReactNode } from "react";
import { getZyraChatSkin } from "@/lib/gamification/zyra-cosmetics";
import { cn } from "@/lib/utils";
import "./zyra-cosmetics.css";

export type ZyraBubbleSkinProps = {
  skinId?: string | null;
  children: ReactNode;
  className?: string;
  role?: "user" | "assistant";
};

/** Does not own message padding, Markdown, actions, or chat semantics. */
export function ZyraBubbleSkin({ skinId, children, className, role = "assistant" }: ZyraBubbleSkinProps) {
  const skin = getZyraChatSkin(skinId);
  return <div className={cn(skin && "zyra-bubble-skin", className)} data-zyra-skin={skin?.motif} data-message-role={role}>
    {skin && <span aria-hidden="true" className="zyra-bubble-skin__trim"><i /><i /><i /></span>}
    <div className={skin ? "zyra-bubble-skin__content" : undefined}>{children}</div>
  </div>;
}
