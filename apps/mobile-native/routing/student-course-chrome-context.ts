import { createContext, useContext, useLayoutEffect } from "react";

type Visibility = { hideTop?: boolean; hideBottom?: boolean };
export const defaultStudentChromeVisibility: Visibility = {};
export const StudentChromeVisibilityContext = createContext<((visibility: Visibility) => void) | null>(null);
export const StudentCourseNavbarContext = createContext(false);

export function useHasStudentCourseNavbar() {
  return useContext(StudentCourseNavbarContext);
}

export function useStudentChromeVisibility({ hideTop, hideBottom }: Visibility) {
  const setVisibility = useContext(StudentChromeVisibilityContext);
  useLayoutEffect(() => {
    if (!setVisibility) return;
    setVisibility({ hideTop, hideBottom });
    return () => setVisibility(defaultStudentChromeVisibility);
  }, [hideTop, hideBottom, setVisibility]);
}
