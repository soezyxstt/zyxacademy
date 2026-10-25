"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "radix-ui";
import { useTranslations } from "next-intl";

const themes = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

type ThemeMode = "sidebar" | "navbar";

export function ThemeToggle({ mode = "navbar" }: { mode?: ThemeMode }) {
  const t = useTranslations("ui");
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const _current = themes.find((t) => t.value === theme) ?? themes[2];
  const isDark = resolvedTheme === "dark";

  if (!mounted) {
    return (
      <div className={cn(mode === "sidebar" ? "flex justify-center" : "")}>
        <div className="size-8" />
      </div>
    );
  }

  const trigger = (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "relative size-8 rounded-lg transition-colors",
        mode === "sidebar" && "mx-auto"
      )}
      aria-label={t("theme.switch")}
    >
      <Sun
        className={cn(
          "size-[18px] transition-all duration-500",
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        )}
        style={{ position: isDark ? "absolute" : "relative" }}
      />
      <Moon
        className={cn(
          "size-[18px] transition-all duration-500",
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
        )}
        style={{ position: isDark ? "relative" : "absolute" }}
      />
      <span className="sr-only">{t("theme.switch")}</span>
    </Button>
  );

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[140px] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          )}
        >
          {themes.map(({ value, icon: Icon }) => (
            <DropdownMenu.Item
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body-sm outline-none transition-colors",
                "data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
                theme === value
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{t(`theme.${value}`)}</span>
              {theme === value && (
                <span className="flex size-1.5 shrink-0 rounded-full bg-primary" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
