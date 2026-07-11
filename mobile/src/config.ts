/**
 * App-wide constants. Mirrors android/app/build.gradle.kts of the WebView
 * wrapper: BASE_URL must be the www host (the apex 301-redirects to www and
 * a replayed POST breaks the auth token exchange), and the client ID must be
 * the backend's GOOGLE_CLIENT_ID (the server verifies the token audience).
 */
export const BASE_URL = 'https://www.zyxacademy.com';

/** Host used for same-origin checks; www prefix is stripped before compare. */
export const APP_HOST = 'zyxacademy.com';

export const GOOGLE_WEB_CLIENT_ID =
  '328240364978-lpb5qtq25uo8avbsjkptdapibon1gee6.apps.googleusercontent.com';

/**
 * Appended to the WebView user agent (Chrome UA prefix stays intact).
 * The web side detects the native app via the "ZyxApp/" marker.
 */
export const UA_MARKER = 'ZyxApp/1.0-rn (Android)';
