import { AccountSwitchError } from "../../../lib/auth/account-switch-contract";

// The session controller already handled cleanup for this additional login.
export class NativeAdditionalLoginError extends AccountSwitchError {}
