import { createNativeIntentRedirect } from "../routing/consent-intent";

export const redirectSystemPath = createNativeIntentRedirect(async () => {
  const { randomUUID } = await import("expo-crypto");
  return randomUUID();
});
