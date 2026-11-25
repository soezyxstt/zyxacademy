"use client";

import { createContext, useContext } from "react";

export type OnboardingTourContextValue = {
  /** Includes the initial account-state read, so other first-use prompts wait. */
  blocking: boolean;
  active: boolean;
  available: boolean;
  restart: () => void;
  /** The permission control waits for the device result before offering Done. */
  notificationStep?: { complete: () => void };
};

export const OnboardingTourContext = createContext<OnboardingTourContextValue>({
  blocking: false,
  active: false,
  available: false,
  restart: () => {},
});

export function useOnboardingTour() {
  return useContext(OnboardingTourContext);
}
