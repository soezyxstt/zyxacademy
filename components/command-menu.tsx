"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { SearchItem } from "./command-menu-dialog";

export type { SearchItem };

export type CommandMenuContextValue = {
  open?: boolean;
  setOpen: (open: boolean) => void;
};

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

export function useCommandMenu() {
  const ctx = useContext(CommandMenuContext);
  if (!ctx) {
    return { open: false, setOpen: () => {} };
  }
  return ctx;
}

const CommandMenuDialog = dynamic(
  () =>
    import("./command-menu-dialog").then((mod) => mod.CommandMenuDialog),
  {
    ssr: false,
    loading: () => null,
  }
);

export function CommandMenuProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Global Ctrl+K / Cmd+K shortcut listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("[data-cmdk-ignore-shortcut]")) return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandMenuContext.Provider value={{ open, setOpen }}>
      {children}
      {open && <CommandMenuDialog open={open} onOpenChange={setOpen} />}
    </CommandMenuContext.Provider>
  );
}
