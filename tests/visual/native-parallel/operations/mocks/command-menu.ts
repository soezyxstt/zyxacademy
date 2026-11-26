import type { ReactNode } from "react";

export function useCommandMenu() {
  return { open: false, setOpen: () => {}, openWithQuery: () => {} };
}

export function CommandMenuProvider({ children }: { children: ReactNode }) {
  return children;
}
