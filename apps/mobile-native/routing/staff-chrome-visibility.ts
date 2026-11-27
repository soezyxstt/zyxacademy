import { createContext, useContext, useLayoutEffect } from "react";

type StaffVisibility = { hideTop?: boolean; hideBottom?: boolean };
export const defaultStaffVisibility: StaffVisibility = {};
export const StaffNavVisibility = createContext<((visibility: StaffVisibility) => void) | null>(null);

export function useStaffChromeVisibility({ hideTop, hideBottom }: StaffVisibility) {
  const setVisibility = useContext(StaffNavVisibility);
  useLayoutEffect(() => {
    if (!setVisibility) return;
    setVisibility({ hideTop, hideBottom });
    return () => setVisibility(defaultStaffVisibility);
  }, [hideTop, hideBottom, setVisibility]);
}
