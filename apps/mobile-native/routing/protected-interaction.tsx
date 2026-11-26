import { createContext, useContext } from "react";

export const ProtectedInteractionContext = createContext({ suspended: false, canInteract: () => true });

export function useProtectedInteraction() {
  return useContext(ProtectedInteractionContext);
}
