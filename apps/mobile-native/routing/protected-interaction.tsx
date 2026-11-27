import { createContext, useContext } from "react";

export const ProtectedInteractionContext = createContext({ suspended: false, canInteract: (): boolean => true });

export function useProtectedInteraction() {
  return useContext(ProtectedInteractionContext);
}
