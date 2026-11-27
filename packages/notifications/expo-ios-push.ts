import policy from "./expo-ios-push.json";

export type ExpoIosApnsEnvironment = keyof typeof policy.deviceLabels;
export const EXPO_IOS_BUNDLE_ID = policy.bundleId;
export const EXPO_IOS_APNS_DEVICES = Object.values(policy.deviceLabels);
export const EXPO_IOS_ORIGIN = policy.origin;

export function expoIosApnsEnvironment(device: unknown): ExpoIosApnsEnvironment | null {
  if (device === policy.deviceLabels.development) return "development";
  if (device === policy.deviceLabels.production) return "production";
  return null;
}

export function isExpoIosPushLabel(device: string | null | undefined) {
  return typeof device === "string" && device.trim().toLowerCase().startsWith("expo-ios");
}

export function expoIosPushRegistration(input: {
  applicationId: string | null;
  configuredEnvironment: unknown;
  provisioningEnvironment: string | null;
  storeDistribution: boolean;
}) {
  if (input.applicationId !== EXPO_IOS_BUNDLE_ID) return null;
  const environment = input.configuredEnvironment;
  if (environment !== "development" && environment !== "production") return null;
  // App Store and TestFlight re-sign the app and may omit the embedded profile.
  // A matching production build must also obtain a real native device token.
  if (input.provisioningEnvironment !== environment &&
    !(input.provisioningEnvironment === null && environment === "production" && input.storeDistribution)) return null;
  return { platform: "ios" as const, transport: "apns" as const, device: policy.deviceLabels[environment] };
}

export function isExpoIosApnsDeployment(env: Record<string, string | undefined>) {
  const origin = env.BETTER_AUTH_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim();
  return origin === EXPO_IOS_ORIGIN && (!env.ZYX_ENVIRONMENT || env.ZYX_ENVIRONMENT === "staging");
}
