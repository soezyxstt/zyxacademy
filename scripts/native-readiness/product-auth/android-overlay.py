"""Constrain the disposable Expo APK to runner-local HTTPS."""

import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def apply(source: Path, certificate: Path):
    origin = source / "auth" / "session-api.ts"
    original = 'export const NATIVE_STAGING_ORIGIN = "https://staging.zyxacademy.com";'
    text = origin.read_text()
    if text.count(original) != 1:
        raise ValueError("Unexpected Expo release origin contract")

    browser = source / "auth" / "browser-login.ts"
    browser_source = browser.read_text()
    original_browser = "openBrowser: (url, redirect) => WebBrowser.openAuthSessionAsync(url, redirect),"
    if browser_source.count(original_browser) != 1:
        raise ValueError("Unexpected Expo browser handoff")
    entry = source / "auth" / "auth-entry.tsx"
    entry_source = entry.read_text()
    original_button = "disabled={!login.isAvailable}"
    if entry_source.count(original_button) != 1:
        raise ValueError("Unexpected native Google sign-in button")

    manifest = source / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
    resource = manifest.parent / "res"
    xml = resource / "xml"
    raw = resource / "raw"
    xml.mkdir(exist_ok=True)
    raw.mkdir(exist_ok=True)
    android = "http://schemas.android.com/apk/res/android"
    ET.register_namespace("android", android)
    tree = ET.parse(manifest)
    application = tree.find("application")
    attr = "{" + android + "}networkSecurityConfig"
    if application is None or attr in application.attrib:
        raise ValueError("Unexpected Android network configuration")
    application.set(attr, "@xml/native_auth_preview")
    queries = tree.find("queries")
    if queries is None:
        queries = ET.SubElement(tree.getroot(), "queries")
    ET.SubElement(queries, "package", {"{" + android + "}name": "com.android.chrome"})
    tree.write(manifest, encoding="utf-8", xml_declaration=True)
    (raw / "native_auth_preview_ca.pem").write_bytes(certificate.read_bytes())
    (xml / "native_auth_preview.xml").write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false"/>
  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <trust-anchors><certificates src="@raw/native_auth_preview_ca"/></trust-anchors>
  </domain-config>
</network-security-config>
"""
    )
    origin.write_text(text.replace(original, original.replace("https://staging.zyxacademy.com", "https://127.0.0.1:9443")))
    browser.write_text(browser_source.replace(original_browser, """openBrowser: async (url, redirect) => {
    console.info("ZYX_AUTH_PREVIEW_BROWSER_OPEN");
    try {
      return await WebBrowser.openAuthSessionAsync(url, redirect, { browserPackage: "com.android.chrome" });
    } catch (error) {
      console.warn("ZYX_AUTH_PREVIEW_BROWSER_FAILED");
      throw error;
    }
  },"""))
    entry.write_text(entry_source.replace(original_button, 'testID="native-auth-google" ' + original_button))



if __name__ == "__main__":
    if any(os.environ.get(key) != value for key, value in {
        "GITHUB_ACTIONS": "true",
        "RUNNER_ENVIRONMENT": "github-hosted",
        "NATIVE_PRODUCT_AUTH_FIXTURE": "1",
    }.items()):
        raise SystemExit("The APK overlay is restricted to the hosted auth fixture")
    apply(Path("apps/mobile-native"), Path(sys.argv[1]))
