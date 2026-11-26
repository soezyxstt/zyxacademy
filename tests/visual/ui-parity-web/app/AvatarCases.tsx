"use client";

import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarPosition, invalidAvatarImage, type AvatarCaseSpec } from "@/packages/ui-parity/avatar-cases";
import portrait from "@/public/founders/adi.jpeg";

const sources = { portrait: portrait.src, invalid: invalidAvatarImage, none: undefined };

export function AvatarCase({ item }: { item: AvatarCaseSpec }) {
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  return (
    <div style={avatarPosition}>
      <Avatar role="img" aria-label={item.label} data-parity-image-status={status}>
        {sources[item.source] && (
          <AvatarImage alt="" src={sources[item.source]} onLoadingStatusChange={setStatus} />
        )}
        <AvatarFallback aria-hidden="true">{item.initials}</AvatarFallback>
      </Avatar>
    </div>
  );
}
