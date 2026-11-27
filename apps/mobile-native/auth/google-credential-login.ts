import { requireOptionalNativeModule } from "expo";
import { fetch } from "expo/fetch";
import { Platform } from "react-native";
import { createGoogleCredentialLogin } from "./google-credential-flow";
import { createNativeSessionApi, NATIVE_STAGING_ORIGIN } from "./session-api";

type AndroidGoogle = {
  isConfigured(): boolean;
  pick(clientId: string, nonce: string): Promise<unknown>;
  cancel(): Promise<void>;
  clearCredentialState(): Promise<boolean>;
};

const android = Platform.OS === "android"
  ? requireOptionalNativeModule<AndroidGoogle>("ZyxAndroidGoogle") : null;
const api = createNativeSessionApi(NATIVE_STAGING_ORIGIN, fetch);

export const googleCredentialLogin = createGoogleCredentialLogin({
  isConfigured: () => {
    try { return android?.isConfigured() === true; } catch { return false; }
  },
  pick: (clientId, nonce) => android?.pick(clientId, nonce) ?? Promise.resolve(null),
  cancelPicker: async () => { await android?.cancel(); },
  fetcher: fetch,
  revoke: api.revoke,
});

export function clearAndroidGoogleCredentialState() {
  void android?.clearCredentialState().catch(() => {});
}
