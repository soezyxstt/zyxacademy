import { createContext, useContext } from "react";

export const NativeTourEvents = createContext<((event: string) => void) | null>(null);
export function useTourEvent() { return useContext(NativeTourEvents); }
