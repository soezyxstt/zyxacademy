import { createContext, useContext } from "react";

export const VisibleNavbarTitle = createContext<string | undefined>(undefined);

/** A detail title stays visible when the navbar identifies a different page or course. */
export function usePageTitle(title: string): string | undefined {
  const navbarTitle = useContext(VisibleNavbarTitle);
  return navbarTitle === title ? undefined : title;
}
