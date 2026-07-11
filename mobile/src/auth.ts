import { GoogleSignin } from '@react-native-google-signin/google-signin';
import CookieManager from '@react-native-cookies/cookies';
import { BASE_URL, GOOGLE_WEB_CLIENT_ID } from './config';

/**
 * Auth strategy, ported from the WebView wrapper's AuthManager.kt:
 * Google OAuth cannot run inside a WebView (disallowed_useragent), so:
 * 1. Native Google sign-in produces an ID token.
 * 2. Token is exchanged at Better Auth's /api/auth/sign-in/social endpoint.
 * 3. RN's fetch on Android stores Set-Cookie into android.webkit.CookieManager,
 *    which react-native-webview shares, so the WebViews are signed in too.
 */
GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });

/** Full sign-in: returns true when a session cookie is in place. */
export async function signInWithGoogle(): Promise<boolean> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result: any = await GoogleSignin.signIn();
  if (result?.type === 'cancelled') return false;
  // v13+ returns { type, data: { idToken } }; older versions return { idToken }
  const idToken: string | undefined = result?.data?.idToken ?? result?.idToken;
  if (!idToken) return false;
  return exchangeIdToken(idToken);
}

async function exchangeIdToken(idToken: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ provider: 'google', idToken: { token: idToken } }),
  });
  if (!res.ok) {
    console.warn('ZyxAuth exchange failed:', res.status, await res.text());
    return false;
  }
  await CookieManager.flush(); // persist so the session survives process death
  return true;
}

/** Session probe used by the boot gate; mirrors proxy.ts server-side check. */
export async function hasValidSession(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/get-session`, {
      credentials: 'include',
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('"user"');
  } catch {
    return false;
  }
}

export async function signOutEverywhere(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // best effort; local cleanup below still runs
  }
  try {
    await GoogleSignin.signOut();
  } catch {
    // not signed in natively; ignore
  }
  await CookieManager.clearAll(true);
}
