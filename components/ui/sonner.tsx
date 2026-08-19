"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { CircleCheck, Info, AlertTriangle, AlertCircle, Loader2 } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      icons={{
        success: <CircleCheck className="size-4 text-status-success shrink-0" />,
        info: <Info className="size-4 text-status-info shrink-0" />,
        warning: <AlertTriangle className="size-4 text-status-warning shrink-0" />,
        error: <AlertCircle className="size-4 text-status-error shrink-0" />,
        loading: <Loader2 className="size-4 text-muted-foreground animate-spin shrink-0" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-lg group-[.toaster]:font-sans",
          title: "text-body-sm font-sans font-semibold text-foreground",
          description: "group-[.toast]:text-muted-foreground text-body-sm font-sans",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground text-body-sm font-sans font-semibold hover:opacity-90 transition-opacity",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground text-body-sm font-sans font-semibold hover:opacity-90 transition-opacity",
          closeButton:
            "group-[.toast]:bg-card group-[.toast]:border-border group-[.toast]:text-muted-foreground hover:group-[.toast]:text-foreground transition-colors",
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
