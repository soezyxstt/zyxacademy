"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function BlogThumbnail({ src, sizes, className }: {
  src: string;
  sizes: string;
  className: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();

  return (
    <div aria-hidden="true" className={cn("relative overflow-hidden bg-muted", className)}>
      {failedSrc === src ? (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
          <ImageOff className="size-5" />
        </div>
      ) : (
        <Image alt="" src={src} fill sizes={sizes} className="object-cover" onError={() => setFailedSrc(src)} />
      )}
    </div>
  );
}
