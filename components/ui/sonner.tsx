"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { AlertCircle, AlertTriangle, CircleCheck, Info, Loader2, X } from "lucide-react";
import { DEFAULT_APPEARANCE_PREFERENCES } from "@/lib/appearance-preferences";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ className, icons, ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={className ? `zyx-toaster ${className}` : "zyx-toaster"}
      position={DEFAULT_APPEARANCE_PREFERENCES.toastPosition}
      icons={{
        success: <CircleCheck aria-hidden="true" />,
        info: <Info aria-hidden="true" />,
        warning: <AlertTriangle aria-hidden="true" />,
        error: <AlertCircle aria-hidden="true" />,
        loading: <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />,
        close: <X aria-hidden="true" />,
        ...icons,
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
