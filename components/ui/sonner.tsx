"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";
import { AlertCircle, AlertTriangle, CircleCheck, Info, Loader2, X } from "lucide-react";
import { DEFAULT_APPEARANCE_PREFERENCES } from "@/lib/appearance-preferences";
import {
  hapticError,
  hapticLight,
  hapticSuccess,
  hapticWarning,
} from "@/lib/native/haptics";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const toast = new Proxy(sonnerToast, {
  get(target, prop, receiver) {
    if (prop === "success") {
      return (...args: Parameters<typeof sonnerToast.success>) => {
        void hapticSuccess();
        return target.success(...args);
      };
    }
    if (prop === "warning") {
      return (...args: Parameters<typeof sonnerToast.warning>) => {
        void hapticWarning();
        return target.warning(...args);
      };
    }
    if (prop === "error") {
      return (...args: Parameters<typeof sonnerToast.error>) => {
        void hapticError();
        return target.error(...args);
      };
    }
    if (prop === "info") {
      return (...args: Parameters<typeof sonnerToast.info>) => {
        void hapticLight();
        return target.info(...args);
      };
    }
    return Reflect.get(target, prop, receiver);
  },
}) as typeof sonnerToast;

function Toaster({ className, icons, toastOptions, ...props }: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className={className ? `zyx-toaster ${className}` : "zyx-toaster"}
      position={DEFAULT_APPEARANCE_PREFERENCES.toastPosition}
      gap={8}
      icons={{
        success: <CircleCheck aria-hidden="true" />,
        info: <Info aria-hidden="true" />,
        warning: <AlertTriangle aria-hidden="true" />,
        error: <AlertCircle aria-hidden="true" />,
        loading: <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />,
        close: <X aria-hidden="true" />,
        ...icons,
      }}
      toastOptions={{
        ...toastOptions,
        classNames: {
          toast:
            "rounded-xl border border-border bg-card text-card-foreground shadow-lg transition-all duration-200 motion-reduce:transition-none",
          ...toastOptions?.classNames,
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
