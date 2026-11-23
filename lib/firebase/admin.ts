/**
 * lib/firebase/admin.ts
 *
 * Firebase Admin SDK singleton for server-side use.
 * Must only be imported in API routes, Server Actions, or server-side lib files.
 * NEVER import this in client components.
 *
 * Service account credentials are read from FIREBASE_SERVICE_ACCOUNT_JSON,
 * which should be a base64-encoded JSON string of the service account key file
 * downloaded from: Firebase Console → Project Settings → Service Accounts.
 *
 * To encode:  btoa(JSON.stringify(serviceAccountJson))  (or on CLI: base64 key.json)
 */

import { getApps, initializeApp, cert, type App, type ServiceAccount } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";

// ─── Singleton guard ──────────────────────────────────────────────────────────

let _adminApp: App | null = null;

/**
 * Returns the initialised Firebase Admin app.
 * Creates a new instance only if one does not already exist.
 * Throws a descriptive error if required env vars are missing.
 */
export function getAdminApp(): App {
  if (_adminApp) return _adminApp;

  // Prefer the already-initialized app if hot reloading in dev
  const existingApps = getApps();
  if (existingApps.length > 0) {
    _adminApp = existingApps[0]!;
    return _adminApp;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJson) {
    throw new Error(
      "[Firebase Admin] FIREBASE_SERVICE_ACCOUNT_JSON env var is not set. " +
        "Set it to the base64-encoded service account JSON from Firebase Console → " +
        "Project Settings → Service Accounts → Generate new private key."
    );
  }

  let credential: ServiceAccount;
  try {
    // Decode base64 → JSON string → object
    const decoded = Buffer.from(serviceAccountJson, "base64").toString("utf-8");
    credential = JSON.parse(decoded) as ServiceAccount;
  } catch {
    throw new Error(
      "[Firebase Admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON. " +
        "Ensure it is a valid base64-encoded service account JSON string."
    );
  }

  _adminApp = initializeApp({
    credential: cert(credential),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });

  return _adminApp;
}

/**
 * Returns true when FIREBASE_SERVICE_ACCOUNT_JSON is set and parses as valid
 * base64-encoded JSON credentials.
 */
export function isFirebaseAdminConfigured(
  envSource: Record<string, string | undefined> = process.env,
): boolean {
  const serviceAccountJson = envSource.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!serviceAccountJson) return false;
  try {
    const decoded = Buffer.from(serviceAccountJson, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return Boolean(parsed && typeof parsed === "object" && (parsed.private_key || parsed.privateKey));
  } catch {
    return false;
  }
}

/**
 * Returns the Firebase Admin Messaging instance.
 * Use this to send push notifications from the server.
 */
export function adminMessaging(): Messaging {
  return getMessaging(getAdminApp());
}
