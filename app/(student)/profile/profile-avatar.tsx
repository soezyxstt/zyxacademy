"use client";

import { useState } from "react";

export function ProfileAvatar({ image, name }: { image?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);

  if (image && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name}
        className="size-full rounded-full border-2 border-background object-cover ring-2 ring-brand-primary/20"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span aria-hidden="true" className="flex size-full items-center justify-center rounded-full bg-primary text-h5 font-bold text-primary-foreground">
      {name?.charAt(0)?.toUpperCase() || "?"}
    </span>
  );
}
