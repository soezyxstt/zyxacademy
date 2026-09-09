"use client";

import { createContext, useContext, type ReactNode } from "react";

const DEFAULT_FORMATIVE_CHECK_ENDPOINT = "/api/materials/formative-check";
const FormativeCheckEndpointContext = createContext(DEFAULT_FORMATIVE_CHECK_ENDPOINT);

export function FormativeCheckEndpointProvider({
  endpointBase,
  children,
}: {
  endpointBase: string;
  children: ReactNode;
}) {
  const normalizedEndpoint = endpointBase.endsWith("/")
    ? endpointBase.slice(0, -1)
    : endpointBase;

  return (
    <FormativeCheckEndpointContext.Provider value={normalizedEndpoint}>
      {children}
    </FormativeCheckEndpointContext.Provider>
  );
}

export function useFormativeCheckEndpointBase(): string {
  return useContext(FormativeCheckEndpointContext);
}
