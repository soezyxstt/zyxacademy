/**
 * lib/well-known/mobile-links.ts
 *
 * Pure builders for Android Digital Asset Links (`/.well-known/assetlinks.json`)
 * and Apple App Site Association (`/.well-known/apple-app-site-association`).
 */

import expoStagingAppLinks from "../../packages/native-session/expo-staging-app-links.json";

const SHA256_FINGERPRINT_RE = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const APPLE_TEAM_ID_RE = /^[A-Z0-9]{10}$/;
const APPLE_APP_ID_RE = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/;

export const ANDROID_STABLE_PACKAGE = "com.zyx.academy";
export const ANDROID_NIGHTLY_PACKAGE = "com.zyx.academy.nightly";
export const IOS_STABLE_BUNDLE_ID = "com.zyx.academy";
export const IOS_NIGHTLY_BUNDLE_ID = "com.zyx.academy.nightly";

export interface AndroidAssetLinkStatement {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

export interface AppleAppSiteAssociationComponent {
  "/"?: string;
  exclude?: boolean;
  comment?: string;
}

export interface AppleAppSiteAssociation {
  applinks: {
    details: Array<{
      appIDs: string[];
      components: AppleAppSiteAssociationComponent[];
    }>;
  };
}

export function parseSha256Fingerprints(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const normalized = part.trim().toUpperCase();
    if (!SHA256_FINGERPRINT_RE.test(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function buildAndroidAssetLinks(envInput: {
  stableFingerprints?: string;
  nightlyFingerprints?: string;
  expoStagingFingerprints?: string;
  configuredOrigin?: string;
  requestOrigin?: string;
  environment?: string;
} = {}): AndroidAssetLinkStatement[] {
  const stable = parseSha256Fingerprints(
    envInput.stableFingerprints ?? process.env.ANDROID_APP_LINKS_SHA256_FINGERPRINTS,
  );
  const nightly = parseSha256Fingerprints(
    envInput.nightlyFingerprints ?? process.env.ANDROID_APP_LINKS_NIGHTLY_SHA256_FINGERPRINTS,
  );

  const statements: AndroidAssetLinkStatement[] = [];
  if (stable.length > 0) {
    statements.push({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_STABLE_PACKAGE,
        sha256_cert_fingerprints: stable,
      },
    });
  }
  if (nightly.length > 0) {
    statements.push({
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_NIGHTLY_PACKAGE,
        sha256_cert_fingerprints: nightly,
      },
    });
  }
  if (envInput.configuredOrigin === expoStagingAppLinks.origin && envInput.requestOrigin === expoStagingAppLinks.origin &&
    (envInput.environment === undefined || envInput.environment === "staging")) {
    const expo = parseSha256Fingerprints(envInput.expoStagingFingerprints ?? process.env.ANDROID_APP_LINKS_EXPO_STAGING_SHA256_FINGERPRINTS);
    if (expo.length > 0) {
      statements.push({
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: expoStagingAppLinks.androidPackage,
          sha256_cert_fingerprints: expo,
        },
      });
    }
  }
  return statements;
}

export const UNIVERSAL_LINK_COMPONENTS: AppleAppSiteAssociationComponent[] = [
  { "/": "/api/*", exclude: true, comment: "Exclude API endpoints" },
  { "/": "/auth/*", exclude: true, comment: "Exclude native auth web handoff" },
  { "/": "/_next/*", exclude: true, comment: "Exclude Next.js internal assets" },
  { "/": "/sign-in*", exclude: true, comment: "Exclude sign-in route" },
  { "/": "/sign-up*", exclude: true, comment: "Exclude sign-up route" },
  { "/": "/sign-out*", exclude: true, comment: "Exclude sign-out route" },
  { "/": "/courses", comment: "Course catalog" },
  { "/": "/courses/*", comment: "Course materials, discussions, and schedules" },
  { "/": "/discussions", comment: "Discussions workspace" },
  { "/": "/discussions/*", comment: "Discussions subroutes" },
  { "/": "/dashboard/discussions", comment: "Student discussions" },
  { "/": "/dashboard/discussions/*", comment: "Student discussions subroutes" },
  { "/": "/calendar", comment: "Student schedule and agenda" },
  { "/": "/calendar/*", comment: "Student schedule subroutes" },
  { "/": "/tutor/discussions", comment: "Tutor discussions" },
  { "/": "/tutor/discussions/*", comment: "Tutor discussions subroutes" },
  { "/": "/tutor/*/discussions", comment: "Tutor course discussions" },
  { "/": "/tutor/schedule", comment: "Tutor schedule" },
  { "/": "/tutor/schedule/*", comment: "Tutor schedule subroutes" },
  { "/": "/admin/discussions", comment: "Admin discussions" },
  { "/": "/admin/discussions/*", comment: "Admin discussions subroutes" },
  { "/": "/admin/schedules", comment: "Admin schedules" },
  { "/": "/admin/schedules/*", comment: "Admin schedules subroutes" },
  { "/": "/meet/*", comment: "Live session links" },
];

export function buildAppleAppSiteAssociation(envInput: {
  teamId?: string;
  appIds?: string;
} = {}): AppleAppSiteAssociation {
  const explicitRaw = envInput.appIds ?? process.env.APPLE_APP_SITE_ASSOCIATION_APP_IDS;
  const appIDs: string[] = [];
  const seen = new Set<string>();

  if (explicitRaw) {
    for (const part of explicitRaw.split(",")) {
      const candidate = part.trim();
      if (APPLE_APP_ID_RE.test(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        appIDs.push(candidate);
      }
    }
  } else {
    const teamId = (envInput.teamId ?? process.env.APPLE_APP_SITE_ASSOCIATION_TEAM_ID ?? "")
      .trim()
      .toUpperCase();
    if (APPLE_TEAM_ID_RE.test(teamId)) {
      appIDs.push(`${teamId}.${IOS_STABLE_BUNDLE_ID}`);
      appIDs.push(`${teamId}.${IOS_NIGHTLY_BUNDLE_ID}`);
    }
  }

  return {
    applinks: {
      details:
        appIDs.length > 0
          ? [
              {
                appIDs,
                components: UNIVERSAL_LINK_COMPONENTS,
              },
            ]
          : [],
    },
  };
}
