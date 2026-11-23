package com.zyx.academy;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.core.graphics.Insets;
import org.junit.Test;

public class SystemBarInsetsTest {

    @Test
    public void appliesStatusBarAndNavigationBarMargins() {
        Insets bars = Insets.of(0, 96, 0, 48);
        Insets ime = Insets.NONE;

        MainActivity.WebViewMargins margins = MainActivity.computeWebViewMargins(bars, ime);
        assertEquals(0, margins.left);
        assertEquals(96, margins.top);
        assertEquals(0, margins.right);
        assertEquals(48, margins.bottom);
    }

    @Test
    public void prefersKeyboardInsetOverNavigationBarWhenImeVisible() {
        Insets bars = Insets.of(24, 108, 24, 48);
        Insets ime = Insets.of(0, 0, 0, 720);

        MainActivity.WebViewMargins margins = MainActivity.computeWebViewMargins(bars, ime);
        assertEquals(24, margins.left);
        assertEquals(108, margins.top);
        assertEquals(24, margins.right);
        assertEquals(720, margins.bottom);
    }

    @Test
    public void clampsNegativeInsetsToZero() {
        Insets bars = Insets.of(-10, -5, -1, -2);
        Insets ime = Insets.of(0, 0, 0, -20);

        MainActivity.WebViewMargins margins = MainActivity.computeWebViewMargins(bars, ime);
        assertEquals(0, margins.left);
        assertEquals(0, margins.top);
        assertEquals(0, margins.right);
        assertEquals(0, margins.bottom);
    }

    @Test
    public void validatesUpdaterApkDownloadUrlAndRedirectHosts() {
        assertTrue(ZyxAppUpdaterPlugin.isAllowedDownloadUrl(
            "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.1.0-alpha.1-nightly.20261121.d36d955/zyx-academy-nightly.apk"
        ));
        assertFalse(ZyxAppUpdaterPlugin.isAllowedDownloadUrl("https://evil.com/fake.apk"));
        assertFalse(ZyxAppUpdaterPlugin.isAllowedDownloadUrl(
            "https://github.com/soezyxstt/zyxacademy/releases/download/app-v0.1.0/not-an-apk.zip"
        ));
        assertFalse(ZyxAppUpdaterPlugin.isAllowedDownloadUrl(
            "https://github.com/soezyxstt/zyxacademy/releases/download/../../../../attacker/repo/releases/download/v1/malware.apk"
        ));
        assertFalse(ZyxAppUpdaterPlugin.isAllowedDownloadUrl(
            "https://github.com/soezyxstt/zyxacademy/releases/download/v1/script.sh?x=.apk"
        ));
        assertFalse(ZyxAppUpdaterPlugin.isAllowedDownloadUrl(
            "https://github.com/soezyxstt/zyxacademy/releases/download/v1/script.sh#.apk"
        ));

        assertTrue(ZyxAppUpdaterPlugin.isAllowedRedirectHost("github.com"));
        assertTrue(ZyxAppUpdaterPlugin.isAllowedRedirectHost("objects.githubusercontent.com"));
        assertTrue(ZyxAppUpdaterPlugin.isAllowedRedirectHost("release-assets.githubusercontent.com"));
        assertFalse(ZyxAppUpdaterPlugin.isAllowedRedirectHost("raw.githubusercontent.com"));
        assertFalse(ZyxAppUpdaterPlugin.isAllowedRedirectHost("evil.com"));
        assertFalse(ZyxAppUpdaterPlugin.isAllowedRedirectHost("github.com.evil.com"));
    }

    @Test
    public void hashesOfflineReadingKeysSafelyWithoutPathTraversal() {
        String safeName = ZyxOfflineStorePlugin.keyToFileName("u1::course-1::../etc/passwd");
        assertTrue(safeName != null && safeName.matches("^[0-9a-f]{64}\\.json$"));
        assertEquals(safeName, ZyxOfflineStorePlugin.keyToFileName("u1::course-1::../etc/passwd"));
        assertEquals(null, ZyxOfflineStorePlugin.keyToFileName(""));
        assertEquals(null, ZyxOfflineStorePlugin.keyToFileName(null));
    }
}
